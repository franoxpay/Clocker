import dns from "dns/promises";
import { storage } from "./storage";

const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXPECTED_CNAME_TARGET = "cleryon.com";

let isRunning = false;

async function verifyDomainDNS(subdomain: string): Promise<{ verified: boolean; error?: string }> {
  console.log(`[DOMAIN MONITOR] Checking DNS for: ${subdomain}`);
  
  try {
    const cnameRecords = await dns.resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      const pointsToUs = cnameRecords.some(record => 
        record.toLowerCase() === EXPECTED_CNAME_TARGET || 
        record.toLowerCase().endsWith(`.${EXPECTED_CNAME_TARGET}`)
      );
      
      if (pointsToUs) {
        return { verified: true };
      } else {
        return { 
          verified: false, 
          error: `CNAME points to '${cnameRecords[0]}' instead of '${EXPECTED_CNAME_TARGET}'` 
        };
      }
    }
  } catch (error: any) {
    if (error.code === "ENODATA") {
      return { verified: false, error: `No CNAME record found` };
    }
    if (error.code === "ENOTFOUND") {
      return { verified: false, error: "Domain not found" };
    }
    if (error.code === "SERVFAIL") {
      return { verified: false, error: "DNS server error" };
    }
  }
  
  return { verified: false, error: `No CNAME record configured` };
}

async function checkAllDomains() {
  if (isRunning) {
    console.log("[DOMAIN MONITOR] Previous check still running, skipping...");
    return;
  }
  
  isRunning = true;
  console.log("[DOMAIN MONITOR] Starting domain health check...");
  
  try {
    // Get all user domains
    const userDomains = await storage.getAllUserDomains();
    
    // Get all shared domains
    const sharedDomains = await storage.getAllSharedDomainsForMonitoring();
    
    console.log(`[DOMAIN MONITOR] Checking ${userDomains.length} user domains and ${sharedDomains.length} shared domains`);
    
    // Check user domains
    for (const domain of userDomains) {
      try {
        const result = await verifyDomainDNS(domain.subdomain);
        const now = new Date();
        
        if (!result.verified) {
          // Domain is inactive
          console.log(`[DOMAIN MONITOR] Domain inactive: ${domain.subdomain} - ${result.error}`);
          
          // Update domain status
          await storage.updateDomain(domain.id, {
            isActive: false,
            isVerified: false,
            lastCheckedAt: now,
            lastVerificationError: result.error || "DNS verification failed",
          });
          
          // Check if we should send notification (cooldown)
          const shouldNotify = !domain.lastInactiveNotificationAt || 
            (now.getTime() - new Date(domain.lastInactiveNotificationAt).getTime()) > NOTIFICATION_COOLDOWN_MS;
          
          if (shouldNotify) {
            // Get offers using this domain
            const offers = await storage.getOffersByDomainId(domain.id);
            
            if (offers.length > 0) {
              // Get domain owner
              const owner = await storage.getUser(domain.userId);
              
              if (owner) {
                const firstName = owner.firstName || owner.email.split("@")[0];
                const offerNames = offers.map(o => o.name).join(", ");
                
                const messagePt = `Olá ${firstName}, o domínio ${domain.subdomain} configurado em sua conta foi identificado como inativo durante as verificações automáticas do sistema, verifique suas ofertas a fim de evitar erros de redirecionamento, loops ou tráfego inválido.`;
                const messageEn = `Hello ${firstName}, the domain ${domain.subdomain} configured in your account was identified as inactive during automatic system checks. Please check your offers to avoid redirection errors, loops, or invalid traffic.`;
                
                await storage.createNotification({
                  userId: domain.userId,
                  type: "domain_inactive",
                  title: owner.language === "pt-BR" ? "Domínio Inativo Detectado" : "Inactive Domain Detected",
                  message: owner.language === "pt-BR" ? messagePt : messageEn,
                  metadata: { 
                    domainId: domain.id, 
                    subdomain: domain.subdomain,
                    affectedOffers: offerNames 
                  },
                });
                
                console.log(`[DOMAIN MONITOR] Notification sent for domain: ${domain.subdomain}`);
              }
            }
            
            // Update notification timestamp
            await storage.updateDomainNotificationTimestamp(domain.id, now);
          }
        } else {
          // Domain is active - reset status if it was inactive
          if (!domain.isActive || !domain.isVerified) {
            await storage.updateDomain(domain.id, {
              isActive: true,
              isVerified: true,
              lastCheckedAt: now,
              lastVerificationError: null,
            });
            console.log(`[DOMAIN MONITOR] Domain restored: ${domain.subdomain}`);
          } else {
            await storage.updateDomain(domain.id, {
              lastCheckedAt: now,
            });
          }
        }
        
        // Small delay between checks to avoid DNS rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`[DOMAIN MONITOR] Error checking domain ${domain.subdomain}:`, err);
      }
    }
    
    // Check shared domains
    for (const domain of sharedDomains) {
      try {
        const result = await verifyDomainDNS(domain.subdomain);
        const now = new Date();
        
        if (!result.verified) {
          console.log(`[DOMAIN MONITOR] Shared domain inactive: ${domain.subdomain} - ${result.error}`);
          
          // Update shared domain status
          await storage.updateSharedDomain(domain.id, {
            isActive: false,
            isVerified: false,
            lastCheckedAt: now,
            lastVerificationError: result.error || "DNS verification failed",
          });
          
          // Check if we should send notification (cooldown)
          const shouldNotify = !domain.lastInactiveNotificationAt || 
            (now.getTime() - new Date(domain.lastInactiveNotificationAt).getTime()) > NOTIFICATION_COOLDOWN_MS;
          
          if (shouldNotify) {
            // Get all offers using this shared domain
            const offers = await storage.getOffersBySharedDomainId(domain.id);
            
            // Group offers by user
            const offersByUser = new Map<string, typeof offers>();
            for (const offer of offers) {
              const existing = offersByUser.get(offer.userId) || [];
              existing.push(offer);
              offersByUser.set(offer.userId, existing);
            }
            
            // Send notification to each affected user
            const entries = Array.from(offersByUser.entries());
            for (const [userId, userOffers] of entries) {
              const owner = await storage.getUser(userId);
              
              if (owner) {
                const firstName = owner.firstName || owner.email.split("@")[0];
                
                const messagePt = `Olá ${firstName}, o domínio ${domain.subdomain} configurado em sua conta foi identificado como inativo durante as verificações automáticas do sistema, verifique suas ofertas a fim de evitar erros de redirecionamento, loops ou tráfego inválido.`;
                const messageEn = `Hello ${firstName}, the domain ${domain.subdomain} configured in your account was identified as inactive during automatic system checks. Please check your offers to avoid redirection errors, loops, or invalid traffic.`;
                
                await storage.createNotification({
                  userId,
                  type: "domain_inactive",
                  title: owner.language === "pt-BR" ? "Domínio Compartilhado Inativo" : "Shared Domain Inactive",
                  message: owner.language === "pt-BR" ? messagePt : messageEn,
                  metadata: { 
                    sharedDomainId: domain.id, 
                    subdomain: domain.subdomain,
                    affectedOffers: userOffers.map((o: { name: string }) => o.name).join(", ")
                  },
                });
                
                console.log(`[DOMAIN MONITOR] Notification sent to user ${userId} for shared domain: ${domain.subdomain}`);
              }
            }
            
            // Update notification timestamp for shared domain
            await storage.updateSharedDomainNotificationTimestamp(domain.id, now);
          }
        } else {
          // Shared domain is active
          if (!domain.isActive || !domain.isVerified) {
            await storage.updateSharedDomain(domain.id, {
              isActive: true,
              isVerified: true,
              lastCheckedAt: now,
              lastVerificationError: null,
            });
            console.log(`[DOMAIN MONITOR] Shared domain restored: ${domain.subdomain}`);
          } else {
            await storage.updateSharedDomain(domain.id, {
              lastCheckedAt: now,
            });
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
  console.log("[DOMAIN MONITOR] Starting domain health monitoring service (5-minute interval)");
  
  // Run initial check after 30 seconds (give server time to start)
  setTimeout(() => {
    checkAllDomains();
  }, 30000);
  
  // Schedule recurring checks
  setInterval(() => {
    checkAllDomains();
  }, MONITOR_INTERVAL_MS);
}
