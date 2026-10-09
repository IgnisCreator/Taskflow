import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env; Node does. CI has no .env, hence the catch.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Empty fallback lets `prisma generate`/`validate` run without a database (CI, postinstall).
  // Commands that connect (migrate) fail clearly when DATABASE_URL is missing.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
