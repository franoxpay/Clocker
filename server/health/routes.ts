/**
 * server/health/routes.ts
 *
 * Registers health check endpoints under /api/internal/health.
 *
 * Authentication (any of the following satisfies):
 *   1. X-Internal-Token header matches INTERNAL_HEALTH_TOKEN env var
 *   2. Session user has user.isAdmin === true in the database  ← primary
 *   3. Session user email matches ADMIN_EMAIL env var          ← fallback
 *
 * Endpoints:
 *   GET /api/internal/health          — full structured report
 *   GET /api/internal/health/summary  — ultra-light status for external monitors
 */

import type { Express, Request, Response, NextFunction } from "express";
import { runHealthChecks, runHealthSummary } from "./runner";
import { storage } from "../storage";

// ─── Auth middleware ────────────────────────────────────────────────────────────

async function requireHealthAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Option 1: static internal token (for external monitors / uptime bots)
  const internalToken = process.env.INTERNAL_HEALTH_TOKEN;
  if (internalToken && req.headers["x-internal-token"] === internalToken) {
    return next();
  }

  // Option 2 & 3: session-based admin user
  // req.user is populated by Passport after isAuthenticated, but health routes
  // don't go through that middleware, so we read the session directly.
  const userId = req.session?.userId;
  if (!userId) {
    console.log("[Health] Auth denied — no session userId");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      console.log(`[Health] Auth denied — userId ${userId} not found in DB`);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Primary: trust the isAdmin flag stored in the database
    const isAdminByFlag = user.isAdmin === true;

    // Fallback: compare against ADMIN_EMAIL env var (email-based)
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const isAdminByEmail = !!(adminEmail && user.email?.toLowerCase() === adminEmail);

    const granted = isAdminByFlag || isAdminByEmail;

    console.log(JSON.stringify({
      event: "HEALTH_AUTH_CHECK",
      userId,
      userEmail: user.email,
      isAdminByFlag,
      isAdminByEmail,
      ADMIN_EMAIL_SET: !!adminEmail,
      granted,
      timestamp: new Date().toISOString(),
    }));

    if (!granted) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    return next();
  } catch (err: any) {
    console.error("[Health] Auth check error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export function registerHealthRoutes(app: Express): void {
  // Full health report
  app.get("/api/internal/health", requireHealthAuth, async (req: Request, res: Response) => {
    try {
      const report = await runHealthChecks();

      if (report.status === "critical") {
        console.error("[Health] CRITICAL — system health check returned critical status");
      } else if (report.status === "degraded") {
        console.warn("[Health] DEGRADED — one or more services are unhealthy");
      }

      for (const [name, result] of Object.entries(report.services)) {
        if (result.status !== "healthy") {
          console.warn(`[Health] Service "${name}" is ${result.status}${result.error ? `: ${result.error}` : ""}`);
        }
      }

      const httpStatus = report.status === "critical" ? 503 : 200;
      res.status(httpStatus).json(report);
    } catch (err: any) {
      console.error("[Health] Failed to run health checks:", err.message);
      res.status(500).json({ error: "Health check failed to complete" });
    }
  });

  // Ultra-light summary (for uptime monitors)
  app.get("/api/internal/health/summary", requireHealthAuth, async (req: Request, res: Response) => {
    try {
      const summary = await runHealthSummary();
      const httpStatus = summary.status === "critical" ? 503 : 200;
      res.status(httpStatus).json(summary);
    } catch (err: any) {
      console.error("[Health] Failed to run summary check:", err.message);
      res.status(500).json({ error: "Health summary failed" });
    }
  });
}
