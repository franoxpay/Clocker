/**
 * server/health/routes.ts
 *
 * Regra única de auth: isAdmin — idêntico a todas as rotas /api/admin/*.
 *
 * Se o usuário acessa /confg-admin, ele acessa /api/internal/health.
 * Sem segunda autenticação. Sem lógica especial. Sem fallback.
 *
 * Fonte única de verdade: isAdmin (replitAuth.ts) → requireAdmin (permissions.ts)
 *   → lê req.session.userId → verifica users.isAdmin no banco.
 */

import type { Express, Request, Response } from "express";
import { runHealthChecks, runHealthSummary } from "./runner";
import { isAdmin } from "../replitAuth";

export function registerHealthRoutes(app: Express): void {
  app.get("/api/internal/health", isAdmin, async (req: Request, res: Response) => {
    try {
      const report = await runHealthChecks();
      const httpStatus = report.status === "critical" ? 503 : 200;
      res.status(httpStatus).json(report);
    } catch (err: any) {
      console.error("[Health] Failed to run health checks:", err.message);
      res.status(500).json({ error: "Health check failed to complete" });
    }
  });

  app.get("/api/internal/health/summary", isAdmin, async (req: Request, res: Response) => {
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
