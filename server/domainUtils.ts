import dns, { Resolver } from "dns/promises";
import * as os from "os";

export const OFFICIAL_CNAME = (process.env.CNAME_TARGET || "clerion.app").trim().toLowerCase().replace(/\.$/, "");

// ── Module-level startup diagnostic ────────────────────────────────────────
console.log(JSON.stringify({
  event: "DOMAIN_UTILS_LOADED",
  OFFICIAL_CNAME,
  CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set — fallback: clerion.app)",
  processPid: process.pid,
  hostname: os.hostname(),
  NODE_ENV: process.env.NODE_ENV,
  timestamp: new Date().toISOString(),
}));

// ── DNS configuration ───────────────────────────────────────────────────────
const DNS_MAX_RETRIES = 3;
const DNS_RETRY_DELAY_MS = 2000;
const HTTP_CHECK_TIMEOUT_MS = 5000;

// Errors that should trigger a retry / fallback resolver instead of hard-fail
export const TRANSIENT_DNS_ERRORS = new Set([
  "SERVFAIL", "ETIMEOUT", "ECONNREFUSED", "EAI_AGAIN",
  "ESERVFAIL", "ECONNRESET", "ENETUNREACH",
]);

// Three independent resolvers — system first, then two public DNS
const cloudflareResolver = new Resolver();
cloudflareResolver.setServers(["1.1.1.1", "1.0.0.1"]);

const googleResolver = new Resolver();
googleResolver.setServers(["8.8.8.8", "8.8.4.4"]);

export const DNS_RESOLVERS: Array<{ name: string; resolver: typeof dns | Resolver }> = [
  { name: "system", resolver: dns },
  { name: "cloudflare", resolver: cloudflareResolver },
  { name: "google", resolver: googleResolver },
];

// ── Return types ────────────────────────────────────────────────────────────
export type VerifyErrorType = "none" | "transient" | "mismatch" | "permanent";

export interface ResolverResult {
  resolver: string;
  cnames_raw?: string[];
  cnames_normalized?: string[];
  error?: string;
  errorCode?: string;
  transient?: boolean;
  verified?: boolean;
}

export interface VerifyResult {
  verified: boolean;
  error?: string;
  errorType: VerifyErrorType;
  resolverResults: ResolverResult[];
  foundCnames: string[];
  expectedCname: string;
  source: string;
  checkedAt: string;
  resolverUsed?: string;
  allTransient: boolean;
}

// ── In-memory last verify results (divergence detection) ───────────────────
export const lastManualVerifyResults = new Map<string, {
  verified: boolean;
  error?: string;
  source: string;
  timestamp: Date;
  errorType?: VerifyErrorType;
}>();

// ── Internal helpers ────────────────────────────────────────────────────────
function normalizeCname(record: string): string {
  return record.trim().toLowerCase().replace(/\.$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Low-level check against a single resolver (1 attempt, no retry)
export async function checkCNAMEWithResolver(
  subdomain: string,
  resolver: typeof dns | Resolver,
  resolverName: string,
): Promise<ResolverResult> {
  try {
    const cnameRecords = await (resolver as any).resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      const normalized = cnameRecords.map((r: string) => normalizeCname(r));
      const pointsToUs = normalized.some((n: string) =>
        n === OFFICIAL_CNAME || n.endsWith(`.${OFFICIAL_CNAME}`)
      );
      console.log(JSON.stringify({
        event: "DNS_RESOLVER_RESULT",
        domain: subdomain,
        resolver: resolverName,
        cnames_raw: cnameRecords,
        cnames_normalized: normalized,
        expected: OFFICIAL_CNAME,
        pointsToUs,
        verdict: pointsToUs ? "VERIFIED" : "MISMATCH",
        timestamp: new Date().toISOString(),
      }));
      return {
        resolver: resolverName,
        cnames_raw: cnameRecords,
        cnames_normalized: normalized,
        verified: pointsToUs,
        transient: false,
        error: pointsToUs ? undefined : `CNAME points to '${cnameRecords[0]}' instead of '${OFFICIAL_CNAME}'`,
      };
    }
    return { resolver: resolverName, verified: false, transient: false, error: "No CNAME record configured" };
  } catch (err: any) {
    const code: string = err.code || "";
    const isTransient = TRANSIENT_DNS_ERRORS.has(code);
    console.log(JSON.stringify({
      event: "DNS_RESOLVER_ERROR",
      domain: subdomain,
      resolver: resolverName,
      errorCode: code,
      errorMessage: err.message,
      isTransient,
      timestamp: new Date().toISOString(),
    }));
    return {
      resolver: resolverName,
      verified: false,
      transient: isTransient,
      errorCode: code,
      error: code === "ENODATA" ? "No CNAME record found" :
             code === "ENOTFOUND" ? "Domain not found in DNS" :
             `DNS error: ${code || err.message}`,
    };
  }
}

// HTTP health check — last resort when all DNS resolvers are transient
export async function httpHealthCheck(subdomain: string): Promise<boolean> {
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

// ── MAIN UNIFIED VERIFY FUNCTION ────────────────────────────────────────────
// Used by BOTH manual verify endpoints AND the domain monitor.
// Returns a rich VerifyResult so callers can make informed decisions.
export async function verifyDomainDNS(
  subdomain: string,
  source: "user_verify" | "admin_verify" | "monitor" = "user_verify",
): Promise<VerifyResult> {
  const checkedAt = new Date().toISOString();
  const resolverResults: ResolverResult[] = [];
  let allTransient = true;
  let lastError = "DNS check failed";
  let resolverUsed: string | undefined;
  let foundCnames: string[] = [];
  let errorType: VerifyErrorType = "transient";

  console.log(JSON.stringify({
    event: "DNS_VERIFY_START",
    source,
    domain: subdomain,
    OFFICIAL_CNAME,
    CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set)",
    processPid: process.pid,
    hostname: os.hostname(),
    timestamp: checkedAt,
  }));

  outer: for (const { name, resolver } of DNS_RESOLVERS) {
    resolverUsed = name;
    for (let attempt = 1; attempt <= DNS_MAX_RETRIES; attempt++) {
      const r = await checkCNAMEWithResolver(subdomain, resolver, name);
      resolverResults.push({ ...r, resolver: attempt > 1 ? `${name}#${attempt}` : name });

      if (r.verified) {
        foundCnames = r.cnames_normalized || r.cnames_raw || [];
        lastManualVerifyResults.set(subdomain, { verified: true, source, timestamp: new Date(), errorType: "none" });
        console.log(JSON.stringify({
          event: "DNS_VERIFY_SUCCESS",
          source, domain: subdomain, resolver: name, attempt,
          foundCnames, expectedCname: OFFICIAL_CNAME,
          timestamp: new Date().toISOString(),
        }));
        return {
          verified: true, errorType: "none", resolverResults,
          foundCnames, expectedCname: OFFICIAL_CNAME,
          source, checkedAt, resolverUsed: name, allTransient: false,
        };
      }

      lastError = r.error || lastError;

      // CNAME exists but points somewhere wrong → permanent mismatch, stop immediately
      if (r.cnames_raw && r.cnames_raw.length > 0) {
        foundCnames = r.cnames_normalized || r.cnames_raw;
        errorType = "mismatch";
        allTransient = false;
        break outer;
      }

      // Hard permanent failure (ENODATA, ENOTFOUND) → no point retrying this resolver
      if (r.transient === false) {
        allTransient = false;
        errorType = "permanent";
        break; // try next resolver
      }

      // Transient — retry with delay
      if (attempt < DNS_MAX_RETRIES) {
        await sleep(DNS_RETRY_DELAY_MS);
      }
    }

    // After exhausting retries on this resolver, if we got a permanent failure stop
    if (!allTransient && errorType !== "transient") break;
  }

  // All resolvers exhausted — HTTP fallback only if everything was transient
  if (allTransient) {
    errorType = "transient";
    const httpAlive = await httpHealthCheck(subdomain);
    if (httpAlive) {
      console.log(JSON.stringify({
        event: "DNS_VERIFY_HTTP_FALLBACK_SUCCESS",
        source, domain: subdomain, timestamp: new Date().toISOString(),
      }));
      lastManualVerifyResults.set(subdomain, { verified: true, source, timestamp: new Date(), errorType: "none" });
      return {
        verified: true, errorType: "none", resolverResults,
        foundCnames, expectedCname: OFFICIAL_CNAME,
        source, checkedAt, resolverUsed: "http_fallback", allTransient: true,
      };
    }
  }

  console.log(JSON.stringify({
    event: "DNS_VERIFY_FAILED",
    source, domain: subdomain, errorType, lastError, allTransient,
    foundCnames, resolverResultsCount: resolverResults.length,
    timestamp: new Date().toISOString(),
  }));

  lastManualVerifyResults.set(subdomain, { verified: false, error: lastError, source, timestamp: new Date(), errorType });

  // Human-readable error message based on errorType
  let humanError: string;
  if (errorType === "transient") {
    humanError = "DNS instável — tente novamente em alguns minutos";
  } else if (errorType === "mismatch") {
    humanError = `CNAME found but points to '${foundCnames[0]}' instead of '${OFFICIAL_CNAME}'`;
  } else {
    humanError = `No CNAME record found in ${DNS_RESOLVERS.length} resolvers. Add CNAME pointing to ${OFFICIAL_CNAME}`;
  }

  return {
    verified: false, error: humanError, errorType, resolverResults,
    foundCnames, expectedCname: OFFICIAL_CNAME,
    source, checkedAt, resolverUsed, allTransient,
  };
}
