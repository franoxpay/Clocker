import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { randomBytes } from "crypto";
import { getStripeClient, getStripePublishableKey, isStripeConfigured } from "./stripeClient";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { promises as dns } from "dns";

async function verifyDomainDNS(subdomain: string): Promise<{ verified: boolean; error?: string }> {
  console.log(`[DNS] Verifying domain: ${subdomain}`);
  
  // First try CNAME
  try {
    const cnameRecords = await dns.resolveCname(subdomain);
    if (cnameRecords && cnameRecords.length > 0) {
      console.log(`[DNS] CNAME found for ${subdomain}:`, cnameRecords);
      return { verified: true };
    }
  } catch (error: any) {
    console.log(`[DNS] CNAME lookup for ${subdomain} failed:`, error.code, error.message);
    // Continue to try A record
  }
  
  // Try A record (some users configure A instead of CNAME)
  try {
    const aRecords = await dns.resolve4(subdomain);
    if (aRecords && aRecords.length > 0) {
      console.log(`[DNS] A record found for ${subdomain}:`, aRecords);
      return { verified: true };
    }
  } catch (error: any) {
    console.log(`[DNS] A record lookup for ${subdomain} failed:`, error.code, error.message);
  }
  
  // Try to resolve any record to check if domain exists
  try {
    const anyRecords = await dns.resolve(subdomain);
    if (anyRecords && anyRecords.length > 0) {
      console.log(`[DNS] Other records found for ${subdomain}:`, anyRecords);
      return { verified: true };
    }
  } catch (error: any) {
    console.log(`[DNS] General lookup for ${subdomain} failed:`, error.code, error.message);
    
    if (error.code === "ENODATA") {
      return { verified: false, error: "No DNS records configured for this domain" };
    }
    if (error.code === "ENOTFOUND") {
      return { verified: false, error: "Domain not found - DNS not configured or not propagated yet" };
    }
    if (error.code === "SERVFAIL") {
      return { verified: false, error: "DNS server error - try again later" };
    }
    return { verified: false, error: `DNS lookup failed: ${error.message}` };
  }
  
  return { verified: false, error: "No DNS records found for this domain" };
}

function generateXcode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${part1}-${part2}`;
}

function parseUserAgent(ua: string): "smartphone" | "tablet" | "desktop" {
  const uaLower = ua.toLowerCase();
  if (/android.*mobile|iphone|ipod|blackberry|windows phone/i.test(uaLower)) {
    return "smartphone";
  }
  if (/ipad|android(?!.*mobile)|tablet/i.test(uaLower)) {
    return "tablet";
  }
  return "desktop";
}

async function getCountryFromIP(ip: string): Promise<string> {
  try {
    const cleanIp = ip.replace(/^::ffff:/, "");
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp.startsWith("192.168.") || cleanIp.startsWith("10.")) {
      return "BR";
    }
    const response = await fetch(`http://ip-api.com/json/${cleanIp}?fields=countryCode`);
    if (response.ok) {
      const data = await response.json();
      return data.countryCode || "XX";
    }
    return "XX";
  } catch {
    return "XX";
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);

  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      const isSuspended = user.suspendedAt !== null;
      const isTrialing = user.trialEndsAt !== null && new Date(user.trialEndsAt) > new Date();
      res.json({ ...userWithoutPassword, isSuspended, isTrialing });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/plans", async (req: Request, res: Response) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans.filter(p => p.isActive));
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offers = await storage.getOffersByUserId(userId);
      const domains = await storage.getDomainsByUserId(userId);
      const clicksLast7Days = await storage.getClickLogsLast7Days(userId);

      const today = new Date().toISOString().split("T")[0];
      const todayData = clicksLast7Days.find(d => d.date === today);

      const activeOffers = offers.filter(o => o.isActive);
      const activeDomains = domains.filter(d => d.isActive && d.isVerified);

      const totalClicks = offers.reduce((sum, o) => sum + o.totalClicks, 0);

      const clicksByOffer = offers
        .filter(o => o.totalClicks > 0)
        .map(o => ({ name: o.name, clicks: o.totalClicks }))
        .sort((a, b) => b.clicks - a.clicks);

      const domainClicksMap = new Map<string, number>();
      for (const offer of offers) {
        const domain = (offer as any).domain;
        if (domain) {
          const current = domainClicksMap.get(domain.subdomain) || 0;
          domainClicksMap.set(domain.subdomain, current + offer.totalClicks);
        }
      }
      const clicksByDomain = Array.from(domainClicksMap.entries())
        .map(([name, clicks]) => ({ name, clicks }))
        .sort((a, b) => b.clicks - a.clicks);

      res.json({
        todayClicks: todayData?.clicks || 0,
        totalClicks,
        activeOffers: activeOffers.length,
        activeDomains: activeDomains.length,
        clicksLast7Days,
        clicksByOffer,
        clicksByDomain,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/advanced", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const logs = await storage.getClickLogs(userId, 1, 10000);
      
      const countryStats = new Map<string, { total: number; black: number; white: number }>();
      const deviceStats = new Map<string, { total: number; black: number; white: number }>();
      const platformStats = new Map<string, { total: number; black: number; white: number }>();
      const hourlyStats = new Array(24).fill(null).map(() => ({ total: 0, black: 0, white: 0 }));
      const weekdayStats = new Array(7).fill(null).map(() => ({ total: 0, black: 0, white: 0 }));
      
      let totalBlack = 0;
      let totalWhite = 0;
      
      for (const log of logs.logs) {
        const isBlack = log.redirectedTo === "black";
        if (isBlack) totalBlack++; else totalWhite++;
        
        const country = log.country || "Unknown";
        if (!countryStats.has(country)) {
          countryStats.set(country, { total: 0, black: 0, white: 0 });
        }
        const cs = countryStats.get(country)!;
        cs.total++;
        if (isBlack) cs.black++; else cs.white++;
        
        const device = log.device || "Unknown";
        if (!deviceStats.has(device)) {
          deviceStats.set(device, { total: 0, black: 0, white: 0 });
        }
        const ds = deviceStats.get(device)!;
        ds.total++;
        if (isBlack) ds.black++; else ds.white++;
        
        const platform = (log as any).platform || "Unknown";
        if (!platformStats.has(platform)) {
          platformStats.set(platform, { total: 0, black: 0, white: 0 });
        }
        const ps = platformStats.get(platform)!;
        ps.total++;
        if (isBlack) ps.black++; else ps.white++;
        
        const logDate = new Date(log.createdAt);
        const hour = logDate.getHours();
        const weekday = logDate.getDay();
        hourlyStats[hour].total++;
        if (isBlack) hourlyStats[hour].black++; else hourlyStats[hour].white++;
        weekdayStats[weekday].total++;
        if (isBlack) weekdayStats[weekday].black++; else weekdayStats[weekday].white++;
      }
      
      const conversionRate = logs.total > 0 ? (totalBlack / logs.total * 100).toFixed(1) : "0";
      
      const byCountry = Array.from(countryStats.entries())
        .map(([name, stats]) => ({
          name,
          ...stats,
          conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
        
      const byDevice = Array.from(deviceStats.entries())
        .map(([name, stats]) => ({
          name,
          ...stats,
          conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
        }))
        .sort((a, b) => b.total - a.total);
        
      const byPlatform = Array.from(platformStats.entries())
        .map(([name, stats]) => ({
          name,
          ...stats,
          conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
        }))
        .sort((a, b) => b.total - a.total);
        
      const byHour = hourlyStats.map((stats, hour) => ({
        hour: `${hour.toString().padStart(2, "0")}:00`,
        ...stats,
        conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
      }));
      
      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const byWeekday = weekdayStats.map((stats, day) => ({
        day: weekdayNames[day],
        ...stats,
        conversionRate: stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0"
      }));

      res.json({
        totalClicks: logs.total,
        totalBlack,
        totalWhite,
        conversionRate,
        byCountry,
        byDevice,
        byPlatform,
        byHour,
        byWeekday,
      });
    } catch (error) {
      console.error("Error fetching advanced analytics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/export/logs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const format = req.query.format as string || "csv";
      const logs = await storage.getClickLogs(userId, 1, 10000);
      
      if (format === "csv") {
        const headers = ["ID", "Date", "Country", "Device", "Redirect Type", "IP", "User Agent", "Offer Name"];
        const csvRows = [headers.join(",")];
        
        for (const log of logs.logs) {
          const row = [
            log.id,
            new Date(log.createdAt).toISOString(),
            log.country || "",
            log.device || "",
            log.redirectedTo || "",
            log.ip || "",
            `"${(log.userAgent || "").replace(/"/g, '""')}"`,
            `"${((log as any).offer?.name || "").replace(/"/g, '""')}"`
          ];
          csvRows.push(row.join(","));
        }
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=click_logs_${new Date().toISOString().split("T")[0]}.csv`);
        return res.send(csvRows.join("\n"));
      }
      
      res.status(400).json({ message: "Unsupported format" });
    } catch (error) {
      console.error("Error exporting logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/export/analytics", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const format = req.query.format as string || "csv";
      const reportType = req.query.type as string || "summary";
      const logs = await storage.getClickLogs(userId, 1, 10000);
      
      const countryStats = new Map<string, { total: number; black: number; white: number }>();
      const deviceStats = new Map<string, { total: number; black: number; white: number }>();
      
      let totalBlack = 0;
      let totalWhite = 0;
      
      for (const log of logs.logs) {
        const isBlack = log.redirectedTo === "black";
        if (isBlack) totalBlack++; else totalWhite++;
        
        const country = log.country || "Unknown";
        if (!countryStats.has(country)) {
          countryStats.set(country, { total: 0, black: 0, white: 0 });
        }
        const cs = countryStats.get(country)!;
        cs.total++;
        if (isBlack) cs.black++; else cs.white++;
        
        const device = log.device || "Unknown";
        if (!deviceStats.has(device)) {
          deviceStats.set(device, { total: 0, black: 0, white: 0 });
        }
        const ds = deviceStats.get(device)!;
        ds.total++;
        if (isBlack) ds.black++; else ds.white++;
      }
      
      if (format === "csv") {
        let csvContent = "";
        const dateStr = new Date().toISOString().split("T")[0];
        
        if (reportType === "country" || reportType === "summary") {
          csvContent += "ANALYTICS BY COUNTRY\n";
          csvContent += "Country,Total Clicks,Black Redirects,White Redirects,Conversion Rate\n";
          for (const [name, stats] of countryStats) {
            const rate = stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0";
            csvContent += `${name},${stats.total},${stats.black},${stats.white},${rate}%\n`;
          }
          csvContent += "\n";
        }
        
        if (reportType === "device" || reportType === "summary") {
          csvContent += "ANALYTICS BY DEVICE\n";
          csvContent += "Device,Total Clicks,Black Redirects,White Redirects,Conversion Rate\n";
          for (const [name, stats] of deviceStats) {
            const rate = stats.total > 0 ? (stats.black / stats.total * 100).toFixed(1) : "0";
            csvContent += `${name},${stats.total},${stats.black},${stats.white},${rate}%\n`;
          }
          csvContent += "\n";
        }
        
        if (reportType === "summary") {
          const overallRate = logs.total > 0 ? (totalBlack / logs.total * 100).toFixed(1) : "0";
          csvContent += "SUMMARY\n";
          csvContent += "Total Clicks,Black Redirects,White Redirects,Overall Conversion Rate\n";
          csvContent += `${logs.total},${totalBlack},${totalWhite},${overallRate}%\n`;
        }
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=analytics_report_${dateStr}.csv`);
        return res.send(csvContent);
      }
      
      res.status(400).json({ message: "Unsupported format" });
    } catch (error) {
      console.error("Error exporting analytics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/offers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offers = await storage.getOffersByUserId(userId);
      res.json(offers);
    } catch (error) {
      console.error("Error fetching offers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/offers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { name, slug, platform, domainId, blackPageUrl, whitePageUrl, allowedCountries, allowedDevices, isActive } = req.body;

      const parsedDomainId = domainId === "platform" || domainId === "0" || domainId === "" || domainId === null ? null : parseInt(domainId);

      const existingOffer = await storage.getOfferBySlugAndDomain(slug, parsedDomainId);
      if (existingOffer) {
        return res.status(400).json({ message: "Slug already exists on this domain" });
      }

      const xcode = generateXcode();
      const offer = await storage.createOffer({
        userId,
        name,
        slug,
        platform,
        domainId: parsedDomainId,
        blackPageUrl,
        whitePageUrl,
        allowedCountries: allowedCountries || ["BR"],
        allowedDevices: allowedDevices || ["smartphone"],
        isActive: isActive !== false,
        xcode,
      });

      res.json(offer);
    } catch (error) {
      console.error("Error creating offer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/offers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = parseInt(req.params.id);
      const offer = await storage.getOffer(offerId);

      if (!offer || offer.userId !== userId) {
        return res.status(404).json({ message: "Offer not found" });
      }

      const { name, slug, platform, domainId, blackPageUrl, whitePageUrl, allowedCountries, allowedDevices, isActive } = req.body;

      const parsedDomainId = domainId === "platform" || domainId === "0" ? null : parseInt(domainId);

      if (slug !== offer.slug || parsedDomainId !== offer.domainId) {
        const existingOffer = await storage.getOfferBySlugAndDomain(slug, parsedDomainId);
        if (existingOffer && existingOffer.id !== offerId) {
          return res.status(400).json({ message: "Slug already exists on this domain" });
        }
      }

      const updated = await storage.updateOffer(offerId, {
        name,
        slug,
        platform,
        domainId: parsedDomainId,
        blackPageUrl,
        whitePageUrl,
        allowedCountries,
        allowedDevices,
        isActive,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating offer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/offers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const offerId = parseInt(req.params.id);
      const offer = await storage.getOffer(offerId);

      if (!offer || offer.userId !== userId) {
        return res.status(404).json({ message: "Offer not found" });
      }

      await storage.deleteOffer(offerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting offer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/domains", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const domains = await storage.getDomainsByUserId(userId);
      res.json(domains);
    } catch (error) {
      console.error("Error fetching domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/domains", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { subdomain } = req.body;

      const existing = await storage.getDomainBySubdomain(subdomain);
      if (existing) {
        return res.status(400).json({ message: "Domain already exists" });
      }

      const domain = await storage.createDomain({
        userId,
        subdomain,
        isActive: true,
        isVerified: false,
        sslStatus: "pending",
      });

      // Sync with EasyPanel (add domain automatically)
      const { easypanelService } = await import("./easypanel");
      console.log(`[EasyPanel] Attempting to add domain: ${subdomain}, isConfigured: ${easypanelService.isConfigured()}`);
      if (easypanelService.isConfigured()) {
        const result = await easypanelService.addDomain(subdomain);
        console.log(`[EasyPanel] Add domain result:`, result);
        if (!result.success) {
          console.log(`[EasyPanel] Failed to add domain, but continuing: ${result.error}`);
        }
      } else {
        console.log(`[EasyPanel] Skipping - not configured`);
      }

      res.json(domain);
    } catch (error) {
      console.error("Error creating domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/domains/:id/verify", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const domainId = parseInt(req.params.id);
      const domain = await storage.getDomain(domainId);

      if (!domain || domain.userId !== userId) {
        return res.status(404).json({ message: "Domain not found" });
      }

      const dnsResult = await verifyDomainDNS(domain.subdomain);
      
      const updated = await storage.updateDomain(domainId, {
        isVerified: dnsResult.verified,
        lastCheckedAt: new Date(),
        lastVerificationError: dnsResult.error || null,
        sslStatus: dnsResult.verified ? "active" : "pending",
      });

      if (!dnsResult.verified) {
        return res.status(400).json({ 
          message: dnsResult.error || "DNS verification failed",
          domain: updated
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error verifying domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/domains/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const domainId = parseInt(req.params.id);
      const domain = await storage.getDomain(domainId);

      if (!domain || domain.userId !== userId) {
        return res.status(404).json({ message: "Domain not found" });
      }

      // Sync with EasyPanel (remove domain automatically)
      const { easypanelService } = await import("./easypanel");
      if (easypanelService.isConfigured()) {
        const result = await easypanelService.removeDomain(domain.subdomain);
        if (!result.success) {
          console.log(`[EasyPanel] Failed to remove domain, but continuing: ${result.error}`);
        }
      }

      await storage.deleteDomain(domainId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/logs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offerId = req.query.offerId && req.query.offerId !== "all" ? parseInt(req.query.offerId as string) : undefined;
      const redirectType = req.query.redirectType && req.query.redirectType !== "all" ? req.query.redirectType as string : undefined;

      const result = await storage.getClickLogs(userId, page, limit, { offerId, redirectType });
      res.json(result);
    } catch (error) {
      console.error("Error fetching logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/notifications", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const notifications = await storage.getNotificationsByUserId(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const notificationId = parseInt(req.params.id);
      await storage.markNotificationAsRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/stripe/config", async (req: Request, res: Response) => {
    try {
      const publishableKey = getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error fetching Stripe config:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/billing/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { planId } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const stripe = getStripeClient();
      
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        await storage.updateUser(userId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const priceResult = await db.execute(
        sql`SELECT id FROM stripe.prices WHERE product = ${plan.stripePriceId} AND active = true LIMIT 1`
      );
      const priceId = priceResult.rows[0]?.id as string;

      if (!priceId && plan.stripePriceId) {
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: plan.stripePriceId, quantity: 1 }],
          mode: 'subscription',
          success_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=success`,
          cancel_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=cancelled`,
          subscription_data: plan.hasTrial ? { trial_period_days: plan.trialDays } : undefined,
          metadata: { userId, planId: String(planId) },
        });
        return res.json({ url: session.url });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ 
          price_data: {
            currency: 'brl',
            product_data: { name: plan.name },
            unit_amount: plan.price * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1 
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/dashboard?checkout=cancelled`,
        subscription_data: plan.hasTrial ? { trial_period_days: plan.trialDays } : undefined,
        metadata: { userId, planId: String(planId) },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/billing/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const stripe = getStripeClient();
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${req.protocol}://${req.get('host')}/settings`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating billing portal:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/billing/invoices", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.json([]);
      }

      const stripe = getStripeClient();
      const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 10,
      });

      res.json(invoices.data.map(inv => ({
        id: inv.id,
        amount: inv.amount_due / 100,
        currency: inv.currency,
        status: inv.status,
        date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        pdfUrl: inv.invoice_pdf,
      })));
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/change-password", isAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 20;
      const search = req.query.search as string | undefined;
      const result = await storage.getAllUsers(page, limit, search);
      res.json({ ...result, page, limit });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/suspend", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { suspend } = req.body;
      await storage.updateUser(userId, {
        suspendedAt: suspend ? new Date() : null,
        suspensionReason: suspend ? "Admin suspended" : null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/change-plan", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { planId } = req.body;
      await storage.updateUser(userId, { planId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/add-days", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { days } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const currentEnd = user.subscriptionEndDate || new Date();
      const newEnd = new Date(currentEnd);
      newEnd.setDate(newEnd.getDate() + days);
      await storage.updateUser(userId, { subscriptionEndDate: newEnd });
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding days:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/force-payment", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      await storage.updateUser(userId, {
        subscriptionStatus: "active",
        subscriptionEndDate: endDate,
        suspendedAt: null,
        suspensionReason: null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error forcing payment:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/impersonate/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const adminId = (req.user as any).id;
      const targetUserId = req.params.id;
      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await storage.createAdminImpersonation(adminId, targetUserId, sessionToken, expiresAt);
      
      (req.session as any).impersonationToken = sessionToken;
      res.json({ success: true });
    } catch (error) {
      console.error("Error impersonating user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/impersonation/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const sessionToken = (req.session as any).impersonationToken;
      if (!sessionToken) {
        return res.json({ isImpersonating: false });
      }
      const impersonation = await storage.getAdminImpersonation(sessionToken);
      if (!impersonation) {
        return res.json({ isImpersonating: false });
      }
      const targetUser = await storage.getUser(impersonation.targetUserId);
      res.json({
        isImpersonating: true,
        targetUser: targetUser ? { id: targetUser.id, email: targetUser.email } : null,
      });
    } catch (error) {
      console.error("Error checking impersonation status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/impersonation/exit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const sessionToken = (req.session as any).impersonationToken;
      if (sessionToken) {
        await storage.deleteAdminImpersonation(sessionToken);
        delete (req.session as any).impersonationToken;
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error exiting impersonation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/config", isAdmin, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json({ logoUrl: settings?.logoPath || null });
    } catch (error) {
      console.error("Error fetching admin config:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/plans", isAdmin, async (req: Request, res: Response) => {
    try {
      const plan = await storage.createPlan(req.body);
      res.json(plan);
    } catch (error) {
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/plans/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      const updated = await storage.updatePlan(planId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Helper function to extract domain from request headers
  // Checks multiple headers that reverse proxies like EasyPanel, Nginx, Traefik may use
  function extractDomainFromRequest(req: Request): string {
    // Priority order for host detection from reverse proxies
    const hostHeaders = [
      req.get("x-forwarded-host"),
      req.get("x-original-host"),
      req.get("x-real-host"),
      req.get("x-host"),
      req.get("forwarded")?.match(/host=([^;,]+)/)?.[1],
      req.get("host"),
    ];
    
    for (const header of hostHeaders) {
      if (header) {
        // Remove port if present and normalize
        const domain = header.split(":")[0].toLowerCase().replace(/^www\./, '');
        if (domain && domain !== 'localhost' && !domain.match(/^127\./)) {
          return domain;
        }
      }
    }
    
    // Fallback to host header
    return (req.get("host") || "").split(":")[0].toLowerCase().replace(/^www\./, '');
  }

  // Cloaking redirect endpoint - handles clicks from TikTok/Facebook ads
  app.get("/r/:slug", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { slug } = req.params;
    const rawHost = req.get("host") || "";
    const host = rawHost.split(":")[0]; // Remove port if present
    const userAgent = req.get("user-agent") || "";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
    const referer = req.get("referer") || "";

    console.log(`[Cloak] Incoming request - Host: ${rawHost}, Slug: ${slug}, IP: ${ip}`);
    console.log(`[Cloak] All relevant headers: ${JSON.stringify({
      host: req.get("host"),
      "x-forwarded-host": req.get("x-forwarded-host"),
      "x-original-host": req.get("x-original-host"),
      "x-real-host": req.get("x-real-host"),
      "x-host": req.get("x-host"),
      "forwarded": req.get("forwarded"),
      "x-forwarded-proto": req.get("x-forwarded-proto"),
    })}`);

    try {
      // Extract domain using the helper function that checks multiple headers
      const domainToCheck = extractDomainFromRequest(req);
      
      console.log(`[Cloak] Looking for domain: ${domainToCheck}`);
      
      let domain = await storage.getDomainBySubdomain(domainToCheck);
      let offer = null;
      
      if (domain && domain.isActive && domain.isVerified) {
        // Found valid domain, get offer by slug and domain
        offer = await storage.getOfferBySlugAndDomain(slug, domain.id);
      } else {
        // Fallback: try to find offer by slug only (for testing/development)
        console.log(`[Cloak] Domain not found or invalid, trying fallback lookup for slug: ${slug}`);
        offer = await storage.getOfferBySlug(slug);
        if (offer && offer.domainId) {
          domain = await storage.getDomain(offer.domainId);
        }
      }
      
      if (!offer) {
        console.log(`[Cloak] Offer not found: ${slug}`);
        return res.status(404).send("Not found");
      }

      if (!offer.isActive) {
        console.log(`[Cloak] Offer inactive: ${slug}`);
        return res.status(404).send("Not found");
      }

      const owner = await storage.getUser(offer.userId);
      if (!owner) {
        return res.status(404).send("Not found");
      }

      const isSuspended = owner.suspendedAt !== null;
      if (isSuspended) {
        console.log(`[Cloak] User suspended: ${offer.userId}`);
        return res.redirect(302, offer.whitePageUrl);
      }

      // Check click limits
      const plan = owner.planId ? await storage.getPlan(owner.planId) : null;
      if (plan && !plan.isUnlimited) {
        const userOffers = await storage.getOffersByUserId(offer.userId);
        const totalClicks = userOffers.reduce((sum, o) => sum + (o.totalClicks || 0), 0);
        
        // If over limit (after 3-day grace period), redirect to white
        if (totalClicks >= plan.maxClicks) {
          const gracePeriodEnd = owner.subscriptionEndDate 
            ? new Date(new Date(owner.subscriptionEndDate).getTime() + 3 * 24 * 60 * 60 * 1000)
            : null;
          
          if (!gracePeriodEnd || new Date() > gracePeriodEnd) {
            console.log(`[Cloak] User over click limit: ${offer.userId} (${totalClicks}/${plan.maxClicks})`);
            return res.redirect(302, offer.whitePageUrl);
          }
        }
      }

      // Validate required parameters based on platform
      const { ttclid, cname, fbcl, xcode } = req.query as Record<string, string>;
      let paramsValid = false;
      let failReason = "";

      if (offer.platform === "tiktok") {
        // TikTok requires: ttclid, cname, xcode
        if (!ttclid || !cname || !xcode) {
          failReason = "missing_tiktok_params";
        } else if (xcode !== offer.xcode) {
          failReason = "invalid_xcode";
        } else {
          paramsValid = true;
        }
      } else if (offer.platform === "facebook") {
        // Facebook requires: fbcl (campaign.name|campaign.id), xcode
        if (!fbcl || !xcode) {
          failReason = "missing_facebook_params";
        } else if (xcode !== offer.xcode) {
          failReason = "invalid_xcode";
        } else {
          const parts = fbcl.split("|");
          if (parts.length < 2 || !parts[0] || !parts[1]) {
            failReason = "invalid_fbcl_format";
          } else {
            paramsValid = true;
          }
        }
      }

      // Check device filter
      const deviceType = parseUserAgent(userAgent);
      const deviceAllowed = offer.allowedDevices.includes(deviceType);

      // Check country filter
      const country = await getCountryFromIP(ip);
      const countryAllowed = offer.allowedCountries.includes(country);

      // Determine redirect type
      const shouldRedirectToBlack = paramsValid && deviceAllowed && countryAllowed;
      const redirectType = shouldRedirectToBlack ? "black" : "white";
      const targetUrl = shouldRedirectToBlack ? offer.blackPageUrl : offer.whitePageUrl;

      // Log the click
      await storage.createClickLog({
        offerId: offer.id,
        userId: offer.userId,
        ipAddress: ip,
        userAgent,
        country,
        device: deviceType,
        redirectedTo: redirectType,
        allParams: {
          domainId: domain?.id || offer.domainId || null,
          platform: offer.platform,
          referer,
          ttclid: ttclid || null,
          fbcl: fbcl || null,
          campaignName: offer.platform === "tiktok" ? cname : (fbcl?.split("|")[0] || null),
          campaignId: offer.platform === "facebook" ? (fbcl?.split("|")[1] || null) : null,
          failReason: shouldRedirectToBlack ? null : failReason || `device:${!deviceAllowed};country:${!countryAllowed}`,
        },
      });

      // Increment click counters
      await storage.incrementOfferClicks(offer.id, shouldRedirectToBlack);

      const duration = Date.now() - startTime;
      console.log(`[Cloak] ${redirectType.toUpperCase()} redirect for ${slug} (${duration}ms) - device:${deviceType}, country:${country}, params:${paramsValid ? "ok" : failReason}`);

      return res.redirect(302, targetUrl);
    } catch (error) {
      console.error("[Cloak] Error:", error);
      return res.status(500).send("Internal server error");
    }
  });

  // Alternative cloaking route without /r/ prefix - for cleaner URLs
  // This catches /:slug patterns on custom domains only
  app.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
    const { slug } = req.params;
    
    console.log(`[CLOAK /:slug] Received request for slug: ${slug}`);
    
    // Skip known routes and static files
    const skipPaths = ["api", "assets", "src", "@", "node_modules", "favicon.ico", "robots.txt"];
    if (skipPaths.some(p => slug.startsWith(p)) || slug.includes(".")) {
      console.log(`[CLOAK /:slug] Skipping - matches skip pattern`);
      return next();
    }
    
    // Use the same helper function to extract domain from request headers
    const domainToCheck = extractDomainFromRequest(req);
    
    console.log(`[CLOAK /:slug] Host check - domainToCheck: ${domainToCheck}`);
    console.log(`[CLOAK /:slug] All relevant headers: ${JSON.stringify({
      host: req.get("host"),
      "x-forwarded-host": req.get("x-forwarded-host"),
      "x-original-host": req.get("x-original-host"),
      "x-real-host": req.get("x-real-host"),
      "x-host": req.get("x-host"),
      "forwarded": req.get("forwarded"),
    })}`);
    
    // Only handle if it's a registered custom domain (not the main app domain)
    const domain = await storage.getDomainBySubdomain(domainToCheck);
    console.log(`[CLOAK /:slug] Domain lookup result:`, domain ? { id: domain.id, subdomain: domain.subdomain, isActive: domain.isActive, isVerified: domain.isVerified } : null);
    
    if (!domain || !domain.isActive || !domain.isVerified) {
      console.log(`[CLOAK /:slug] Domain not found/inactive/unverified - passing to next()`);
      return next(); // Let other routes handle it
    }
    
    // Check if offer exists for this slug
    const offer = await storage.getOfferBySlugAndDomain(slug, domain.id);
    console.log(`[CLOAK /:slug] Offer lookup result:`, offer ? { id: offer.id, slug: offer.slug, domainId: offer.domainId } : null);
    
    if (!offer) {
      console.log(`[CLOAK /:slug] Offer not found for slug ${slug} on domain ${domain.id} - passing to next()`);
      return next(); // Not a valid offer slug
    }
    
    console.log(`[CLOAK /:slug] Processing cloaking for offer: ${offer.slug}`);
    
    // Forward to the main cloaking handler by rewriting the URL
    req.url = `/r/${slug}`;
    req.params.slug = slug;
    
    // Manually trigger the /r/:slug handler logic
    const startTime = Date.now();
    const userAgent = req.get("user-agent") || "";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
    const referer = req.get("referer") || "";

    try {
      if (!offer.isActive) {
        console.log(`[Cloak] Offer inactive: ${slug}`);
        return res.status(404).send("Not found");
      }

      const owner = await storage.getUser(offer.userId);
      if (!owner) {
        return res.status(404).send("Not found");
      }

      const isSuspended = owner.suspendedAt !== null;
      if (isSuspended) {
        console.log(`[Cloak] User suspended: ${offer.userId}`);
        return res.redirect(302, offer.whitePageUrl);
      }

      // Check click limits
      const plan = owner.planId ? await storage.getPlan(owner.planId) : null;
      if (plan && !plan.isUnlimited) {
        const userOffers = await storage.getOffersByUserId(offer.userId);
        const totalClicks = userOffers.reduce((sum, o) => sum + (o.totalClicks || 0), 0);
        
        if (totalClicks >= plan.maxClicks) {
          const gracePeriodEnd = owner.subscriptionEndDate 
            ? new Date(new Date(owner.subscriptionEndDate).getTime() + 3 * 24 * 60 * 60 * 1000)
            : null;
          
          if (!gracePeriodEnd || new Date() > gracePeriodEnd) {
            console.log(`[Cloak] User over click limit: ${offer.userId} (${totalClicks}/${plan.maxClicks})`);
            return res.redirect(302, offer.whitePageUrl);
          }
        }
      }

      // Validate required parameters based on platform
      const { ttclid, cname, fbcl, xcode } = req.query as Record<string, string>;
      let paramsValid = false;
      let failReason = "";

      if (offer.platform === "tiktok") {
        if (!ttclid || !cname || !xcode) {
          failReason = "missing_tiktok_params";
        } else if (xcode !== offer.xcode) {
          failReason = "invalid_xcode";
        } else {
          paramsValid = true;
        }
      } else if (offer.platform === "facebook") {
        if (!fbcl || !xcode) {
          failReason = "missing_facebook_params";
        } else if (xcode !== offer.xcode) {
          failReason = "invalid_xcode";
        } else {
          const parts = fbcl.split("|");
          if (parts.length < 2 || !parts[0] || !parts[1]) {
            failReason = "invalid_fbcl_format";
          } else {
            paramsValid = true;
          }
        }
      }

      const deviceType = parseUserAgent(userAgent);
      const deviceAllowed = offer.allowedDevices.includes(deviceType);
      const country = await getCountryFromIP(ip);
      const countryAllowed = offer.allowedCountries.includes(country);

      const shouldRedirectToBlack = paramsValid && deviceAllowed && countryAllowed;
      const redirectType = shouldRedirectToBlack ? "black" : "white";
      const targetUrl = shouldRedirectToBlack ? offer.blackPageUrl : offer.whitePageUrl;

      await storage.createClickLog({
        offerId: offer.id,
        userId: offer.userId,
        ipAddress: ip,
        userAgent,
        country,
        device: deviceType,
        redirectedTo: redirectType,
        allParams: {
          domainId: domain?.id || offer.domainId || null,
          platform: offer.platform,
          referer,
          ttclid: ttclid || null,
          fbcl: fbcl || null,
          campaignName: offer.platform === "tiktok" ? cname : (fbcl?.split("|")[0] || null),
          campaignId: offer.platform === "facebook" ? (fbcl?.split("|")[1] || null) : null,
          failReason: shouldRedirectToBlack ? null : failReason || `device:${!deviceAllowed};country:${!countryAllowed}`,
        },
      });

      await storage.incrementOfferClicks(offer.id, shouldRedirectToBlack);

      const duration = Date.now() - startTime;
      console.log(`[Cloak] ${redirectType.toUpperCase()} redirect for ${slug} (${duration}ms) - device:${deviceType}, country:${country}, params:${paramsValid ? "ok" : failReason}`);

      return res.redirect(302, targetUrl);
    } catch (error) {
      console.error("[Cloak] Error:", error);
      return res.status(500).send("Internal server error");
    }
  });

  return httpServer;
}
