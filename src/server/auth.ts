import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getEnv } from "@/lib/env";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email";

const env = getEnv();

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  // Email + password, but only after the address is confirmed with a link sent to it.
  emailAndPassword: {
    enabled: true,
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
  socialProviders: {
    github: {
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
    },
  },
  // Provider tokens are never used after login; if stored they are encrypted.
  account: { encryptOAuthTokens: true },
  plugins: [nextCookies()],
});
