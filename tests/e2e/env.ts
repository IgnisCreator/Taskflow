// Shared by the Playwright config (which starts the server) and the fixtures (which create
// sessions and data), so both sides use the same secret, origin and database.
export const E2E_PORT = 3100;
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;
// Fixed test value: signs the session cookies the fixtures create. Not a real secret.
export const E2E_SECRET = "e2e-secret-0123456789abcdef0123456789abcdef";
// Lets the tests call the daily alerts job. Not a real secret.
export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789";
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://taskflow:taskflow@localhost:5432/taskflow_e2e";
