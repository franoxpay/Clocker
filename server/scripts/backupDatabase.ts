import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { resolve } from "path";
import { readdirSync } from "fs";

// ==========================================
// POSTGRESQL BACKUP SCRIPT
// ==========================================
// Usage:  npm run db:backup  (CLI — exits with 0 or 1)
// Import: import { runBackup } from "./backupDatabase"  (scheduler)

export const BACKUP_DIR = resolve(process.cwd(), "backups");

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDbUrl(url: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} {
  try {
    const cleaned = url.replace(/^postgres(ql)?:\/\//, "");
    const atIdx = cleaned.lastIndexOf("@");
    const credentials = cleaned.substring(0, atIdx);
    const hostAndDb = cleaned.substring(atIdx + 1);

    const colonInCreds = credentials.indexOf(":");
    const user = decodeURIComponent(credentials.substring(0, colonInCreds));
    const password = decodeURIComponent(credentials.substring(colonInCreds + 1));

    const slashIdx = hostAndDb.indexOf("/");
    const hostPort = hostAndDb.substring(0, slashIdx);
    const dbWithParams = hostAndDb.substring(slashIdx + 1);
    const database = dbWithParams.split("?")[0];

    const colonInHost = hostPort.lastIndexOf(":");
    const host = colonInHost !== -1 ? hostPort.substring(0, colonInHost) : hostPort;
    const port = colonInHost !== -1 ? hostPort.substring(colonInHost + 1) : "5432";

    return { host, port, user, password, database };
  } catch (err) {
    throw new Error(`Failed to parse DATABASE_URL: ${err}`);
  }
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("-");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function sanitizeOutput(text: string, password: string): string {
  if (!password) return text;
  const escaped = password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "g"), "***");
}

/**
 * Find the correct pg_dump binary for a given major server version.
 * Priority: PG_DUMP_PATH env var > nix store match > system default.
 */
function findPgDump(serverMajor: number): string {
  if (process.env.PG_DUMP_PATH) {
    console.log(`[Backup] Using PG_DUMP_PATH: ${process.env.PG_DUMP_PATH}`);
    return process.env.PG_DUMP_PATH;
  }

  const nixStore = "/nix/store";
  if (existsSync(nixStore)) {
    try {
      const entries = readdirSync(nixStore);
      const pattern = new RegExp(`^[a-z0-9]+-postgresql-${serverMajor}\\.\\d+$`);
      const candidates = entries
        .filter((e) => pattern.test(e))
        .sort()
        .reverse();

      for (const candidate of candidates) {
        const pgDumpPath = `${nixStore}/${candidate}/bin/pg_dump`;
        if (existsSync(pgDumpPath)) {
          return pgDumpPath;
        }
      }
    } catch {
      // ignore read errors
    }
  }

  return "pg_dump";
}

/**
 * Query the server's major version via psql.
 * Returns null if it cannot be determined.
 */
function getServerMajorVersion(
  conn: ReturnType<typeof parseDbUrl>,
  pgEnv: NodeJS.ProcessEnv
): number | null {
  const result = spawnSync(
    "psql",
    [
      "--host", conn.host,
      "--port", conn.port,
      "--username", conn.user,
      "--dbname", conn.database,
      "--no-password",
      "--tuples-only",
      "--command", "SELECT current_setting('server_version');",
    ],
    { env: pgEnv, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }
  );

  if (result.status !== 0) return null;
  const versionStr = (result.stdout || "").trim();
  const match = versionStr.match(/^(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

// ── Database URL resolution (for backup — intentionally skips PGHOST) ────────

/**
 * Resolves the database URL to back up.
 *
 * Priority (intentional — does NOT fall through to PGHOST/PGDATABASE/PGUSER):
 *   1. BACKUP_DATABASE_URL  — explicit override for backup only
 *   2. EXTERNAL_DATABASE_URL — external/production DB explicitly configured
 *   3. DATABASE_URL          — standard production URL
 *
 * Why PGHOST is skipped: on Replit, PGHOST points to the built-in development
 * database (helium/heliumdb), which is typically empty. Backing it up instead
 * of the real EasyPanel production database would be a silent, critical error.
 */
function resolveBackupUrl(): { url: string; source: string } {
  if (process.env.BACKUP_DATABASE_URL) {
    return { url: process.env.BACKUP_DATABASE_URL, source: "BACKUP_DATABASE_URL" };
  }
  if (process.env.EXTERNAL_DATABASE_URL) {
    return { url: process.env.EXTERNAL_DATABASE_URL, source: "EXTERNAL_DATABASE_URL" };
  }
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, source: "DATABASE_URL" };
  }
  throw new Error(
    "No backup database URL found.\n" +
    "Set BACKUP_DATABASE_URL, EXTERNAL_DATABASE_URL, or DATABASE_URL."
  );
}

/** Returns true if the host looks like a Replit-internal database (not production). */
function isReplitInternalHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "helium" ||
    h.endsWith(".helium") ||
    h === "localhost" ||
    h.startsWith("127.") ||
    h.startsWith("::1") ||
    h.endsWith(".replit.dev") ||
    h.endsWith(".replit.com") ||
    h.endsWith(".repl.co")
  );
}

/** Masks a username: first 3 chars visible, rest replaced with ***. */
function maskUser(user: string): string {
  if (user.length <= 3) return "***";
  return user.substring(0, 3) + "***";
}

/** Logs the backup target database info safely (no passwords). */
function logTargetDatabase(
  conn: ReturnType<typeof parseDbUrl>,
  source: string
): void {
  const isReplit = isReplitInternalHost(conn.host);

  console.log("[Backup] ┌─ Target database ─────────────────────");
  console.log(`[Backup] │  Host:     ${conn.host}:${conn.port}`);
  console.log(`[Backup] │  Database: ${conn.database}`);
  console.log(`[Backup] │  User:     ${maskUser(conn.user)}`);
  console.log(`[Backup] │  Source:   ${source}`);

  if (isReplit) {
    console.log("[Backup] │  Type:     ⚠ REPLIT INTERNAL DATABASE");
    console.warn("[Backup] └─────────────────────────────────────────");
    console.warn("[Backup] ⚠ WARNING: The resolved host looks like the Replit");
    console.warn("[Backup]   built-in development database, NOT EasyPanel production.");
    console.warn("[Backup]   Set BACKUP_DATABASE_URL or DATABASE_URL to the");
    console.warn("[Backup]   EasyPanel production database URL to fix this.");
  } else {
    console.log("[Backup] │  Type:     External (EasyPanel / production)");
    console.log("[Backup] └─────────────────────────────────────────");
  }
}

// ── Core backup function (exported — throws on failure) ────────────────────

/**
 * Runs the full PostgreSQL backup pipeline.
 * - Throws an Error on any failure (safe for scheduler / caller to catch).
 * - Returns the path of the created .gz file on success.
 */
export async function runBackup(): Promise<string> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  PostgreSQL Backup — Cleryon");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[Backup] Started at ${new Date().toISOString()}`);

  // ── 1. Resolve and validate the target database URL ──
  const { url: resolvedUrl, source } = resolveBackupUrl();
  const conn = parseDbUrl(resolvedUrl);

  if (!conn.host || !conn.database || !conn.user) {
    throw new Error(`${source} is incomplete (missing host / database / user).`);
  }

  logTargetDatabase(conn, source);

  // Password via env var only — NEVER in command-line args
  const pgEnv: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: conn.password };

  // ── 2. Detect server version & find matching pg_dump ──
  console.log("[Backup] Detecting server version...");
  const serverMajor = getServerMajorVersion(conn, pgEnv);
  if (serverMajor) {
    console.log(`[Backup] Server version: PostgreSQL ${serverMajor}`);
  } else {
    console.log("[Backup] Could not detect server version — using default pg_dump.");
  }

  const pgDumpBin = serverMajor ? findPgDump(serverMajor) : "pg_dump";
  const versionCheck = spawnSync(pgDumpBin, ["--version"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  console.log(`[Backup] pg_dump binary: ${(versionCheck.stdout || "").trim()}`);

  // ── 3. Ensure backup directory exists ────
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[Backup] Created directory: ${BACKUP_DIR}`);
  }

  // ── 4. Build unique timestamped filename ──
  const timestamp = formatTimestamp();
  const sqlFile = resolve(BACKUP_DIR, `backup-${timestamp}.sql`);
  const gzFile = `${sqlFile}.gz`;

  if (existsSync(gzFile)) {
    throw new Error(
      `File already exists: ${gzFile}\nWait 1 minute or remove it manually.`
    );
  }

  console.log(`[Backup] Target file: ${gzFile}`);

  // ── 5. Run pg_dump ────────────────────────
  const pgDumpArgs = [
    "--host", conn.host,
    "--port", conn.port,
    "--username", conn.user,
    "--dbname", conn.database,
    "--no-password",
    "--format", "plain",
    "--encoding", "UTF8",
    "--file", sqlFile,
  ];

  console.log("[Backup] Running pg_dump...");

  const dumpResult = spawnSync(pgDumpBin, pgDumpArgs, {
    env: pgEnv,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });

  if (dumpResult.status !== 0) {
    const errOutput = (dumpResult.stderr || "").trim();
    const safeErr = sanitizeOutput(errOutput, conn.password);
    if (existsSync(sqlFile)) {
      try { execSync(`rm -f "${sqlFile}"`); } catch {}
    }
    throw new Error(`pg_dump failed:\n${safeErr || "(no error output)"}`);
  }

  if (!existsSync(sqlFile)) {
    throw new Error("pg_dump exited successfully but the SQL file was not created.");
  }

  const sqlStats = statSync(sqlFile);
  console.log(`[Backup] SQL dump size: ${formatBytes(sqlStats.size)}`);

  // ── 6. Compress with gzip ─────────────────
  console.log("[Backup] Compressing with gzip...");

  const gzResult = spawnSync("gzip", ["-9", sqlFile], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });

  if (gzResult.status !== 0) {
    throw new Error(`gzip failed:\n${(gzResult.stderr || "").trim()}`);
  }

  if (!existsSync(gzFile)) {
    throw new Error("gzip exited successfully but the .gz file was not found.");
  }

  // ── 7. Report success ─────────────────────
  const stats = statSync(gzFile);
  const sizeFmt = formatBytes(stats.size);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[Backup] Backup created: ${gzFile}`);
  console.log(`[Backup] Compressed size: ${sizeFmt}`);
  console.log(`[Backup] Completed at: ${new Date().toISOString()}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return gzFile;
}

// ── CLI entry point ────────────────────────────────────────────────────────
// Only executes when the file is run directly (not when imported as a module).

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("backupDatabase.ts") ||
  process.argv[1].endsWith("backupDatabase.js")
);

if (isDirectRun) {
  runBackup().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error("[Backup] FATAL ERROR:", err.message || err);
    process.exit(1);
  });
}
