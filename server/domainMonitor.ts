import * as os from "os";
import { storage } from "./storage";
import { sendDomainInactiveEmail, sendSharedDomainInactiveEmail } from "./email";
import {
  OFFICIAL_CNAME,
  lastManualVerifyResults,
  verifyDomainDNS,
  VerifyResult,
} from "./domainUtils";

const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Kill-switch: monitor keeps running + logging, but never writes isActive=false ──
const DISABLE_AUTO_DEACTIVATION = process.env.DISABLE_DOMAIN_AUTO_DEACTIVATION === "true";

// ──────────────────────────────────────────────────────────────
// THRESHOLD CONFIGURATION
// ──────────────────────────────────────────────────────────────
// Transient failures do NOT increment the counter.
// Only confirmed permanent failures (mismatch / permanent errorType) count.
const CONSECUTIVE_FAILURES_TO_DEACTIVATE = 3;

// ──────────────────────────────────────────────────────────────
// IN-MEMORY CONSECUTIVE FAILURE COUNTERS
// ──────────────────────────────────────────────────────────────
const consecutiveFailures = new Map<string, number>();

export function resetConsecutiveFailures(domainType: "user" | "shared", domainId: number): void {
  consecutiveFailures.delete(`${domainType}:${domainId}`);
}

// ──────────────────────────────────────────────────────────────
// STRUCTURED STATE-CHANGE LOGGER
// ──────────────────────────────────────────────────────────────
function logStateChange(params: {
  domain: string;
  domainId: number;
  domainType: "user" | "shared";
  source: "monitor" | "admin_verify" | "user_verify" | "create_flow" | "restore_flow";
  previousState: { isActive?: boolean; isVerified?: boolean; sslStatus?: string };
  newState: { isActive?: boolean; isVerified?: boolean; sslStatus?: string };
  OFFICIAL_CNAME_value: string;
  resolver?: string;
  error?: string;
  errorType?: string;
}) {
  const changed =
    params.previousState.isActive !== params.newState.isActive ||
    params.previousState.isVerified !== params.newState.isVerified ||
    params.previousState.sslStatus !== params.newState.sslStatus;

  console.log(JSON.stringify({
    event: "DOMAIN_STATE_CHANGE",
    changed,
    ...params,
    processPid: process.pid,
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  }));
}

// ──────────────────────────────────────────────────────────────
// DIVERGENCE DETECTION
// ──────────────────────────────────────────────────────────────
function checkDivergence(subdomain: string, result: VerifyResult) {
  const lastManual = lastManualVerifyResults.get(subdomain);
  if (!lastManual) return;

  const manualWasRecent = (Date.now() - lastManual.timestamp.getTime()) < 30 * 60 * 1000;
  const divergent = !result.verified && lastManual.verified && manualWasRecent;

  if (divergent) {
    console.log(JSON.stringify({
      event: "DIVERGENT_DNS_VALIDATION",
      severity: "CRITICAL",
      domain: subdomain,
      monitorResult: { verified: result.verified, error: result.error, errorType: result.errorType, resolver: result.resolverUsed },
      manualResult: { verified: lastManual.verified, source: lastManual.source, ageMinutes: Math.floor((Date.now() - lastManual.timestamp.getTime()) / 60000) },
      OFFICIAL_CNAME_monitor: OFFICIAL_CNAME,
      processPid: process.pid,
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      message: "ALERT: Monitor says FAILED but recent manual verify says OK — possible DNS inconsistency or resolver discrepancy",
    }));
  }
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function incrementFailure(key: string): number {
  const count = (consecutiveFailures.get(key) ?? 0) + 1;
  consecutiveFailures.set(key, count);
  return count;
}

function resetFailure(key: string): void {
  consecutiveFailures.delete(key);
}

// ──────────────────────────────────────────────────────────────
// STATS
// ──────────────────────────────────────────────────────────────
let isRunning = false;
let lastRunAt: Date | null = null;
let schedulerStarted = false;

export interface DnsMonitorStats {
  schedulerActive: boolean;
  isRunning: boolean;
  lastRunAt: string | null;
  domainsWithActiveFailures: number;
  totalFailureEntries: number;
  autoDeactivationDisabled: boolean;
  OFFICIAL_CNAME: string;
}

export function getDnsMonitorStats(): DnsMonitorStats {
  const entries = [...consecutiveFailures.values()];
  return {
    schedulerActive: schedulerStarted,
    isRunning,
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    domainsWithActiveFailures: entries.filter(v => v > 0).length,
    totalFailureEntries: entries.reduce((sum, v) => sum + v, 0),
    autoDeactivationDisabled: DISABLE_AUTO_DEACTIVATION,
    OFFICIAL_CNAME,
  };
}

// ──────────────────────────────────────────────────────────────
// MAIN CHECK LOOP
// ──────────────────────────────────────────────────────────────
async function checkAllDomains() {
  if (isRunning) {
    console.log("[DOMAIN MONITOR] Previous check still running, skipping...");
    return;
  }

  isRunning = true;
  lastRunAt = new Date();

  console.log(JSON.stringify({
    event: "MONITOR_CYCLE_START",
    OFFICIAL_CNAME,
    CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set — fallback: clerion.app)",
    DISABLE_AUTO_DEACTIVATION,
    processPid: process.pid,
    hostname: os.hostname(),
    NODE_ENV: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }));

  try {
    const userDomains = await storage.getAllUserDomains();
    const sharedDomains = await storage.getAllSharedDomainsForMonitoring();

    console.log(`[DOMAIN MONITOR] Checking ${userDomains.length} user domains and ${sharedDomains.length} shared domains`);

    // ── USER DOMAINS ──────────────────────────────────────────
    for (const domain of userDomains) {
      const key = `user:${domain.id}`;
      try {
        const result = await verifyDomainDNS(domain.subdomain, "monitor");
        const now = new Date();

        if (result.verified) {
          resetFailure(key);
          if (!domain.isActive || !domain.isVerified) {
            logStateChange({
              domain: domain.subdomain,
              domainId: domain.id,
              domainType: "user",
              source: "restore_flow",
              previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
              newState: { isActive: true, isVerified: true },
              OFFICIAL_CNAME_value: OFFICIAL_CNAME,
              resolver: result.resolverUsed,
            });
            await storage.updateDomain(domain.id, {
              isActive: true,
              isVerified: true,
              lastCheckedAt: now,
              lastVerificationError: null,
            });
            console.log(`[DOMAIN MONITOR] ✓ Domain restored: ${domain.subdomain}`);
          } else {
            await storage.updateDomain(domain.id, { lastCheckedAt: now });
          }
        } else {
          checkDivergence(domain.subdomain, result);

          // Transient failures do NOT increment the deactivation counter
          if (result.allTransient) {
            console.log(JSON.stringify({
              event: "MONITOR_TRANSIENT_FAILURE",
              domain: domain.subdomain,
              error: result.error,
              resolver: result.resolverUsed,
              timestamp: new Date().toISOString(),
              note: "Transient DNS failure — counter NOT incremented, domain kept active",
            }));
            await storage.updateDomain(domain.id, {
              lastCheckedAt: now,
              lastVerificationError: `[DNS instável] ${result.error}`,
            });
          } else {
            const failures = incrementFailure(key);

            if (failures < CONSECUTIVE_FAILURES_TO_DEACTIVATE) {
              const label = `${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE}`;
              console.log(`[DOMAIN MONITOR] ⚠ Domain check failed (${label} — keeping active): ${domain.subdomain} — ${result.error}`);
              await storage.updateDomain(domain.id, {
                lastCheckedAt: now,
                lastVerificationError: `[${label} falhas] ${result.error}`,
              });
            } else {
              if (DISABLE_AUTO_DEACTIVATION) {
                console.log(JSON.stringify({
                  event: "AUTO_DEACTIVATION_BLOCKED",
                  reason: "DISABLE_DOMAIN_AUTO_DEACTIVATION=true",
                  domain: domain.subdomain,
                  domainId: domain.id,
                  domainType: "user",
                  consecutiveFailures: failures,
                  error: result.error,
                  errorType: result.errorType,
                  OFFICIAL_CNAME,
                  timestamp: new Date().toISOString(),
                }));
                await storage.updateDomain(domain.id, {
                  lastCheckedAt: now,
                  lastVerificationError: `[BLOQUEADO — ${failures} falhas] ${result.error}`,
                });
              } else {
                console.log(`[DOMAIN MONITOR] ✗ Deactivating domain after ${failures} consecutive permanent failures: ${domain.subdomain}`);

                logStateChange({
                  domain: domain.subdomain,
                  domainId: domain.id,
                  domainType: "user",
                  source: "monitor",
                  previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
                  newState: { isActive: false, isVerified: false },
                  OFFICIAL_CNAME_value: OFFICIAL_CNAME,
                  resolver: result.resolverUsed,
                  error: result.error,
                  errorType: result.errorType,
                });

                await storage.updateDomain(domain.id, {
                  isActive: false,
                  isVerified: false,
                  lastCheckedAt: now,
                  lastVerificationError: result.error || "DNS verification failed",
                });

                const shouldNotify =
                  !domain.lastInactiveNotificationAt ||
                  now.getTime() - new Date(domain.lastInactiveNotificationAt).getTime() > NOTIFICATION_COOLDOWN_MS;

                if (shouldNotify) {
                  const offers = await storage.getOffersByDomainId(domain.id);
                  if (offers.length > 0) {
                    const owner = await storage.getUser(domain.userId);
                    if (owner) {
                      const firstName = owner.firstName || owner.email.split("@")[0];
                      await storage.createNotification({
                        userId: domain.userId,
                        type: "domain_inactive",
                        titlePt: "Domínio Inativo Detectado",
                        titleEn: "Inactive Domain Detected",
                        messagePt: `Olá ${firstName}, o domínio ${domain.subdomain} foi identificado como inativo. Verifique o apontamento CNAME para ${OFFICIAL_CNAME} no seu provedor de DNS.`,
                        messageEn: `Hello ${firstName}, the domain ${domain.subdomain} was identified as inactive. Please verify the CNAME pointing to ${OFFICIAL_CNAME} at your DNS provider.`,
                      });
                      if (owner.email) {
                        sendDomainInactiveEmail(owner.email, domain.subdomain, domain.userId).catch(err => {
                          console.error(`[DOMAIN MONITOR] Failed to send domain inactive email:`, err);
                        });
                      }
                    }
                  }
                  await storage.updateDomainNotificationTimestamp(domain.id, now);
                }
              }
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`[DOMAIN MONITOR] Error checking domain ${domain.subdomain}:`, err);
      }
    }

    // ── SHARED DOMAINS ────────────────────────────────────────
    for (const domain of sharedDomains) {
      const key = `shared:${domain.id}`;
      try {
        const result = await verifyDomainDNS(domain.subdomain, "monitor");
        const now = new Date();

        if (result.verified) {
          resetFailure(key);
          if (!domain.isActive || !domain.isVerified) {
            logStateChange({
              domain: domain.subdomain,
              domainId: domain.id,
              domainType: "shared",
              source: "restore_flow",
              previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
              newState: { isActive: true, isVerified: true },
              OFFICIAL_CNAME_value: OFFICIAL_CNAME,
              resolver: result.resolverUsed,
            });
            await storage.updateSharedDomain(domain.id, {
              isActive: true,
              isVerified: true,
              lastCheckedAt: now,
              lastVerificationError: null,
            });
            console.log(`[DOMAIN MONITOR] ✓ Shared domain restored: ${domain.subdomain}`);
          } else {
            await storage.updateSharedDomain(domain.id, { lastCheckedAt: now });
          }
        } else {
          checkDivergence(domain.subdomain, result);

          if (result.allTransient) {
            console.log(JSON.stringify({
              event: "MONITOR_TRANSIENT_FAILURE",
              domain: domain.subdomain,
              domainType: "shared",
              error: result.error,
              timestamp: new Date().toISOString(),
              note: "Transient DNS failure — counter NOT incremented, domain kept active",
            }));
            await storage.updateSharedDomain(domain.id, {
              lastCheckedAt: now,
              lastVerificationError: `[DNS instável] ${result.error}`,
            });
          } else {
            const failures = incrementFailure(key);

            if (failures < CONSECUTIVE_FAILURES_TO_DEACTIVATE) {
              console.log(`[DOMAIN MONITOR] ⚠ Shared domain failed (${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} — keeping active): ${domain.subdomain} — ${result.error}`);
              await storage.updateSharedDomain(domain.id, {
                lastCheckedAt: now,
                lastVerificationError: `[${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} falhas] ${result.error}`,
              });
            } else {
              if (DISABLE_AUTO_DEACTIVATION) {
                console.log(JSON.stringify({
                  event: "AUTO_DEACTIVATION_BLOCKED",
                  reason: "DISABLE_DOMAIN_AUTO_DEACTIVATION=true",
                  domain: domain.subdomain,
                  domainId: domain.id,
                  domainType: "shared",
                  consecutiveFailures: failures,
                  error: result.error,
                  errorType: result.errorType,
                  OFFICIAL_CNAME,
                  timestamp: new Date().toISOString(),
                }));
                await storage.updateSharedDomain(domain.id, {
                  lastCheckedAt: now,
                  lastVerificationError: `[BLOQUEADO — ${failures} falhas] ${result.error}`,
                });
              } else {
                console.log(`[DOMAIN MONITOR] ✗ Deactivating shared domain after ${failures} consecutive permanent failures: ${domain.subdomain}`);

                logStateChange({
                  domain: domain.subdomain,
                  domainId: domain.id,
                  domainType: "shared",
                  source: "monitor",
                  previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
                  newState: { isActive: false, isVerified: false },
                  OFFICIAL_CNAME_value: OFFICIAL_CNAME,
                  resolver: result.resolverUsed,
                  error: result.error,
                  errorType: result.errorType,
                });

                await storage.updateSharedDomain(domain.id, {
                  isActive: false,
                  isVerified: false,
                  lastCheckedAt: now,
                  lastVerificationError: result.error || "DNS verification failed",
                });

                const shouldNotify =
                  !domain.lastInactiveNotificationAt ||
                  now.getTime() - new Date(domain.lastInactiveNotificationAt).getTime() > NOTIFICATION_COOLDOWN_MS;

                if (shouldNotify) {
                  const activeUsers = await storage.getUsersWithActiveSharedDomain(domain.id);
                  for (const user of activeUsers) {
                    const firstName = user.firstName || user.email.split("@")[0];
                    await storage.createNotification({
                      userId: user.userId,
                      type: "domain_inactive",
                      titlePt: "Domínio Compartilhado Inativo",
                      titleEn: "Shared Domain Inactive",
                      messagePt: `Olá ${firstName}, o domínio compartilhado ${domain.subdomain} foi identificado como inativo. Verifique suas ofertas para evitar erros de redirecionamento.`,
                      messageEn: `Hello ${firstName}, the shared domain ${domain.subdomain} was identified as inactive. Please check your offers to avoid redirection errors.`,
                    });
                    if (user.email) {
                      sendSharedDomainInactiveEmail(user.email, domain.subdomain, user.userId).catch(err => {
                        console.error(`[DOMAIN MONITOR] Failed to send shared domain inactive email:`, err);
                      });
                    }
                  }
                  await storage.updateSharedDomainNotificationTimestamp(domain.id, now);
                }
              }
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`[DOMAIN MONITOR] Error checking shared domain ${domain.subdomain}:`, err);
      }
    }

    console.log("[DOMAIN MONITOR] Health check completed");
  } catch (error) {
    console.error("[DOMAIN MONITOR] Error during health check:", error);
  } finally {
    isRunning = false;
  }
}

export function startDomainMonitor() {
  schedulerStarted = true;

  console.log(JSON.stringify({
    event: "DOMAIN_MONITOR_STARTED",
    OFFICIAL_CNAME,
    CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set — fallback: clerion.app)",
    DISABLE_AUTO_DEACTIVATION,
    DISABLE_DOMAIN_AUTO_DEACTIVATION_ENV: process.env.DISABLE_DOMAIN_AUTO_DEACTIVATION || "(not set)",
    CONSECUTIVE_FAILURES_TO_DEACTIVATE,
    MONITOR_INTERVAL_MS,
    processPid: process.pid,
    hostname: os.hostname(),
    NODE_ENV: process.env.NODE_ENV,
    MAIN_DOMAIN: process.env.MAIN_DOMAIN || "(not set)",
    timestamp: new Date().toISOString(),
  }));

  // Run initial check after 30 seconds
  setTimeout(() => {
    checkAllDomains();
  }, 30000);

  setInterval(() => {
    checkAllDomains();
  }, MONITOR_INTERVAL_MS);
}
