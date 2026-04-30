import dns, { Resolver } from "dns/promises";
import { storage } from "./storage";
import { sendDomainInactiveEmail, sendSharedDomainInactiveEmail } from "./email";

const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXPECTED_CNAME_TARGET = (process.env.CNAME_TARGET || "clerion.app").trim();

// ──────────────────────────────────────────────────────────────
// RETRY & THRESHOLD CONFIGURATION
// ──────────────────────────────────────────────────────────────

// Retries within a single DNS check (per resolver)
const DNS_MAX_RETRIES = 3;
const DNS_RETRY_DELAY_MS = 2000; // 2 s between retries

// Require this many CONSECUTIVE failed monitoring CYCLES before deactivating.
// Each cycle is MONITOR_INTERVAL_MS (5 min), so 2 = 10 minutes of sustained failure.
const CONSECUTIVE_FAILURES_TO_DEACTIVATE = 2;

// HTTP health check timeout (ms) — used as last resort when all DNS attempts fail
const HTTP_CHECK_TIMEOUT_MS = 5000;

// Transient DNS error codes — retry these, never deactivate on them alone
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
// Keys: "user:<id>" and "shared:<id>"
// Counters reset to 0 immediately when a domain is verified OK.
// ──────────────────────────────────────────────────────────────
const consecutiveFailures = new Map<string, number>();

// ──────────────────────────────────────────────────────────────
// FALLBACK DNS RESOLVERS
// If system resolver fails, try Cloudflare then Google.
// Any resolver confirming the CNAME = domain is OK.
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

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
// DNS VERIFICATION — single attempt on a specific resolver
// ──────────────────────────────────────────────────────────────

async function checkCNAMEWithResolver(
  subdomain: string,
  resolver: typeof dns | Resolver,
): Promise<{ verified: boolean; error?: string; transient?: boolean }> {
  try {
    const cnameRecords = await (resolver as any).resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      const pointsToUs = cnameRecords.some((r: string) =>
        r.toLowerCase() === EXPECTED_CNAME_TARGET ||
        r.toLowerCase().endsWith(`.${EXPECTED_CNAME_TARGET}`)
      );
      if (pointsToUs) {
        return { verified: true };
      }
      return {
        verified: false,
        error: `CNAME points to '${cnameRecords[0]}' instead of '${EXPECTED_CNAME_TARGET}'`,
        transient: false,
      };
    }
    return { verified: false, error: "No CNAME record configured", transient: false };
  } catch (error: any) {
    const code: string = error.code || "";
    const isTransient = TRANSIENT_DNS_ERRORS.has(code);
    if (code === "ENODATA") return { verified: false, error: "No CNAME record found", transient: false };
    if (code === "ENOTFOUND") return { verified: false, error: "Domain not found in DNS", transient: false };
    return { verified: false, error: `DNS error: ${code || error.message}`, transient: isTransient };
  }
}

// ──────────────────────────────────────────────────────────────
// HTTP HEALTH CHECK — last resort when all DNS resolvers fail
// A domain is considered alive if it responds with any HTTP status.
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
    // Any response (even 4xx) means the server is reachable
    return response.status < 500;
  } catch {
    // Network error or timeout — not reachable
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN VERIFICATION FUNCTION
// Strategy:
//   1. Try each DNS resolver (system, Cloudflare, Google) — 3 retries each
//   2. If any resolver confirms the CNAME → verified ✓
//   3. If all resolvers fail with transient errors → HTTP fallback
//   4. If HTTP check succeeds → treat as verified (don't deactivate)
//   5. Only return unverified after all paths exhausted
// ──────────────────────────────────────────────────────────────

async function verifyDomainDNS(
  subdomain: string,
): Promise<{ verified: boolean; error?: string; allTransient: boolean }> {
  console.log(`[DOMAIN MONITOR] Checking DNS for: ${subdomain}`);

  let lastError = "DNS check failed";
  let allTransient = true; // becomes false if any permanent failure is seen

  for (const { name, resolver } of DNS_RESOLVERS) {
    for (let attempt = 1; attempt <= DNS_MAX_RETRIES; attempt++) {
      const result = await checkCNAMEWithResolver(subdomain, resolver);

      if (result.verified) {
        if (name !== "system" || attempt > 1) {
          console.log(`[DOMAIN MONITOR] ✓ DNS OK for ${subdomain} via ${name} resolver (attempt ${attempt})`);
        }
        return { verified: true, allTransient: false };
      }

      lastError = result.error || lastError;

      if (result.transient === false) {
        allTransient = false;
      }

      // Permanent failure on this resolver — no point retrying it, move to next
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
      return { verified: true, allTransient: true };
    }
    console.log(`[DOMAIN MONITOR] HTTP fallback also failed for ${subdomain}`);
  }

  return { verified: false, error: lastError, allTransient };
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
  console.log("[DOMAIN MONITOR] Starting domain health check...");

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
          // Success — reset counter, restore if needed
          resetFailure(key);
          if (!domain.isActive || !domain.isVerified) {
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
          console.log(`[DOMAIN MONITOR] ✗ Domain failed: ${domain.subdomain} — ${result.error} (consecutive failures: ${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE})`);

          // Always update error info so admin can see the trend
          await storage.updateDomain(domain.id, {
            lastCheckedAt: now,
            lastVerificationError: `[${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} failures] ${result.error}`,
          });

          // Only deactivate after threshold is reached
          if (failures >= CONSECUTIVE_FAILURES_TO_DEACTIVATE) {
            console.log(`[DOMAIN MONITOR] Deactivating domain after ${failures} consecutive failures: ${domain.subdomain}`);

            await storage.updateDomain(domain.id, {
              isActive: false,
              isVerified: false,
              lastCheckedAt: now,
              lastVerificationError: result.error || "DNS verification failed",
            });

            // Notify with cooldown
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
                    messagePt: `Olá ${firstName}, o domínio ${domain.subdomain} configurado em sua conta foi identificado como inativo durante as verificações automáticas do sistema, verifique suas ofertas a fim de evitar erros de redirecionamento, loops ou tráfego inválido.`,
                    messageEn: `Hello ${firstName}, the domain ${domain.subdomain} configured in your account was identified as inactive during automatic system checks. Please check your offers to avoid redirection errors, loops, or invalid traffic.`,
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
          console.log(`[DOMAIN MONITOR] ✗ Shared domain failed: ${domain.subdomain} — ${result.error} (consecutive failures: ${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE})`);

          await storage.updateSharedDomain(domain.id, {
            lastCheckedAt: now,
            lastVerificationError: `[${failures}/${CONSECUTIVE_FAILURES_TO_DEACTIVATE} failures] ${result.error}`,
          });

          if (failures >= CONSECUTIVE_FAILURES_TO_DEACTIVATE) {
            console.log(`[DOMAIN MONITOR] Deactivating shared domain after ${failures} consecutive failures: ${domain.subdomain}`);

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
  console.log("[DOMAIN MONITOR] Starting domain health monitoring service (5-minute interval)");

  // Run initial check after 30 seconds (give server time to start)
  setTimeout(() => {
    checkAllDomains();
  }, 30000);

  setInterval(() => {
    checkAllDomains();
  }, MONITOR_INTERVAL_MS);
}
