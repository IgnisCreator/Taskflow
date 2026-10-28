import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getEnv } from "@/lib/env";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email";

const env = getEnv();
const open = env.OPEN_ACCESS === "1";

/** Auth endpoints that change an account: refused to the demo visitor. */
const ACCOUNT_CHANGES = new Set([
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/set-password",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/link-social",
  "/unlink-account",
]);

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  // Email + password, but only after the address is confirmed with a link sent to it.
  emailAndPassword: {
    enabled: true,
    // Closed deployments (production, the demo) have no public sign-up: accounts come from `npm run user:create`.
    disableSignUp: !open,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true, // an unverified user who tries to sign in gets a fresh link
    autoSignInAfterVerification: true,
    // ponytail: awaited, so a slow provider shows in response time; use waitUntil if that matters.
    sendVerificationEmail: ({ user, url }) =>
      sendEmail({
        to: user.email,
        subject: "Confirm your email for TaskFlow",
        text: `Hi ${user.name},

Confirm your email to finish signing in to TaskFlow:
${url}

The link works for one hour. If you did not create an account, ignore this message.`,
      }),
  },
  user: {
    additionalFields: {
      // Asked at sign-up and editable in the profile; the in-app inbox does not depend on it.
      digestEmail: { type: "boolean", required: false, defaultValue: false },
      // Set by the server for the demo accounts, never by a sign-up form.
      isDemo: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  hooks: {
    // The demo visitor is a shared account: it cannot change the password, the email or anything else.
    before: createAuthMiddleware(async (ctx) => {
      if (!ACCOUNT_CHANGES.has(ctx.path)) return;
      const session = await getSessionFromCtx(ctx);
      if ((session?.user as { isDemo?: boolean } | undefined)?.isDemo) {
        throw new APIError("FORBIDDEN", { message: "The demo is read-only" });
      }
    }),
  },
  // GitHub login is for development only: nobody should risk their GitHub access on a demo.
  socialProviders:
    open && env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET
      ? {
          github: {
            clientId: env.AUTH_GITHUB_ID,
            clientSecret: env.AUTH_GITHUB_SECRET,
          },
        }
      : {},
  // Counted in PostgreSQL, so every serverless instance sees the same counters. Only requests that
  // carry a client address are counted (there is none in tests or in a plain local run).
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  // Provider tokens are never used after login; if stored they are encrypted.
  account: { encryptOAuthTokens: true },
  plugins: [nextCookies()],
});
