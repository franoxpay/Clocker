import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { isStripeConfigured } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import rateLimit from "express-rate-limit";
import { setupWebSocket } from "./websocketService";
import { initEasyPanel } from "./easypanel";
import { storage } from "./storage";

const app = express();
app.set('trust proxy', true);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  if (!isStripeConfigured()) {
    console.log('Stripe not configured, skipping initialization. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env');
    return;
  }
  console.log('Stripe configured successfully via environment variables');
}

app.post(
  '/api/stripe/webhook',
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
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
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

app.use(express.urlencoded({ extended: false }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  skip: (req) => req.path.startsWith("/r/"),
});

const authLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again in 30 minutes" },
});

app.use("/api", apiLimiter);
app.use("/api/login", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/callback", authLimiter);
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
  if (path.startsWith("/go/") || path.startsWith("/track/") || path.startsWith("/v/") || path.startsWith("/b/")) {
    console.log(`[DOMAIN GUARD] Allowing TikTok2 verification route: ${path} on ${host}`);
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

(async () => {
  await initStripe();
  initEasyPanel();
  setupWebSocket(httpServer);
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
