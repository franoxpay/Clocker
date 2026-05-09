/**
 * server/health/routes.ts
 *
 * Endpoints de saúde do sistema.
 *
 * Autenticação — qualquer uma das condições abaixo libera acesso:
 *   1. Header X-Internal-Token = INTERNAL_HEALTH_TOKEN  (monitor externo, sem sessão)
 *   2. isAuthenticated + isAdmin  — EXATAMENTE os mesmos middlewares de /api/admin/*
 *
 * Regra: se o usuário acessa /confg-admin → acessa /api/internal/health.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { runHealthChecks, runHealthSummary } from "./runner";
import { isAuthenticated, isAdmin } from "../replitAuth";

// ─── Token estático (monitor externo sem sessão) ─────────────────────────────

function internalTokenMiddleware(req: Request, res: Response, next: NextFunction) {
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
  // Sem token válido: passa para o middleware de sessão normal
  return next("route");
}

// ─── Guard composto ──────────────────────────────────────────────────────────
// Rota A: token interno → libera direto
// Rota B: sessão admin → isAuthenticated + isAdmin (igual /api/admin/*)

function registerGuardedRoute(
  app: Express,
  method: "get" | "post",
  path: string,
  handler: (req: Request, res: Response) => Promise<void>,
) {
  // Caminho 1: token interno
  app[method](path, internalTokenMiddleware, handler);

  // Caminho 2: sessão admin (mesmo chain de todas as rotas /api/admin/*)
  app[method](
    path,
    isAuthenticated,
    isAdmin,
    (req: Request, res: Response, next: NextFunction) => {
      console.log(JSON.stringify({
        event: "HEALTH_AUTH_RESULT",
        granted: true,
        reason: "admin_session",
        hasSession: true,
        sessionUserId: req.session?.userId ?? null,
        userLoaded: true,
        isAdmin: true,
        path: req.path,
        timestamp: new Date().toISOString(),
      }));
      return next();
    },
    handler,
  );
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export function registerHealthRoutes(app: Express): void {
  registerGuardedRoute(app, "get", "/api/internal/health", async (req, res) => {
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

  registerGuardedRoute(app, "get", "/api/internal/health/summary", async (req, res) => {
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
