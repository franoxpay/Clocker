import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { isStripeConfigured, getStripeSync, getStripeClient, validateStripeConfig } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import rateLimit from "express-rate-limit";
import { setupWebSocket } from "./websocketService";
import { initEasyPanel } from "./easypanel";
import { storage } from "./storage";
import { startDomainMonitor } from "./domainMonitor";
import { startSubscriptionReminder } from "./subscriptionReminder";
import { getRedisClient } from "./redis";
import { startBackupScheduler } from "./scripts/backupScheduler";
import { startLimitEnforcer } from "./limitEnforcer";
import { pool } from "./db";

const app = express();
app.set('trust proxy', true);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function getDbUrl(): string {
  if (process.env.EXTERNAL_DATABASE_URL) return process.env.EXTERNAL_DATABASE_URL;
  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER) {
    const { PGUSER, PGPASSWORD = '', PGHOST, PGPORT = '5432', PGDATABASE } = process.env;
    return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
  }
  return process.env.DATABASE_URL || '';
}

async function initStripe() {
  // Validate keys and log status clearly
  await validateStripeConfig();

  const configured = await isStripeConfigured();
  if (!configured) {
    console.log('[Stripe] Not configured — billing features disabled');
    return;
  }

  const databaseUrl = getDbUrl();
  if (!databaseUrl) {
    console.log('[Stripe] No database URL available — skipping Stripe sync setup');
    return;
  }

  try {
    console.log('[Stripe] Running schema migrations...');
    const { runMigrations } = await import('stripe-replit-sync');
    await runMigrations({ databaseUrl });
    console.log('[Stripe] Schema ready');

    const stripeSync = await getStripeSync();

    const replitDomains = process.env.REPLIT_DOMAINS?.split(',') || [];
    const webhookBaseUrl = replitDomains[0] ? `https://${replitDomains[0]}` : '';

    if (webhookBaseUrl) {
      console.log('[Stripe] Setting up managed webhook...');
      try {
        const { webhook } = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`,
          {
            enabled_events: [
              'customer.created',
              'customer.updated',
              'customer.deleted',
              'customer.subscription.created',
              'customer.subscription.updated',
              'customer.subscription.deleted',
              'invoice.created',
              'invoice.paid',
              'invoice.payment_failed',
              'invoice.payment_succeeded',
              'checkout.session.completed',
              'charge.refunded',
              'charge.dispute.created',
              'charge.dispute.closed',
              'payment_intent.succeeded',
              'payment_intent.payment_failed',
              'product.created',
              'product.updated',
              'product.deleted',
              'price.created',
              'price.updated',
              'price.deleted',
            ]
          }
        );
        console.log(`[Stripe] Managed webhook configured: ${webhook.url}`);
      } catch (webhookErr: any) {
        console.warn(`[Stripe] Managed webhook setup failed (will use STRIPE_WEBHOOK_SECRET fallback): ${webhookErr.message}`);
      }
    }

    console.log('[Stripe] Syncing data in background...');
    stripeSync.syncBackfill()
      .then(() => console.log('[Stripe] Background sync complete'))
      .catch((err: any) => console.error('[Stripe] Background sync error:', err.message));

    console.log('[Stripe] Initialized successfully');
  } catch (error: any) {
    if (error?.type === 'StripeAuthenticationError' || error?.code === 'api_key_expired') {
      console.error('[Stripe] CRITICAL: API key expired or invalid. Update STRIPE_SECRET_KEY in secrets.');
    } else {
      console.error('[Stripe] Initialization error:', error.message);
    }
  }
}

app.post(
  '/api/stripe/webhook/:uuid?',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      const uuid = req.params.uuid;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Support text/plain for sendBeacon (telemetry)
app.use(express.text({ type: 'text/plain' }));

app.use(express.urlencoded({ extended: false }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  skip: (req) => {
    // Never rate-limit cloak redirects or the auth user check (called on every page load)
    return req.path.startsWith("/r/") || req.path === "/auth/user";
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again in 15 minutes" },
});

app.use("/api", apiLimiter);
app.use("/api/login", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/password-reset", authLimiter);

// Helper function to check if host is the main application domain
function isMainDomain(host: string): boolean {
  const mainDomains = (process.env.MAIN_DOMAIN || "").split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
  const replitDomains = (process.env.REPLIT_DOMAINS || "").split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
  const replitDevDomain = (process.env.REPLIT_DEV_DOMAIN || "").toLowerCase();
  
  const hostLower = host.toLowerCase().split(":")[0]; // Remove port if present
  
  // Check if it's a main domain
  if (mainDomains.some(d => hostLower === d || hostLower.endsWith(`.${d}`))) {
    return true;
  }
  
  // Check if it's a Replit domain
  if (replitDomains.some(d => hostLower === d || hostLower.endsWith(`.${d}`))) {
    return true;
  }
  
  // Check if it's the Replit dev domain
  if (replitDevDomain && (hostLower === replitDevDomain || hostLower.includes("replit"))) {
    return true;
  }
  
  // Also allow localhost for development
  if (hostLower.startsWith("localhost") || hostLower.startsWith("127.0.0.1")) {
    return true;
  }
  
  return false;
}

// Middleware to block access to cloaking domains without valid slugs
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  const path = req.path;
  
  // If it's the main domain, allow everything
  if (isMainDomain(host)) {
    return next();
  }
  
  // For custom domains, only allow specific paths
  // Allow: /r/:slug, /:slug (if slug is valid offer), favicon.ico, robots.txt
  // Also allow TikTok2 verification routes: /go/:token, /track/:token, /v/:token, /b/:token
  const allowedPaths = ["/favicon.ico", "/robots.txt", "/favicon.png"];
  
  if (allowedPaths.includes(path)) {
    return next();
  }
  
  // If path starts with /r/, let the cloaking route handle it
  if (path.startsWith("/r/")) {
    return next();
  }
  
  // Allow TikTok2 verification and bot tracking routes on custom domains
  // These are essential for the bait page redirect system
  if (path.startsWith("/go/") || path.startsWith("/track/") || path.startsWith("/v/") || path.startsWith("/b/") || path.startsWith("/tt2/")) {
    console.log(`[DOMAIN GUARD] Allowing TikTok2 route: ${path} on ${host}`);
    return next();
  }
  
  // For root path on custom domain, show a simple 404
  if (path === "/" || path === "") {
    console.log(`[DOMAIN GUARD] Blocking root access to custom domain: ${host}`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Not Found</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 40px; }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404</h1>
            <p>Page not found</p>
          </div>
        </body>
      </html>
    `);
  }
  
  // For paths like /:slug on custom domain, check if it's a valid offer
  // Extract the slug (first path segment)
  const slug = path.split("/")[1];
  
  if (slug && !slug.includes(".")) {
    // Check if this domain has an offer with this slug
    const hostClean = host.split(":")[0];
    
    // First check user-owned domains
    const domain = await storage.getDomainBySubdomain(hostClean);
    if (domain && domain.isActive && domain.isVerified) {
      const offer = await storage.getOfferBySlugAndDomain(slug, domain.id);
      if (offer && offer.isActive) {
        console.log(`[DOMAIN GUARD] Valid user domain offer: ${slug} on ${hostClean}`);
        return next();
      }
    }
    
    // Then check shared domains
    const sharedDomain = await storage.getSharedDomainBySubdomain(hostClean);
    if (sharedDomain && sharedDomain.isActive && sharedDomain.isVerified) {
      const offer = await storage.getOfferBySlugAndSharedDomain(slug, sharedDomain.id);
      if (offer && offer.isActive) {
        console.log(`[DOMAIN GUARD] Valid shared domain offer: ${slug} on ${hostClean}`);
        return next();
      }
    }
    
    // Not a valid offer slug on this domain (checked both user and shared)
    console.log(`[DOMAIN GUARD] Invalid slug "${slug}" on domain: ${host}`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Not Found</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 40px; }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404</h1>
            <p>Page not found</p>
          </div>
        </body>
      </html>
    `);
  }
  
  // For other paths (like assets), block on custom domains
  console.log(`[DOMAIN GUARD] Blocking path "${path}" on custom domain: ${host}`);
  return res.status(404).send("Not found");
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const host = req.get("host") || "";
  const forwardedHost = req.get("x-forwarded-host") || "";
  const forwardedProto = req.get("x-forwarded-proto") || "";
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  console.log(`[REQUEST] ${req.method} ${path} - Host: ${host}, X-Forwarded-Host: ${forwardedHost}, Proto: ${forwardedProto}`);

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[RESPONSE] ${req.method} ${path} ${res.statusCode} in ${duration}ms - Host: ${forwardedHost || host}`);
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function runSafeMigrations() {
  const client = await pool.connect();
  try {
    console.log("[Migration] Running safe schema migrations...");

    // Fix: make commissions.coupon_id nullable (was NOT NULL)
    await client.query(`ALTER TABLE commissions ALTER COLUMN coupon_id DROP NOT NULL`);

    // Fix: drop old CASCADE FK on coupon_id and replace with SET NULL
    const fkRes = await client.query(`
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'commissions'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'coupon_id'
      LIMIT 1
    `);
    if (fkRes.rows.length > 0) {
      const oldFk = fkRes.rows[0].constraint_name;
      await client.query(`ALTER TABLE commissions DROP CONSTRAINT "${oldFk}"`);
    }
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE commissions ADD CONSTRAINT commissions_coupon_id_fk
          FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Fix: add unique partial index on stripe_invoice_id (nulls excluded to allow multiple nulls)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS commissions_stripe_invoice_idx
        ON commissions(stripe_invoice_id)
        WHERE stripe_invoice_id IS NOT NULL
    `);

    // Add pending plan change fields for scheduled downgrades
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_plan_id integer`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_plan_change_at timestamp`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_plan_change_type varchar`);

    // B2 fix: make coupon_usages.coupon_id nullable and switch FK from CASCADE to SET NULL
    // so that deleting a coupon preserves the usage history (coupon_id becomes null)
    await client.query(`ALTER TABLE coupon_usages ALTER COLUMN coupon_id DROP NOT NULL`);
    const cuFkRes = await client.query(`
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_name = tc.table_name
      WHERE tc.table_name = 'coupon_usages'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'coupon_id'
      LIMIT 1
    `);
    if (cuFkRes.rows.length > 0) {
      const oldCuFk = cuFkRes.rows[0].constraint_name;
      await client.query(`ALTER TABLE coupon_usages DROP CONSTRAINT "${oldCuFk}"`);
      console.log(`[Migration] Dropped old CASCADE FK on coupon_usages.coupon_id (${oldCuFk})`);
    }
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE coupon_usages ADD CONSTRAINT coupon_usages_coupon_id_fk
          FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    console.log("[Migration] coupon_usages.coupon_id FK changed to SET NULL — usage history is now preserved on coupon deletion.");

    console.log("[Migration] Safe schema migrations complete.");
  } catch (err: any) {
    console.error("[Migration] Error during safe migrations:", err.message);
  } finally {
    client.release();
  }
}

async function ensureFreePlanExists() {
  try {
    const freePlan = await storage.getFreePlan();
    if (!freePlan) {
      console.log("[Seed] Creating default free plan...");
      await storage.createPlan({
        name: "Free",
        nameEn: "Free",
        price: 0,
        maxOffers: 0,
        maxDomains: 0,
        maxClicks: 0,
        hasTrial: false,
        trialDays: 0,
        isActive: true,
        isUnlimited: false,
        isPopular: false,
        isFree: true,
        isDefault: true,
        stripePriceId: null,
        stripeProductId: null,
      });
      console.log("[Seed] Free plan created.");
    }
  } catch (err: any) {
    console.error("[Seed] Failed to ensure free plan:", err.message);
  }
}

async function reconcileStaleSubscriptions() {
  try {
    const stripeAvailable = await isStripeConfigured();
    if (!stripeAvailable) {
      console.log("[Reconcile] Stripe not configured, skipping subscription reconciliation");
      return;
    }

    const staleUsers = await storage.getUsersWithStaleActiveSubscription();
    if (staleUsers.length === 0) {
      console.log("[Reconcile] No stale subscriptions found");
      return;
    }

    console.log(`[Reconcile] Found ${staleUsers.length} user(s) with stale active subscription — checking Stripe...`);
    const stripe = await getStripeClient();

    for (const user of staleUsers) {
      try {
        if (!user.stripeSubscriptionId) continue;

        const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const stripeStatus = sub.status;
        const periodEndTs = (sub as any).current_period_end;
        const endedAtTs = (sub as any).ended_at;
        const stripeEndDate = periodEndTs ? new Date(periodEndTs * 1000) : null;
        const stripeEndedAt = endedAtTs ? new Date(endedAtTs * 1000) : null;

        console.log(`[Reconcile] User ${user.id} (${user.email}): Stripe status=${stripeStatus}, period_end=${stripeEndDate?.toISOString() ?? 'null'}`);

        const isActive = stripeStatus === 'active' || stripeStatus === 'trialing';

        if (isActive && stripeEndDate) {
          // Subscription is still active in Stripe — just update our end date
          await storage.updateUser(user.id, {
            subscriptionStatus: stripeStatus,
            subscriptionEndDate: stripeEndDate,
          });
          console.log(`[Reconcile] Updated user ${user.id} end date to ${stripeEndDate.toISOString()} (still active in Stripe)`);
        } else {
          // Subscription is not active in Stripe — downgrade immediately
          await storage.updateUser(user.id, {
            subscriptionStatus: stripeStatus,
            subscriptionEndDate: stripeEndedAt ?? stripeEndDate ?? new Date(),
          });
          await storage.downgradeUserToFreePlan(user.id);
          console.log(`[Reconcile] Downgraded user ${user.id} to free plan — Stripe status: ${stripeStatus}`);
        }
      } catch (userErr: any) {
        console.error(`[Reconcile] Failed to reconcile user ${user.id}:`, userErr.message);
      }
    }

    console.log("[Reconcile] Subscription reconciliation complete");
  } catch (err: any) {
    console.error("[Reconcile] Failed to run reconciliation:", err.message);
  }
}

(async () => {
  await initStripe();
  initEasyPanel();
  
  // Initialize Redis connection
  const redisClient = getRedisClient();
  if (redisClient) {
    console.log("[Redis] Initializing connection...");
  }
  
  await runSafeMigrations();
  await ensureFreePlanExists();
  reconcileStaleSubscriptions().catch((err: any) =>
    console.error("[Reconcile] Unhandled error:", err.message)
  );
  // Re-run reconciliation every 4 hours to catch any missed webhooks
  setInterval(() => {
    reconcileStaleSubscriptions().catch((err: any) =>
      console.error("[Reconcile] Periodic unhandled error:", err.message)
    );
  }, 4 * 60 * 60 * 1000);
  
  // Webhook event log cleanup: keep last 90 days, run on startup + daily
  async function runWebhookEventCleanup() {
    try {
      await storage.cleanupOldWebhookEvents(90);
    } catch (err: any) {
      console.error("[WebhookCleanup] Error:", err.message);
    }
  }
  runWebhookEventCleanup();
  setInterval(runWebhookEventCleanup, 24 * 60 * 60 * 1000); // every 24h

  // ── PARTE 2 — Startup diagnostics ──────────────────────────────────────────
  {
    const os = await import("os");
    const { OFFICIAL_CNAME } = await import("./domainUtils");
    console.log(JSON.stringify({
      event: "SERVER_STARTUP_DIAGNOSTICS",
      processPid: process.pid,
      hostname: os.hostname(),
      NODE_ENV: process.env.NODE_ENV,
      MAIN_DOMAIN: process.env.MAIN_DOMAIN || "(not set)",
      CNAME_TARGET_ENV: process.env.CNAME_TARGET || "(not set — fallback: clerion.app)",
      OFFICIAL_CNAME,
      DISABLE_DOMAIN_AUTO_DEACTIVATION: process.env.DISABLE_DOMAIN_AUTO_DEACTIVATION || "(not set — deactivation ENABLED)",
      BASE_URL: process.env.BASE_URL || "(not set)",
      timestamp: new Date().toISOString(),
    }));
  }

  setupWebSocket(httpServer);
  startDomainMonitor();
  startSubscriptionReminder();
  startBackupScheduler();
  startLimitEnforcer();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
