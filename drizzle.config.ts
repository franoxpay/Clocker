import { defineConfig } from "drizzle-kit";

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

  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
