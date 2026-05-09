import dns, { Resolver } from "dns/promises";
import * as os from "os";
import { storage } from "./storage";
import { sendDomainInactiveEmail, sendSharedDomainInactiveEmail } from "./email";
import { OFFICIAL_CNAME, lastManualVerifyResults } from "./domainUtils";

const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── PARTE 6 — Kill-switch: monitor keeps running + logging, but never writes isActive=false ──
const DISABLE_AUTO_DEACTIVATION = process.env.DISABLE_DOMAIN_AUTO_DEACTIVATION === "true";

// ──────────────────────────────────────────────────────────────
// RETRY & THRESHOLD CONFIGURATION
// ──────────────────────────────────────────────────────────────
const DNS_MAX_RETRIES = 3;
const DNS_RETRY_DELAY_MS = 2000;
const CONSECUTIVE_FAILURES_TO_DEACTIVATE = 3;
const HTTP_CHECK_TIMEOUT_MS = 5000;

const TRANSIENT_DNS_ERRORS = new Set([
  "SERVFAIL",
  "ETIMEOUT",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ESERVFAIL",
  "ECONNRESET",
  "ENETUNREACH",
]);

// ──────────────────────────────────────────────────────────────
// IN-MEMORY CONSECUTIVE FAILURE COUNTERS
// ──────────────────────────────────────────────────────────────
const consecutiveFailures = new Map<string, number>();

export function resetConsecutiveFailures(domainType: "user" | "shared", domainId: number): void {
  const key = `${domainType}:${domainId}`;
  consecutiveFailures.delete(key);
}

// ──────────────────────────────────────────────────────────────
// PARTE 1 — Structured state-change logger
// Called every time isActive / isVerified / sslStatus changes
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
// PARTE 5 — Divergence detection helper
// ──────────────────────────────────────────────────────────────
function checkDivergence(subdomain: string, monitorVerified: boolean, monitorError: string | undefined, resolverName: string) {
  const lastManual = lastManualVerifyResults.get(subdomain);
  if (!lastManual) return;

  const manualWasRecent = (Date.now() - lastManual.timestamp.getTime()) < 30 * 60 * 1000; // 30 min window
  const divergent = !monitorVerified && lastManual.verified && manualWasRecent;

  if (divergent) {
    console.log(JSON.stringify({
      event: "DIVERGENT_DNS_VALIDATION",
      severity: "CRITICAL",
      domain: subdomain,
      monitorResult: { verified: monitorVerified, error: monitorError, resolver: resolverName },
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
// FALLBACK DNS RESOLVERS
// ──────────────────────────────────────────────────────────────
const cloudflareResolver = new Resolver();
cloudflareResolver.setServers(["1.1.1.1", "1.0.0.1"]);

const googleResolver = new Resolver();
googleResolver.setServers(["8.8.8.8", "8.8.4.4"]);

const DNS_RESOLVERS: Array<{ name: string; resolver: typeof dns | Resolver }> = [
  { name: "system", resolver: dns },
  { name: "cloudflare", resolver: cloudflareResolver },
  { name: "google", resolver: googleResolver },
];

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
    domainsWithActiveFailures: entries.filter((v) => v > 0).length,
    totalFailureEntries: entries.reduce((sum, v) => sum + v, 0),
    autoDeactivationDisabled: DISABLE_AUTO_DEACTIVATION,
    OFFICIAL_CNAME,
  };
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeCname(record: string): string {
  return record.trim().toLowerCase().replace(/\.$/, "");
}

function incrementFailure(key: string): number {
  const count = (consecutiveFailures.get(key) ?? 0) + 1;
  consecutiveFailures.set(key, count);
  return count;
}

function resetFailure(key: string): void {
  consecutiveFailures.delete(key);
}

// ──────────────────────────────────────────────────────────────
// PARTE 4 — DNS VERIFICATION with full resolver logging
// ──────────────────────────────────────────────────────────────
async function checkCNAMEWithResolver(
  subdomain: string,
  resolver: typeof dns | Resolver,
  resolverName: string,
): Promise<{ verified: boolean; error?: string; transient?: boolean; cnameRecords?: string[] }> {
  try {
    const cnameRecords = await (resolver as any).resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      const normalizedRecords = cnameRecords.map((r: string) => normalizeCname(r));
      const pointsToUs = normalizedRecords.some((n: string) =>
        n === OFFICIAL_CNAME || n.endsWith(`.${OFFICIAL_CNAME}`)
      );

      console.log(JSON.stringify({
        event: "DNS_RESOLVER_RESULT",
        source: "monitor",
        domain: subdomain,
        resolver: resolverName,
        cnameRecords_raw: cnameRecords,
        cnameRecords_normalized: normalizedRecords,
        expected: OFFICIAL_CNAME,
        pointsToUs,
        verdict: pointsToUs ? "VERIFIED" : "MISMATCH",
        timestamp: new Date().toISOString(),
      }));

      if (pointsToUs) {
        return { verified: true, cnameRecords };
      }
      return {
        verified: false,
        error: `CNAME points to '${cnameRecords[0]}' instead of '${OFFICIAL_CNAME}'`,
        transient: false,
        cnameRecords,
      };
    }
    return { verified: false, error: "No CNAME record configured", transient: false };
  } catch (error: any) {
    const code: string = error.code || "";
    const isTransient = TRANSIENT_DNS_ERRORS.has(code);

    console.log(JSON.stringify({
      event: "DNS_RESOLVER_ERROR",
      source: "monitor",
      domain: subdomain,
      resolver: resolverName,
      errorCode: code,
      errorMessage: error.message,
      isTransient,
      timestamp: new Date().toISOString(),
    }));

    if (code === "ENODATA") return { verified: false, error: "No CNAME record found", transient: false };
    if (code === "ENOTFOUND") return { verified: false, error: "Domain not found in DNS", transient: false };
    return { verified: false, error: `DNS error: ${code || error.message}`, transient: isTransient };
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN VERIFICATION FUNCTION
// ──────────────────────────────────────────────────────────────
async function verifyDomainDNS(
  subdomain: string,
): Promise<{ verified: boolean; error?: string; allTransient: boolean; resolverUsed?: string }> {
  console.log(JSON.stringify({
    event: "MONITOR_DNS_CHECK_START",
    source: "monitor",
    domain: subdomain,
    OFFICIAL_CNAME,
    CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set — fallback: clerion.app)",
    processPid: process.pid,
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  }));

  let lastError = "DNS check failed";
  let allTransient = true;
  let lastResolverName = "unknown";

  for (const { name, resolver } of DNS_RESOLVERS) {
    lastResolverName = name;
    for (let attempt = 1; attempt <= DNS_MAX_RETRIES; attempt++) {
      const result = await checkCNAMEWithResolver(subdomain, resolver, name);

      if (result.verified) {
        if (name !== "system" || attempt > 1) {
          console.log(`[DOMAIN MONITOR] ✓ DNS OK for ${subdomain} via ${name} resolver (attempt ${attempt})`);
        }
        return { verified: true, allTransient: false, resolverUsed: name };
      }

      lastError = result.error || lastError;

      if (result.transient === false) {
        allTransient = false;
      }

      if (!result.transient) {
        console.log(`[DOMAIN MONITOR] Permanent DNS failure via ${name} for ${subdomain}: ${lastError}`);
        break;
      }

      if (attempt < DNS_MAX_RETRIES) {
        console.log(`[DOMAIN MONITOR] [${name}] attempt ${attempt}/${DNS_MAX_RETRIES} failed for ${subdomain} (${lastError}), retrying...`);
        await sleep(DNS_RETRY_DELAY_MS);
      }
    }
  }

  // All DNS resolvers exhausted — try HTTP as last resort
  if (allTransient) {
    console.log(`[DOMAIN MONITOR] All DNS resolvers returned transient errors for ${subdomain}. Trying HTTP fallback...`);
    const httpAlive = await httpHealthCheck(subdomain);
    if (httpAlive) {
      console.log(`[DOMAIN MONITOR] ✓ HTTP fallback succeeded for ${subdomain} — treating as active`);
      return { verified: true, allTransient: true, resolverUsed: "http_fallback" };
    }
    console.log(`[DOMAIN MONITOR] HTTP fallback also failed for ${subdomain}`);
  }

  return { verified: false, error: lastError, allTransient, resolverUsed: lastResolverName };
}

// ──────────────────────────────────────────────────────────────
// HTTP HEALTH CHECK
// ──────────────────────────────────────────────────────────────
async function httpHealthCheck(subdomain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_CHECK_TIMEOUT_MS);
    const response = await fetch(`https://${subdomain}/`, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return response.status < 500;
  } catch {
    return false;
  }
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

  // ── PARTE 2 — Per-cycle diagnostics ─────────────────────────────────────
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
        const result = await verifyDomainDNS(domain.subdomain);
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
          const failures = incrementFailure(key);

          // ── PARTE 5 — Divergence check ──────────────────────
          checkDivergence(domain.subdomain, false, result.error, result.resolverUsed || "unknown");

          if (failures === 1) {
            console.log(`[DOMAIN MONITOR] ⚠ Domain check failed (1/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} — keeping active): ${domain.subdomain} — ${result.error}`);
            await storage.updateDomain(domain.id, {
              lastCheckedAt: now,
              lastVerificationError: `[1/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} falhas] ${result.error}`,
            });
          } else if (failures === 2) {
            console.log(`[DOMAIN MONITOR] ⚠ Domain check failed (2/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} — ALERT, keeping active): ${domain.subdomain} — ${result.error}`);
            await storage.updateDomain(domain.id, {
              lastCheckedAt: now,
              lastVerificationError: `[2/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} falhas] ${result.error}`,
            });
          } else if (failures >= CONSECUTIVE_FAILURES_TO_DEACTIVATE) {

            // ── PARTE 6 — Kill-switch guard ──────────────────
            if (DISABLE_AUTO_DEACTIVATION) {
              console.log(JSON.stringify({
                event: "AUTO_DEACTIVATION_BLOCKED",
                reason: "DISABLE_DOMAIN_AUTO_DEACTIVATION=true",
                domain: domain.subdomain,
                domainId: domain.id,
                domainType: "user",
                consecutiveFailures: failures,
                error: result.error,
                OFFICIAL_CNAME,
                timestamp: new Date().toISOString(),
              }));
              await storage.updateDomain(domain.id, {
                lastCheckedAt: now,
                lastVerificationError: `[BLOQUEADO — ${failures} falhas] ${result.error}`,
              });
            } else {
              console.log(`[DOMAIN MONITOR] ✗ Deactivating domain after ${failures} consecutive failures: ${domain.subdomain}`);

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
                      messagePt: `Olá ${firstName}, o domínio ${domain.subdomain} configurado em sua conta foi identificado como inativo durante as verificações automáticas do sistema. Verifique o apontamento CNAME para ${OFFICIAL_CNAME} no seu provedor de DNS.`,
                      messageEn: `Hello ${firstName}, the domain ${domain.subdomain} configured in your account was identified as inactive during automatic system checks. Please verify the CNAME pointing to ${OFFICIAL_CNAME} at your DNS provider.`,
                    });
                    if (owner.email) {
                      sendDomainInactiveEmail(owner.email, domain.subdomain, domain.userId).catch(err => {
                        console.error(`[DOMAIN MONITOR] Failed to send domain inactive email:`, err);
                      });
                    }
                    console.log(`[DOMAIN MONITOR] Notification sent for domain: ${domain.subdomain}`);
                  }
                }
                await storage.updateDomainNotificationTimestamp(domain.id, now);
              }
            }
          }
        }

        await sleep(200);
      } catch (err) {
        console.error(`[DOMAIN MONITOR] Error checking domain ${domain.subdomain}:`, err);
      }
    }

    // ── SHARED DOMAINS ────────────────────────────────────────
    for (const domain of sharedDomains) {
      const key = `shared:${domain.id}`;
      try {
        const result = await verifyDomainDNS(domain.subdomain);
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
          const failures = incrementFailure(key);

          // ── PARTE 5 — Divergence check ──────────────────────
          checkDivergence(domain.subdomain, false, result.error, result.resolverUsed || "unknown");

          if (failures < CONSECUTIVE_FAILURES_TO_DEACTIVATE || result.allTransient) {
            const label = failures < CONSECUTIVE_FAILURES_TO_DEACTIVATE ? `${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE}` : `${failures}`;
            const severity = failures === 1 ? "⚠" : "⚠⚠";
            console.log(`[DOMAIN MONITOR] ${severity} Shared domain failed (${label} — keeping active): ${domain.subdomain} — ${result.error}`);
            await storage.updateSharedDomain(domain.id, {
              lastCheckedAt: now,
              lastVerificationError: `[${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} falhas] ${result.error}`,
            });
          } else {
            // ── PARTE 6 — Kill-switch guard ──────────────────
            if (DISABLE_AUTO_DEACTIVATION) {
              console.log(JSON.stringify({
                event: "AUTO_DEACTIVATION_BLOCKED",
                reason: "DISABLE_DOMAIN_AUTO_DEACTIVATION=true",
                domain: domain.subdomain,
                domainId: domain.id,
                domainType: "shared",
                consecutiveFailures: failures,
                error: result.error,
                OFFICIAL_CNAME,
                timestamp: new Date().toISOString(),
              }));
              await storage.updateSharedDomain(domain.id, {
                lastCheckedAt: now,
                lastVerificationError: `[BLOQUEADO — ${failures} falhas] ${result.error}`,
              });
            } else {
              console.log(`[DOMAIN MONITOR] ✗ Deactivating shared domain after ${failures} consecutive failures: ${domain.subdomain}`);

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
                    messagePt: `Olá ${firstName}, o domínio compartilhado ${domain.subdomain} que você ativou foi identificado como inativo durante as verificações automáticas do sistema. Verifique suas ofertas a fim de evitar erros de redirecionamento, loops ou tráfego inválido.`,
                    messageEn: `Hello ${firstName}, the shared domain ${domain.subdomain} you activated was identified as inactive during automatic system checks. Please check your offers to avoid redirection errors, loops, or invalid traffic.`,
                  });
                  if (user.email) {
                    sendSharedDomainInactiveEmail(user.email, domain.subdomain, user.userId).catch(err => {
                      console.error(`[DOMAIN MONITOR] Failed to send shared domain inactive email:`, err);
                    });
                  }
                  console.log(`[DOMAIN MONITOR] Notification sent to user ${user.userId} for shared domain: ${domain.subdomain}`);
                }
                await storage.updateSharedDomainNotificationTimestamp(domain.id, now);
              }
            }
          }
        }

        await sleep(200);
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

  // ── PARTE 2 — Startup diagnostics ────────────────────────────────────────
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
