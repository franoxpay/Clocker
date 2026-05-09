import * as dns from "dns/promises";
import * as os from "os";

const OFFICIAL_CNAME = (process.env.CNAME_TARGET || "clerion.app").trim().toLowerCase().replace(/\.$/, "");

// ── PARTE 2 — Module-level startup diagnostic ──────────────────────────────
console.log(JSON.stringify({
  event: "DOMAIN_UTILS_LOADED",
  OFFICIAL_CNAME,
  CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set — fallback: clerion.app)",
  processPid: process.pid,
  hostname: os.hostname(),
  NODE_ENV: process.env.NODE_ENV,
  timestamp: new Date().toISOString(),
}));

function normalizeCname(record: string): string {
  return record.trim().toLowerCase().replace(/\.$/, "");
}

export { OFFICIAL_CNAME };

// ── PARTE 5 — In-memory last manual verify results (divergence detection) ───
// Keyed by subdomain. Updated every time verifyDomainDNS is called.
export const lastManualVerifyResults = new Map<string, {
  verified: boolean;
  error?: string;
  source: string;
  timestamp: Date;
}>();

export async function verifyDomainDNS(
  subdomain: string,
  source: "user_verify" | "admin_verify" = "user_verify",
): Promise<{ verified: boolean; error?: string }> {

  // ── PARTE 4 — Start of verify: log full context ──────────────────────────
  console.log(JSON.stringify({
    event: "DNS_VERIFY_START",
    source,
    domain: subdomain,
    OFFICIAL_CNAME,
    CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set)",
    processPid: process.pid,
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  }));

  try {
    const cnameRecords = await dns.resolveCname(subdomain);

    if (cnameRecords && cnameRecords.length > 0) {
      const normalizedRecords = cnameRecords.map(r => normalizeCname(r));
      const pointsToUs = normalizedRecords.some(n =>
        n === OFFICIAL_CNAME || n.endsWith(`.${OFFICIAL_CNAME}`)
      );

      // ── PARTE 4 — Log raw + normalized + comparison ─────────────────────
      console.log(JSON.stringify({
        event: "DNS_VERIFY_CNAME_FOUND",
        source,
        domain: subdomain,
        resolver: "system",
        cnameRecords_raw: cnameRecords,
        cnameRecords_normalized: normalizedRecords,
        expected: OFFICIAL_CNAME,
        pointsToUs,
        verdict: pointsToUs ? "VERIFIED" : "MISMATCH",
        timestamp: new Date().toISOString(),
      }));

      if (pointsToUs) {
        lastManualVerifyResults.set(subdomain, { verified: true, source, timestamp: new Date() });
        return { verified: true };
      } else {
        const error = `CNAME found but points to '${cnameRecords[0]}' instead of '${OFFICIAL_CNAME}'`;
        lastManualVerifyResults.set(subdomain, { verified: false, error, source, timestamp: new Date() });
        return { verified: false, error };
      }
    }
  } catch (error: any) {
    const code: string = error.code || "";

    // ── PARTE 4 — Log DNS error details ─────────────────────────────────────
    console.log(JSON.stringify({
      event: "DNS_VERIFY_ERROR",
      source,
      domain: subdomain,
      resolver: "system",
      errorCode: code,
      errorMessage: error.message,
      OFFICIAL_CNAME,
      processPid: process.pid,
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
    }));

    if (code === "ENODATA") {
      const err = `No CNAME record found. Please add a CNAME pointing to ${OFFICIAL_CNAME}`;
      lastManualVerifyResults.set(subdomain, { verified: false, error: err, source, timestamp: new Date() });
      return { verified: false, error: err };
    }
    if (code === "ENOTFOUND") {
      const err = "Domain not found - check if the domain exists and DNS is configured";
      lastManualVerifyResults.set(subdomain, { verified: false, error: err, source, timestamp: new Date() });
      return { verified: false, error: err };
    }
    if (code === "SERVFAIL") {
      const err = "DNS server error - try again later";
      lastManualVerifyResults.set(subdomain, { verified: false, error: err, source, timestamp: new Date() });
      return { verified: false, error: err };
    }
  }

  const err = `No CNAME record configured. Add a CNAME pointing to ${OFFICIAL_CNAME}`;
  lastManualVerifyResults.set(subdomain, { verified: false, error: err, source, timestamp: new Date() });
  return { verified: false, error: err };
}
