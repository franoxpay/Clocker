import * as dns from "dns/promises";

const OFFICIAL_CNAME = (process.env.CNAME_TARGET || "clerion.app").trim().toLowerCase().replace(/\.$/, "");

function normalizeCname(record: string): string {
  return record.trim().toLowerCase().replace(/\.$/, "");
}

export { OFFICIAL_CNAME };

export async function verifyDomainDNS(subdomain: string): Promise<{ verified: boolean; error?: string }> {
  console.log(`[DNS] Verifying domain: ${subdomain} (expected CNAME: ${OFFICIAL_CNAME})`);

  try {
    const cnameRecords = await dns.resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      console.log(`[DNS] CNAME found for ${subdomain}:`, cnameRecords);

      const pointsToUs = cnameRecords.some(record => {
        const normalized = normalizeCname(record);
        return normalized === OFFICIAL_CNAME || normalized.endsWith(`.${OFFICIAL_CNAME}`);
      });

      if (pointsToUs) {
        return { verified: true };
      } else {
        return {
          verified: false,
          error: `CNAME found but points to '${cnameRecords[0]}' instead of '${OFFICIAL_CNAME}'`,
        };
      }
    }
  } catch (error: any) {
    console.log(`[DNS] CNAME lookup for ${subdomain} failed:`, error.code, error.message);

    if (error.code === "ENODATA") {
      return { verified: false, error: `No CNAME record found. Please add a CNAME pointing to ${OFFICIAL_CNAME}` };
    }
    if (error.code === "ENOTFOUND") {
      return { verified: false, error: "Domain not found - check if the domain exists and DNS is configured" };
    }
    if (error.code === "SERVFAIL") {
      return { verified: false, error: "DNS server error - try again later" };
    }
  }

  return { verified: false, error: `No CNAME record configured. Add a CNAME pointing to ${OFFICIAL_CNAME}` };
}
