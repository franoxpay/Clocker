import * as dns from "dns/promises";

export async function verifyDomainDNS(subdomain: string): Promise<{ verified: boolean; error?: string }> {
  console.log(`[DNS] Verifying domain: ${subdomain}`);
  
  const EXPECTED_CNAME_TARGET = (process.env.CNAME_TARGET || "clerion.app").trim();
  
  try {
    const cnameRecords = await dns.resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      console.log(`[DNS] CNAME found for ${subdomain}:`, cnameRecords);
      
      const pointsToUs = cnameRecords.some(record => 
        record.toLowerCase() === EXPECTED_CNAME_TARGET || 
        record.toLowerCase().endsWith(`.${EXPECTED_CNAME_TARGET}`)
      );
      
      if (pointsToUs) {
        return { verified: true };
      } else {
        return { 
          verified: false, 
          error: `CNAME found but points to '${cnameRecords[0]}' instead of '${EXPECTED_CNAME_TARGET}'` 
        };
      }
    }
  } catch (error: any) {
    console.log(`[DNS] CNAME lookup for ${subdomain} failed:`, error.code, error.message);
    
    if (error.code === "ENODATA") {
      return { verified: false, error: `No CNAME record found. Please add a CNAME pointing to ${EXPECTED_CNAME_TARGET}` };
    }
    if (error.code === "ENOTFOUND") {
      return { verified: false, error: "Domain not found - check if the domain exists and DNS is configured" };
    }
    if (error.code === "SERVFAIL") {
      return { verified: false, error: "DNS server error - try again later" };
    }
  }
  
  return { verified: false, error: `No CNAME record configured. Add a CNAME pointing to ${EXPECTED_CNAME_TARGET}` };
}
