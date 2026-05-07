import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { resolve } from "path";
import { readdirSync } from "fs";

// ==========================================
// POSTGRESQL BACKUP SCRIPT
// ==========================================
// Usage: npm run db:backup
// Output: backups/backup-YYYY-MM-DD-HH-mm.sql.gz

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

function formatBytes(bytes: number): string {
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
  // 1. Explicit override
  if (process.env.PG_DUMP_PATH) {
    console.log(`[BACKUP] Usando PG_DUMP_PATH: ${process.env.PG_DUMP_PATH}`);
    return process.env.PG_DUMP_PATH;
  }

  // 2. Search nix store for matching major version
  const nixStore = "/nix/store";
  if (existsSync(nixStore)) {
    try {
      const entries = readdirSync(nixStore);
      // Look for postgresql-{major}.x packages (not lib, dev, doc, debug, man, etc.)
      const pattern = new RegExp(`^[a-z0-9]+-postgresql-${serverMajor}\\.\\d+$`);
      const candidates = entries
        .filter((e) => pattern.test(e))
        .sort()
        .reverse(); // prefer higher patch versions

      for (const candidate of candidates) {
        const pgDumpPath = `${nixStore}/${candidate}/bin/pg_dump`;
        if (existsSync(pgDumpPath)) {
          console.log(`[BACKUP] pg_dump v${serverMajor} encontrado: ${pgDumpPath}`);
          return pgDumpPath;
        }
      }
    } catch {
      // ignore read errors
    }
  }

  // 3. Fall back to system default and hope for the best
  console.log("[BACKUP] Usando pg_dump do sistema (sem garantia de versão compatível).");
  return "pg_dump";
}

/**
 * Get the server's major version by running psql --version against the server.
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

async function runBackup(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  PostgreSQL Backup — Cleryon");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[BACKUP] Iniciado em ${new Date().toISOString()}`);

  // ── 1. Validate env vars ──────────────────
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("[BACKUP] ERRO: DATABASE_URL não definida.");
    console.error("         Defina a variável antes de rodar o backup.");
    process.exit(1);
  }

  let conn: ReturnType<typeof parseDbUrl>;
  try {
    conn = parseDbUrl(DATABASE_URL);
  } catch (err) {
    console.error("[BACKUP] ERRO ao analisar DATABASE_URL:", err);
    process.exit(1);
  }

  if (!conn.host || !conn.database || !conn.user) {
    console.error("[BACKUP] ERRO: DATABASE_URL incompleta (host/database/user ausente).");
    process.exit(1);
  }

  console.log(`[BACKUP] Host:     ${conn.host}:${conn.port}`);
  console.log(`[BACKUP] Database: ${conn.database}`);
  console.log(`[BACKUP] User:     ${conn.user}`);

  // Password goes into env — NEVER into command line args
  const pgEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PGPASSWORD: conn.password,
  };

  // ── 2. Detect server version & find pg_dump ──
  console.log("[BACKUP] Detectando versão do servidor...");
  const serverMajor = getServerMajorVersion(conn, pgEnv);
  if (serverMajor) {
    console.log(`[BACKUP] Versão do servidor: PostgreSQL ${serverMajor}`);
  } else {
    console.log("[BACKUP] Não foi possível detectar a versão do servidor — usando pg_dump padrão.");
  }

  const pgDumpBin = serverMajor ? findPgDump(serverMajor) : "pg_dump";

  // Verify the pg_dump binary version
  const versionCheck = spawnSync(pgDumpBin, ["--version"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  const pgDumpVersion = (versionCheck.stdout || "").trim();
  console.log(`[BACKUP] pg_dump: ${pgDumpVersion}`);

  // ── 3. Prepare backup directory ──────────
  const backupDir = resolve(process.cwd(), "backups");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
    console.log(`[BACKUP] Pasta criada: ${backupDir}`);
  }

  // ── 4. Build unique filename ──────────────
  const timestamp = formatTimestamp();
  const sqlFile = resolve(backupDir, `backup-${timestamp}.sql`);
  const gzFile = `${sqlFile}.gz`;

  if (existsSync(gzFile)) {
    console.error(`[BACKUP] ERRO: Arquivo já existe: ${gzFile}`);
    console.error("         Aguarde 1 minuto ou remova o arquivo manualmente.");
    process.exit(1);
  }

  console.log(`[BACKUP] Destino: ${gzFile}`);

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

  console.log("[BACKUP] Executando pg_dump...");

  const dumpResult = spawnSync(pgDumpBin, pgDumpArgs, {
    env: pgEnv,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });

  if (dumpResult.status !== 0) {
    const errOutput = (dumpResult.stderr || "").trim();
    const safeErr = sanitizeOutput(errOutput, conn.password);
    console.error("[BACKUP] FALHA no pg_dump:");
    console.error(safeErr || "(sem saída de erro)");
    if (existsSync(sqlFile)) {
      try { execSync(`rm -f "${sqlFile}"`); } catch {}
    }
    process.exit(1);
  }

  if (!existsSync(sqlFile)) {
    console.error("[BACKUP] ERRO: pg_dump concluiu mas o arquivo SQL não foi criado.");
    process.exit(1);
  }

  const sqlStats = statSync(sqlFile);
  console.log(`[BACKUP] SQL gerado: ${formatBytes(sqlStats.size)}`);

  // ── 6. Compress with gzip ─────────────────
  console.log("[BACKUP] Compactando com gzip...");

  const gzResult = spawnSync("gzip", ["-9", sqlFile], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });

  if (gzResult.status !== 0) {
    console.error("[BACKUP] ERRO na compactação com gzip:");
    console.error((gzResult.stderr || "").trim());
    process.exit(1);
  }

  // gzip replaces sqlFile with sqlFile.gz automatically
  if (!existsSync(gzFile)) {
    console.error("[BACKUP] ERRO: gzip concluiu mas o arquivo .gz não foi encontrado.");
    process.exit(1);
  }

  // ── 7. Report success ─────────────────────
  const stats = statSync(gzFile);
  const sizeFmt = formatBytes(stats.size);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[BACKUP] ✓ Backup concluído com sucesso!`);
  console.log(`[BACKUP] Arquivo: ${gzFile}`);
  console.log(`[BACKUP] Tamanho: ${sizeFmt}`);
  console.log(`[BACKUP] Horário: ${new Date().toISOString()}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

runBackup().catch((err) => {
  console.error("[BACKUP] ERRO inesperado:", err);
  process.exit(1);
});
