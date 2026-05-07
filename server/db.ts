import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function getDatabaseUrl(): string {
  // 1. Explicit external override — always wins
  if (process.env.EXTERNAL_DATABASE_URL) {
    console.log("[DB] Connecting via EXTERNAL_DATABASE_URL");
    return process.env.EXTERNAL_DATABASE_URL;
  }

  // 2. Explicit DATABASE_URL — use when set (e.g. EasyPanel production URL)
  //    This intentionally takes priority over PGHOST/PGDATABASE/PGUSER because
  //    on Replit, those PG* vars point to the built-in helium dev database which
  //    is empty — not the real production database.
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    // Safe log: show host only, never password
    try {
      const afterProto = url.replace(/^postgres(ql)?:\/\//, "");
      const atIdx = afterProto.lastIndexOf("@");
      const hostAndDb = afterProto.substring(atIdx + 1);
      console.log(`[DB] Connecting via DATABASE_URL → ${hostAndDb}`);
    } catch {
      console.log("[DB] Connecting via DATABASE_URL");
    }
    return url;
  }

  // 3. Replit built-in PG vars — fallback for local dev without DATABASE_URL
  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER) {
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || "5432";
    const database = process.env.PGDATABASE;
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD || "";
    console.log(`[DB] Connecting via PGHOST → ${host}:${port}/${database}`);
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }

  throw new Error(
    "No database configuration found. Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER.",
  );
}

const databaseUrl = getDatabaseUrl();

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
