/**
 * server/health/checks.ts
 *
 * Individual health-check functions for each subsystem.
 * Each check is self-contained, has its own timeout, and never throws —
 * it returns a CheckResult describing the service's current state.
 */

import { pool, db } from "../db";
import { sql } from "drizzle-orm";
import { getRedisClient } from "../redis";
import { getStripeClient, isStripeConfigured } from "../stripeClient";
import { getDnsMonitorStats } from "../domainMonitor";
import { getWebSocketStats } from "../websocketService";
import { getBackupStats } from "../scripts/backupScheduler";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ServiceStatus = "healthy" | "degraded" | "down";

export interface CheckResult {
  status: ServiceStatus;
  latencyMs?: number;
  details: Record<string, unknown>;
  error?: string;
}

// ─── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── DATABASE ──────────────────────────────────────────────────────────────────

export async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(pool.query("SELECT 1"), 3000);
    const latencyMs = Date.now() - start;
    return {
      status: latencyMs < 500 ? "healthy" : "degraded",
      latencyMs,
      details: { connected: true, latencyMs },
    };
  } catch (err: any) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      details: { connected: false },
      error: err.message,
    };
  }
}

// ─── REDIS ─────────────────────────────────────────────────────────────────────

export async function checkRedis(): Promise<CheckResult> {
  const client = getRedisClient();
  if (!client) {
    return {
      status: "degraded",
      details: { configured: false, message: "REDIS_URL not set — caching disabled" },
    };
  }
  const start = Date.now();
  try {
    const pong = await withTimeout(client.ping(), 2000);
    const latencyMs = Date.now() - start;
    return {
      status: pong === "PONG" ? "healthy" : "degraded",
      latencyMs,
      details: { configured: true, connected: true, latencyMs },
    };
  } catch (err: any) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      details: { configured: true, connected: false },
      error: err.message,
    };
  }
}

// ─── STRIPE ────────────────────────────────────────────────────────────────────

export async function checkStripe(): Promise<CheckResult> {
  const configured = await isStripeConfigured();
  if (!configured) {
    return {
      status: "down",
      details: { configured: false, message: "Stripe keys not found" },
    };
  }
  const start = Date.now();
  try {
    const stripe = await getStripeClient();
    await withTimeout(stripe.products.list({ limit: 1 }), 5000);
    const latencyMs = Date.now() - start;
    return {
      status: "healthy",
      latencyMs,
      details: { configured: true, connected: true, latencyMs },
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isAuthError =
      err?.type === "StripeAuthenticationError" || err?.code === "api_key_expired";
    return {
      status: isAuthError ? "down" : "degraded",
      latencyMs,
      details: { configured: true, connected: false, authError: isAuthError },
      error: isAuthError ? "Invalid or expired API key" : err.message,
    };
  }
}

// ─── BILLING ───────────────────────────────────────────────────────────────────

export async function checkBilling(): Promise<CheckResult> {
  try {
    const result = await withTimeout(
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE grace_period_ends_at IS NOT NULL AND suspended_at IS NULL) AS in_grace,
          COUNT(*) FILTER (WHERE suspended_at IS NOT NULL) AS suspended,
          MAX(billing_lock_until) AS last_lock_activity
        FROM users
      `),
      4000
    );
    const row = (result as any).rows?.[0] ?? {};
    return {
      status: "healthy",
      details: {
        usersInGracePeriod: parseInt(row.in_grace ?? "0", 10),
        usersSuspended: parseInt(row.suspended ?? "0", 10),
        lastBillingLockActivity: row.last_lock_activity ?? null,
        schedulerActive: true,
      },
    };
  } catch (err: any) {
    return {
      status: "degraded",
      details: { schedulerActive: true },
      error: err.message,
    };
  }
}

// ─── WEBHOOKS ──────────────────────────────────────────────────────────────────

export async function checkWebhooks(): Promise<CheckResult> {
  try {
    const result = await withTimeout(
      db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE processed_at > NOW() - INTERVAL '24 hours') AS last24h,
          COUNT(*) FILTER (WHERE error IS NOT NULL) AS failed,
          MAX(processed_at) AS last_processed
        FROM stripe_webhook_events
      `),
      4000
    );
    const row = (result as any).rows?.[0] ?? {};
    const total = parseInt(row.total ?? "0", 10);
    const last24h = parseInt(row.last24h ?? "0", 10);
    const failed = parseInt(row.failed ?? "0", 10);
    const lastProcessed: string | null = row.last_processed ?? null;

    const failureRate = total > 0 ? failed / total : 0;
    const status: ServiceStatus = failureRate > 0.1 ? "degraded" : "healthy";

    return {
      status,
      details: {
        totalEvents: total,
        processedLast24h: last24h,
        failedEvents: failed,
        failureRatePct: total > 0 ? Math.round(failureRate * 100) : 0,
        lastProcessed,
      },
    };
  } catch (err: any) {
    return {
      status: "degraded",
      details: {},
      error: err.message,
    };
  }
}

// ─── BACKUP ────────────────────────────────────────────────────────────────────

export async function checkBackup(): Promise<CheckResult> {
  try {
    const stats = getBackupStats();
    const count = stats.backups.length;
    const newest = stats.backups[0] ?? null;

    if (count === 0) {
      return {
        status: "degraded",
        details: {
          backupCount: 0,
          schedulerActive: stats.schedulerActive,
          message: "No backups found",
        },
      };
    }

    const ageMs = newest ? Date.now() - new Date(newest.createdAt).getTime() : Infinity;
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);

    return {
      status: ageDays >= 2 ? "degraded" : "healthy",
      details: {
        backupCount: count,
        newestBackup: newest?.name ?? null,
        newestBackupAgeDays: ageDays,
        newestBackupAgeHours: ageHours,
        newestBackupSize: newest?.sizeFormatted ?? null,
        schedulerActive: stats.schedulerActive,
        nextScheduledAt: stats.nextScheduledAt,
      },
    };
  } catch (err: any) {
    return {
      status: "degraded",
      details: {},
      error: err.message,
    };
  }
}

// ─── DNS MONITOR ───────────────────────────────────────────────────────────────

export async function checkDnsMonitor(): Promise<CheckResult> {
  try {
    const stats = getDnsMonitorStats();
    return {
      status: "healthy",
      details: {
        schedulerActive: stats.schedulerActive,
        isCurrentlyRunning: stats.isRunning,
        lastRunAt: stats.lastRunAt,
        domainsWithActiveFailures: stats.domainsWithActiveFailures,
        totalFailureEntries: stats.totalFailureEntries,
      },
    };
  } catch (err: any) {
    return {
      status: "degraded",
      details: {},
      error: err.message,
    };
  }
}

// ─── WEBSOCKET ─────────────────────────────────────────────────────────────────

export async function checkWebSocket(): Promise<CheckResult> {
  try {
    const stats = getWebSocketStats();
    return {
      status: stats.serverActive ? "healthy" : "down",
      details: {
        serverActive: stats.serverActive,
        totalConnections: stats.totalConnections,
        authenticatedUsers: stats.authenticatedUsers,
      },
    };
  } catch (err: any) {
    return {
      status: "degraded",
      details: {},
      error: err.message,
    };
  }
}
