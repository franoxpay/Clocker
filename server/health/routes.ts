/**
 * server/health/routes.ts
 *
 * Registers health check endpoints under /api/internal/health.
 *
 * Authentication (either satisfies):
 *   1. Session-based admin (req.user.isAdmin === true)
 *   2. X-Internal-Token header matches INTERNAL_HEALTH_TOKEN env var
 *
 * Endpoints:
 *   GET /api/internal/health          — full structured report
 *   GET /api/internal/health/summary  — ultra-light status for external monitors
 */

import type { Express, Request, Response, NextFunction } from "express";
import { runHealthChecks, runHealthSummary } from "./runner";

console.log("[Health] Health monitoring system initialized");

// ─── Auth middleware ────────────────────────────────────────────────────────────

function requireHealthAuth(req: Request, res: Response, next: NextFunction): void {
  // Option 1: static internal token (for external monitors / uptime bots)
  const internalToken = process.env.INTERNAL_HEALTH_TOKEN;
  if (internalToken && req.headers["x-internal-token"] === internalToken) {
    return next();
  }

  // Option 2: session-based admin user
  const user = (req as any).user;
  if (user?.isAdmin === true) {
    return next();
  }

  res.status(401).json({ error: "Unauthorized" });
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export function registerHealthRoutes(app: Express): void {
  // Full health report
  app.get("/api/internal/health", requireHealthAuth, async (req: Request, res: Response) => {
    try {
      const report = await runHealthChecks();

      // Log degraded/critical transitions
      if (report.status === "critical") {
        console.error("[Health] 🔴 CRITICAL — system health check returned critical status");
      } else if (report.status === "degraded") {
        console.warn("[Health] 🟡 DEGRADED — one or more services are unhealthy");
      }

      // Log individual degraded services
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
