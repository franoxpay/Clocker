/**
 * server/health/routes.ts
 *
 * Endpoints de saúde do sistema.
 *
 * Autenticação — qualquer uma das condições abaixo libera acesso:
 *   1. Header X-Internal-Token = INTERNAL_HEALTH_TOKEN  (monitor externo, sem sessão)
 *   2. Sessão admin válida  →  requireAdmin (mesmo middleware de /api/admin/*)
 *        a. users.isAdmin = true no banco               (fonte: database)
 *        b. ADMIN_EMAIL env var como fallback            (fonte: admin_email_fallback, loga WARNING)
 *
 * Regra: se o usuário acessa /confg-admin → acessa /api/internal/health.
 *
 * Endpoints:
 *   GET /api/internal/health         — relatório completo de todos os serviços
 *   GET /api/internal/health/summary — status ultra-leve para monitores externos
 */

import type { Express, Request, Response, NextFunction } from "express";
import { runHealthChecks, runHealthSummary } from "./runner";
import { checkIsAdmin } from "../auth/permissions";
import { storage } from "../storage";

// ─── Guard middleware ────────────────────────────────────────────────────────

async function guardHealth(req: Request, res: Response, next: NextFunction) {
  // 1. Fast-path: token estático para monitor externo
  const internalToken = process.env.INTERNAL_HEALTH_TOKEN;
  if (internalToken && req.headers["x-internal-token"] === internalToken) {
    console.log(JSON.stringify({
      event: "HEALTH_AUTH_RESULT",
      granted: true,
      reason: "internal_token",
      hasSession: false,
      sessionUserId: null,
      userLoaded: false,
      isAdmin: false,
      path: req.path,
      timestamp: new Date().toISOString(),
    }));
    return next();
  }

  // 2. Sessão admin (igual a qualquer rota /api/admin/*)
  const sessionUserId: string | undefined = (req as any).session?.userId;
  const hasSession = !!sessionUserId;

  if (!hasSession) {
    console.log(JSON.stringify({
      event: "HEALTH_AUTH_RESULT",
      granted: false,
      reason: "no_session",
      hasSession: false,
      sessionUserId: null,
      userLoaded: false,
      isAdmin: false,
      path: req.path,
      timestamp: new Date().toISOString(),
    }));
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const check = await checkIsAdmin(sessionUserId!);

    console.log(JSON.stringify({
      event: "HEALTH_AUTH_RESULT",
      granted: check.granted,
      reason: check.granted ? check.source : "not_admin",
      hasSession,
      sessionUserId,
      userLoaded: !!check.user,
      isAdmin: check.userIsAdminFromDb,
      adminEmailFallback: check.adminEmailMatch && !check.userIsAdminFromDb,
      path: req.path,
      timestamp: new Date().toISOString(),
    }));

    if (!check.granted) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  } catch (err: any) {
    console.error("[Health] guardHealth error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export function registerHealthRoutes(app: Express): void {
  app.get("/api/internal/health", guardHealth, async (req: Request, res: Response) => {
    try {
      const report = await runHealthChecks();

      if (report.status === "critical") {
        console.error("[Health] CRITICAL — system health check returned critical status");
      } else if (report.status === "degraded") {
        console.warn("[Health] DEGRADED — one or more services are unhealthy");
      }

      for (const [name, result] of Object.entries(report.services)) {
        if (result.status !== "healthy") {
          console.warn(
            `[Health] Service "${name}" is ${result.status}${result.error ? `: ${result.error}` : ""}`,
          );
        }
      }

      const httpStatus = report.status === "critical" ? 503 : 200;
      res.status(httpStatus).json(report);
    } catch (err: any) {
      console.error("[Health] Failed to run health checks:", err.message);
      res.status(500).json({ error: "Health check failed to complete" });
    }
  });

  app.get("/api/internal/health/summary", guardHealth, async (req: Request, res: Response) => {
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
