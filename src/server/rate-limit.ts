import "server-only";
import { db } from "@/server/db";

export type Limit = { limit: number; windowSeconds: number };
/** Writes to the API, per client address. */
export const WRITE_LIMIT: Limit = { limit: 120, windowSeconds: 60 };
/** Entries to the public demo, per client address. */
export const DEMO_LIMIT: Limit = { limit: 20, windowSeconds: 3600 };
/** Forecasts, the one read that costs real CPU (up to 10,000 runs a request), per user and address. */
export const FORECAST_LIMIT: Limit = { limit: 30, windowSeconds: 60 };

/**
 * Counts one more hit on `key` in the current fixed window and says whether it is still within the
 * limit. One atomic statement in PostgreSQL, so concurrent requests (and serverless instances) share
 * the same count. `retryAfter` is the seconds until the window ends.
 */
export async function rateLimit(
  key: string,
  { limit, windowSeconds }: Limit,
  now = Date.now(),
): Promise<{ ok: boolean; retryAfter: number }> {
  const windowMs = windowSeconds * 1000;
  const window = Math.floor(now / windowMs);
  const endsAt = (window + 1) * windowMs;
  // Kept a little past its end, then purged by the daily job.
  const expiresAt = new Date(endsAt + 60_000);
  const [row] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "ApiRateLimit" ("key", "window", "count", "expiresAt")
    VALUES (${key}, ${window}, 1, ${expiresAt})
    ON CONFLICT ("key", "window")
    DO UPDATE SET "count" = "ApiRateLimit"."count" + 1
    RETURNING "count"`;
  return {
    ok: row!.count <= limit,
    retryAfter: Math.max(1, Math.ceil((endsAt - now) / 1000)),
  };
}

/** The address of the caller as the platform reports it, or null when there is none to count by. */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headers.get("x-real-ip")?.trim();
  // An oversized value is cut, not dropped: "no address" means "not counted".
  return address ? address.slice(0, 64) : null;
}

/** Deletes the counters that are no longer needed (ours and Better Auth's, older than a day). */
export async function purgeRateLimits(now = Date.now()) {
  const [ours, auth] = await Promise.all([
    db.apiRateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
    db.rateLimit.deleteMany({
      where: { lastRequest: { lt: BigInt(now - 86_400_000) } },
    }),
  ]);
  return { api: ours.count, auth: auth.count };
}
