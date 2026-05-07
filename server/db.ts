import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function getDatabaseUrl(): string {
  if (process.env.EXTERNAL_DATABASE_URL) {
    return process.env.EXTERNAL_DATABASE_URL;
  }

  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER) {
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || "5432";
    const database = process.env.PGDATABASE;
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD || "";
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  throw new Error(
    "No database configuration found. Set PGHOST/PGDATABASE/PGUSER or DATABASE_URL.",
  );
}

const databaseUrl = getDatabaseUrl();

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
