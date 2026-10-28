import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";
import { DAY_MS } from "@/lib/metrics";

export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;

const day = z.string().refine(isCalendarDate, "Use a real date as YYYY-MM-DD");
const id = z.string().min(1).max(100);

const querySchema = z.strictObject({
  from: day.optional(),
  to: day.optional(),
  /** A task type id, or "none". */
  type: id.optional(),
  /** A user id, or "none" for unassigned tasks. */
  assignee: id.optional(),
});

export type MetricsQuery = {
  /** Midnight UTC of the first and the last day, in milliseconds. */
  from: number;
  to: number;
  type?: string;
  assignee?: string;
};

/**
 * The range and filters of a metrics request. Without dates it is the last 30 days ending today
 * (UTC). Throws a ZodError (a 400 for the API) for a bad date, an unknown field, a range that ends
 * before it starts, one that is longer than a year, or one that ends in the future.
 */
export function parseMetricsQuery(
  params: Record<string, string | string[] | undefined>,
  now: number,
): MetricsQuery {
  const query = querySchema.parse(params);
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const ms = (value: string) => Date.parse(`${value}T00:00:00.000Z`);
  const to = query.to ? ms(query.to) : today;
  const from = query.from
    ? ms(query.from)
    : to - (DEFAULT_RANGE_DAYS - 1) * DAY_MS;
  const fail = (message: string, path: string): never => {
    throw new z.ZodError([
      { code: "custom", message, path: [path], input: params },
    ]);
  };
  if (to > today) fail("The range cannot end in the future", "to");
  if (from > to) fail("The range cannot end before it starts", "from");
  if ((to - from) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    fail(`The range can be at most ${MAX_RANGE_DAYS} days`, "from");
  }
  return { from, to, type: query.type, assignee: query.assignee };
}

/**
 * Like `parseMetricsQuery`, for pages: a bad query is not an error page. It gives the default range
 * (no filters) and the message to show above it.
 */
export function parseMetricsPageQuery(
  params: Record<string, string | string[] | undefined>,
  now: number,
): { query: MetricsQuery; error: string | null } {
  // A form sends the fields it leaves empty as "": they mean "not set".
  const set = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== ""),
  );
  try {
    return { query: parseMetricsQuery(set, now), error: null };
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    return {
      query: parseMetricsQuery({}, now),
      error: error.issues.map((issue) => issue.message).join(". "),
    };
  }
}
