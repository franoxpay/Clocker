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

  // ── 1. Validate env vars ──────────────────
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined. Set it before running backup.");
  }

  const conn = parseDbUrl(DATABASE_URL);

  if (!conn.host || !conn.database || !conn.user) {
    throw new Error("DATABASE_URL is incomplete (missing host / database / user).");
  }

  console.log(`[Backup] Host:     ${conn.host}:${conn.port}`);
  console.log(`[Backup] Database: ${conn.database}`);
  console.log(`[Backup] User:     ${conn.user}`);

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
