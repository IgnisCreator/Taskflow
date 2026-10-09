import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { testUtils } from "better-auth/plugins";
import { db } from "@/server/db";

// Test-only auth instance: same secret and database as the app, plus session helpers.
// This module must never be imported from src/ (CI greps for it).
export const testAuth = betterAuth({
  baseURL: process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  plugins: [testUtils()],
});
