import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Empty fallback lets `prisma generate`/`validate` run without a database (CI, postinstall).
  // Commands that connect (migrate) fail clearly when DATABASE_URL is missing.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
