/**
 * server/health/routes.ts
 *
 * Registers health check endpoints under /api/internal/health.
 *
 * Authentication (any of the following satisfies):
 *   1. X-Internal-Token header matches INTERNAL_HEALTH_TOKEN env var
 *   2. requirePermission("admin:monitoring") — delegates to centralized permissions:
 *        a. users.isAdmin = true in DB          (source: database)
 *        b. ADMIN_EMAIL env var email match     (source: admin_email_fallback, logs WARNING)
 *
 * Endpoints:
 *   GET /api/internal/health          — full structured report
 *   GET /api/internal/health/summary  — ultra-light status for external monitors
 */

import type { Express, Request, Response, NextFunction } from "express";
import { runHealthChecks, runHealthSummary } from "./runner";
import { requirePermission } from "../auth/permissions";

// ─── Static token fast-path ────────────────────────────────────────────────

function withInternalTokenFallback(
  handler: (req: Request, res: Response, next: NextFunction) => void
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const internalToken = process.env.INTERNAL_HEALTH_TOKEN;
    if (internalToken && req.headers["x-internal-token"] === internalToken) {
      return next();
    }
    return handler(req, res, next);
  };
}

const guardMonitoring = withInternalTokenFallback(requirePermission("admin:monitoring"));

// ─── Routes ────────────────────────────────────────────────────────────────

export function registerHealthRoutes(app: Express): void {
  app.get("/api/internal/health", guardMonitoring, async (req: Request, res: Response) => {
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

  app.get("/api/internal/health/summary", guardMonitoring, async (req: Request, res: Response) => {
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
