// Runs the daily alerts job against a running app: `npm run alerts:run`.
// Reads CRON_SECRET and APP_URL from the environment (node --env-file=.env does it, see package.json).
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set (put it in .env).");
  process.exit(1);
}
const base = process.env.APP_URL ?? "http://localhost:3000";
const res = await fetch(`${base}/api/cron/alerts`, {
  headers: { authorization: `Bearer ${secret}` },
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
