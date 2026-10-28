import { timingSafeEqual } from "node:crypto";
import { ApiError, handle, json } from "@/server/http";
import { runAlerts } from "@/server/services/alerts";
import { demoEnabled, regenerateDemo } from "@/server/services/demo";
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
  // The demo first, so its alerts are computed on fresh data; a failure there must not stop the rest.
  const demo = demoEnabled()
    ? await regenerateDemo().catch((error: Error) => {
        console.error("Demo regeneration failed:", error.name);
        return { failed: true as const };
      })
    : null;
  const alerts = await runAlerts();
  const digests = await sendDigests();
  return json({ demo, alerts, digests });
});
