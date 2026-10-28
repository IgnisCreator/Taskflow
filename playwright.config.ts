import { defineConfig } from "@playwright/test";
import {
  E2E_CLOSED_ORIGIN,
  E2E_CLOSED_PORT,
  E2E_CRON_SECRET,
  E2E_DATABASE_URL,
  E2E_ORIGIN,
  E2E_PORT,
  E2E_SECRET,
} from "./tests/e2e/env";

const shared = {
  ...(process.env as Record<string, string>),
  DATABASE_URL: E2E_DATABASE_URL,
  BETTER_AUTH_SECRET: E2E_SECRET,
  AUTH_GITHUB_ID: "e2e-placeholder",
  AUTH_GITHUB_SECRET: "e2e-placeholder",
  CRON_SECRET: E2E_CRON_SECRET,
};

// Runs against a production build (`npm run build` first). Sessions come from the test-only helpers
// in tests/e2e/fixtures.ts; there is no login route or flag in the app for them.
// Two servers share the database: an open one (public sign-up and GitHub, as in development) for
// almost every test, and a closed one, as in production, for tests/e2e/closed.spec.ts.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: 1, // tests share one database
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: E2E_ORIGIN, trace: "retain-on-failure" },
  webServer: [
    {
      command: `npm run start -- --port ${E2E_PORT}`,
      url: `${E2E_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...shared,
        APP_URL: E2E_ORIGIN,
        OPEN_ACCESS: "1",
        DEMO_ENABLED: "1",
      },
    },
    {
      command: `npm run start -- --port ${E2E_CLOSED_PORT}`,
      url: `${E2E_CLOSED_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      // No OPEN_ACCESS and no DEMO_ENABLED: the default deployment.
      env: {
        ...shared,
        APP_URL: E2E_CLOSED_ORIGIN,
        OPEN_ACCESS: "",
        DEMO_ENABLED: "",
      },
    },
  ],
});
