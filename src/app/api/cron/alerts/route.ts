import { timingSafeEqual } from "node:crypto";
import { ApiError, handle, json } from "@/server/http";
import { runAlerts } from "@/server/services/alerts";
import { purgeSandboxes } from "@/server/services/demo";
import { purgeRateLimits } from "@/server/rate-limit";
import { sendDigests } from "@/server/services/digest";

/**
 * The daily job, called by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`) or by
 * `npm run alerts:run`. Without CRON_SECRET the endpoint is off, never open.
 */
export const GET = handle(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    throw new ApiError(503, "CRON_DISABLED", "CRON_SECRET is not set");
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    throw new ApiError(401, "UNAUTHORIZED", "Bad cron secret");
  }
  // Demo sandboxes past their 24 hours go first; a failure there must not stop the rest.
  const demo = await purgeSandboxes()
    .then((purged) => ({ purged }))
    .catch((error: Error) => {
      console.error("Sandbox purge failed:", error.name);
      return { failed: true as const };
    });
  const alerts = await runAlerts();
  const digests = await sendDigests();
  const rateLimits = await purgeRateLimits();
  return json({ demo, alerts, digests, rateLimits });
});
