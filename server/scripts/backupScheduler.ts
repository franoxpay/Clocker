import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { runBackup, BACKUP_DIR, formatBytes } from "./backupDatabase";

// ==========================================
// BACKUP SCHEDULER — Cleryon
// ==========================================
// Runs an automatic PostgreSQL backup once a day at a configurable UTC time.
// After each successful backup, enforces a retention policy (default: keep 5 most recent).
// Never crashes the server on failure.

// ── Configuration (env overrides with sane defaults) ──────────────────────

const RETENTION_COUNT = Math.max(
  1,
  parseInt(process.env.BACKUP_RETENTION_COUNT || "5", 10)
);

// "HH:MM" in UTC — default 03:00
const BACKUP_TIME_UTC = (process.env.BACKUP_TIME_UTC || "03:00").trim();

// ── State ─────────────────────────────────────────────────────────────────

let isBackupRunning = false;
let nextScheduledAt: string | null = null;
let schedulerStarted = false;

// ── Stats export ──────────────────────────────────────────────────────────

export interface BackupFileInfo {
  name: string;
  createdAt: string;
  sizeFormatted: string;
}

export interface BackupStats {
  schedulerActive: boolean;
  backups: BackupFileInfo[];
  nextScheduledAt: string | null;
}

export function getBackupStats(): BackupStats {
  const files = listBackups(BACKUP_DIR);
  return {
    schedulerActive: schedulerStarted,
    nextScheduledAt,
    backups: files.map((f) => {
      // Parse timestamp from filename: backup-YYYY-MM-DD-HH-mm.sql.gz
      const match = f.name.match(/backup-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2})/);
      const createdAt = match
        ? match[1].replace(/(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})/, "$1T$2:$3:00Z")
        : new Date(0).toISOString();
      return { name: f.name, createdAt, sizeFormatted: formatBytes(f.size) };
    }),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseBackupTime(): { hour: number; minute: number } {
  const [h, m] = BACKUP_TIME_UTC.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    console.warn(
      `[Backup] Invalid BACKUP_TIME_UTC "${BACKUP_TIME_UTC}" — falling back to 03:00`
    );
    return { hour: 3, minute: 0 };
  }
  return { hour: h, minute: m };
}

/**
 * Returns milliseconds until the next occurrence of HH:MM UTC.
 */
function msUntilNextRun(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0
    )
  );

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.getTime() - now.getTime();
}

/**
 * Lists backup files sorted newest-first by filename (which embeds the timestamp).
 * Using filename instead of mtime makes the order deterministic and immune
 * to filesystem touch / copy operations that change mtime without changing content.
 */
function listBackups(dir: string): Array<{ name: string; path: string; size: number }> {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".sql.gz"))
    .map((f) => {
      const fullPath = join(dir, f);
      const st = statSync(fullPath);
      return { name: f, path: fullPath, size: st.size };
    })
    .sort((a, b) => b.name.localeCompare(a.name)); // newest first (lexicographic = chronological)
}

/**
 * Deletes all backup files beyond the retention limit.
 * The most recent `keepCount` files are always kept.
 */
function enforceRetention(keepCount: number): void {
  const backups = listBackups(BACKUP_DIR);

  if (backups.length <= keepCount) {
    console.log(`[Backup] Retained backups: ${backups.length} (limit: ${keepCount})`);
    return;
  }

  const toDelete = backups.slice(keepCount);

  for (const f of toDelete) {
    try {
      unlinkSync(f.path);
      console.log(`[Backup] Removed old backup: ${f.name}`);
    } catch (err: any) {
      console.error(`[Backup] Failed to remove ${f.name}: ${err.message}`);
    }
  }

  const remaining = listBackups(BACKUP_DIR);
  console.log(`[Backup] Retained backups: ${remaining.length}`);

  if (remaining.length > 0) {
    const newest = remaining[0];
    const oldest = remaining[remaining.length - 1];
    console.log(`[Backup] Newest: ${newest.name} (${formatBytes(newest.size)})`);
    if (remaining.length > 1) {
      console.log(`[Backup] Oldest kept: ${oldest.name}`);
    }
  }
}

// ── Scheduled job ─────────────────────────────────────────────────────────

async function runScheduledBackup(): Promise<void> {
  // Mutex: skip if a backup is already in progress
  if (isBackupRunning) {
    console.warn("[Backup] Skipping scheduled run — a backup is already in progress.");
    return;
  }

  isBackupRunning = true;
  console.log("[Backup] Starting scheduled backup...");

  try {
    // Ensure backup dir exists
    if (!existsSync(BACKUP_DIR)) {
      mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const filePath = await runBackup();
    console.log(`[Backup] Backup created: ${filePath}`);

    // Enforce retention after successful backup
    enforceRetention(RETENTION_COUNT);
  } catch (err: any) {
    // Log the full error but DO NOT crash the server
    console.error("[Backup] Scheduled backup FAILED:");
    console.error(err.message || err);
    console.error("[Backup] Server continues running normally.");
  } finally {
    isBackupRunning = false;
  }
}

// ── Scheduler loop (setTimeout-based, no external deps) ───────────────────

function scheduleNextRun(): void {
  const { hour, minute } = parseBackupTime();
  const delayMs = msUntilNextRun(hour, minute);
  const nextRun = new Date(Date.now() + delayMs);
  nextScheduledAt = nextRun.toISOString();

  console.log(
    `[Backup] Next scheduled backup: ${nextRun.toISOString()} ` +
    `(in ${Math.round(delayMs / 1000 / 60)} minutes)`
  );

  setTimeout(async () => {
    await runScheduledBackup();
    scheduleNextRun(); // reschedule for the next day
  }, delayMs);
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Starts the automatic backup scheduler.
 * Call once during server startup — safe to call multiple times (idempotent via flag).
 */
export function startBackupScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const { hour, minute } = parseBackupTime();
  const retentionCount = RETENTION_COUNT;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Backup Scheduler — Cleryon");
  console.log(`  Schedule: daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC`);
  console.log(`  Retention: ${retentionCount} most recent backups`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Show existing backups on startup
  const existing = listBackups(BACKUP_DIR);
  if (existing.length > 0) {
    console.log(`[Backup] Existing backups found: ${existing.length}`);
    existing.slice(0, 3).forEach((b) =>
      console.log(`[Backup]   ${b.name} (${formatBytes(b.size)})`)
    );
    if (existing.length > 3) {
      console.log(`[Backup]   ... and ${existing.length - 3} more`);
    }
  } else {
    console.log("[Backup] No existing backups found.");
  }

  scheduleNextRun();
}
