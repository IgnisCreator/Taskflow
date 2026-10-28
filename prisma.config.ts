import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env; Node does. CI has no .env, hence the catch.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Empty fallback lets `prisma generate`/`validate` run without a database (CI, postinstall).
  // Commands that connect (migrate) fail clearly when DATABASE_URL is missing.
  // Migrations want a direct connection (Neon's pooled URL does not hold the migration lock);
  // the app itself keeps using DATABASE_URL.
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
