import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";
import {
  DEFAULT_WINDOW_DAYS,
  MAX_AHEAD_DAYS,
  MAX_ITEMS,
  MAX_SEED,
} from "@/lib/forecast";
import { DAY_MS } from "@/lib/metrics";
import { parseMetricsQuery } from "@/lib/validations/metrics";

const querySchema = z.strictObject({
  /** The history window, same rules as the metrics panel; default the last 90 days. */
  from: z
    .string()
    .refine(isCalendarDate, "Use a real date as YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .refine(isCalendarDate, "Use a real date as YYYY-MM-DD")
    .optional(),
  /** "When will these be done?": how many tasks (default: the pending ones). */
  items: z.coerce
    .number()
    .int("The number of tasks must be a whole number")
    .min(1, "The number of tasks must be at least 1")
    .max(MAX_ITEMS, `The number of tasks can be at most ${MAX_ITEMS}`)
    .optional(),
  /** "How many by this date?": the day, after today. */
  date: z
    .string()
    .refine(isCalendarDate, "Use a real date as YYYY-MM-DD")
    .optional(),
  /** "1" counts only Monday to Friday. */
  workdays: z.enum(["0", "1"]).optional(),
  seed: z.coerce
    .number()
    .int("The seed must be a whole number")
    .min(0, "The seed cannot be negative")
    .max(MAX_SEED, `The seed can be at most ${MAX_SEED}`)
    .optional(),
});

export type ForecastQuery = {
  /** History window: midnight UTC of its first and last day. */
  from: number;
  to: number;
  items?: number;
  /** Midnight UTC of the target day. */
  date?: number;
  workdaysOnly: boolean;
  seed: number;
};

/**
 * The parameters of a forecast. Throws a ZodError (a 400 for the API) for anything out of range, an
 * unknown field, both a number of tasks and a date, or a date that is not after today or is more
 * than a year ahead: nothing here can make the simulation long.
 */
export function parseForecastQuery(
  params: Record<string, string | string[] | undefined>,
  now: number,
): ForecastQuery {
  const query = querySchema.parse(params);
  const window = parseMetricsQuery(
    { from: query.from, to: query.to },
    now,
    DEFAULT_WINDOW_DAYS,
  );
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const fail = (message: string, path: string): never => {
    throw new z.ZodError([
      { code: "custom", message, path: [path], input: params },
    ]);
  };
  if (query.items !== undefined && query.date !== undefined) {
    fail("Choose either a number of tasks or a date, not both", "date");
  }
  const date = query.date
    ? Date.parse(`${query.date}T00:00:00.000Z`)
    : undefined;
  if (date !== undefined) {
    if (date <= today) fail("The date must be after today", "date");
    if ((date - today) / DAY_MS > MAX_AHEAD_DAYS) {
      fail(`The date can be at most ${MAX_AHEAD_DAYS} days ahead`, "date");
    }
  }
  return {
    from: window.from,
    to: window.to,
    items: query.items,
    date,
    workdaysOnly: query.workdays === "1",
    seed: query.seed ?? 1,
  };
}

/** Like `parseForecastQuery`, for pages: a bad query gives the defaults and the message to show. */
export function parseForecastPageQuery(
  params: Record<string, string | string[] | undefined>,
  now: number,
): { query: ForecastQuery; error: string | null } {
  // A form sends the fields it leaves empty as "": they mean "not set".
  const set = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== ""),
  );
  try {
    return { query: parseForecastQuery(set, now), error: null };
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    return {
      query: parseForecastQuery({}, now),
      error: error.issues.map((issue) => issue.message).join(". "),
    };
  }
}
