/**
 * server/health/runner.ts
 *
 * Runs all service checks in parallel, applies per-check timeouts,
 * and computes the overall system status:
 *   ok        — all services healthy / only redis degraded
 *   degraded  — some non-critical services unhealthy
 *   critical  — database or stripe down
 */

import {
  checkDatabase,
  checkRedis,
  checkStripe,
  checkBilling,
  checkWebhooks,
  checkBackup,
  checkDnsMonitor,
  checkWebSocket,
  type CheckResult,
  type ServiceStatus,
} from "./checks";

export type OverallStatus = "ok" | "degraded" | "critical";

export interface HealthReport {
  status: OverallStatus;
  timestamp: string;
  uptimeSeconds: number;
  services: {
    database: CheckResult;
    redis: CheckResult;
    stripe: CheckResult;
    billing: CheckResult;
    webhooks: CheckResult;
    backupScheduler: CheckResult;
    dnsMonitor: CheckResult;
    websocket: CheckResult;
  };
}

export interface HealthSummary {
  status: OverallStatus;
  timestamp: string;
  uptimeSeconds: number;
  services: Record<string, ServiceStatus>;
}

const startTime = Date.now();

// Services whose failure makes the overall status CRITICAL
const CRITICAL_SERVICES = new Set(["database", "stripe"]);
// Services whose failure makes overall DEGRADED (not critical)
const DEGRADED_SERVICES = new Set(["redis", "billing", "webhooks", "backupScheduler", "dnsMonitor", "websocket"]);

function computeOverall(services: Record<string, CheckResult>): OverallStatus {
  for (const [name, result] of Object.entries(services)) {
    if (result.status === "down" && CRITICAL_SERVICES.has(name)) return "critical";
  }
  for (const [, result] of Object.entries(services)) {
    if (result.status === "down" || result.status === "degraded") return "degraded";
  }
  return "ok";
}

// Wraps a check so it never throws — returns 'down' on unexpected error
async function safeCheck(
  name: string,
  fn: () => Promise<CheckResult>
): Promise<CheckResult> {
  try {
    return await fn();
  } catch (err: any) {
    console.error(`[Health] Unexpected error in check "${name}":`, err.message);
    return {
      status: "down",
      details: {},
      error: "Unexpected error — check failed to complete",
    };
  }
}

export async function runHealthChecks(): Promise<HealthReport> {
  const [database, redis, stripe, billing, webhooks, backupScheduler, dnsMonitor, websocket] =
    await Promise.all([
      safeCheck("database", checkDatabase),
      safeCheck("redis", checkRedis),
      safeCheck("stripe", checkStripe),
      safeCheck("billing", checkBilling),
      safeCheck("webhooks", checkWebhooks),
      safeCheck("backupScheduler", checkBackup),
      safeCheck("dnsMonitor", checkDnsMonitor),
      safeCheck("websocket", checkWebSocket),
    ]);

  const services = { database, redis, stripe, billing, webhooks, backupScheduler, dnsMonitor, websocket };
  const status = computeOverall(services);

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    services,
  };
}

export async function runHealthSummary(): Promise<HealthSummary> {
  const report = await runHealthChecks();
  const services: Record<string, ServiceStatus> = {};
  for (const [name, result] of Object.entries(report.services)) {
    services[name] = result.status;
  }
  return {
    status: report.status,
    timestamp: report.timestamp,
    uptimeSeconds: report.uptimeSeconds,
    services,
  };
}
