import "server-only";
import {
  MIN_DAYS_WITH_DATA,
  MIN_FINISHED,
  PERCENTILES,
  RUNS,
  atLeast,
  dateOfDay,
  daysUntil,
  daysWithin,
  histogram,
  howMany,
  samplesOf,
  whenDone,
} from "@/lib/forecast";
import { DAY_MS, dayKey } from "@/lib/metrics";
import type { ForecastQuery } from "@/lib/validations/forecast";
import { db } from "@/server/db";
import { getListMetrics } from "@/server/services/metrics";

type Confidence = { percent: number; days: number | null; date: string | null };

/**
 * A Monte Carlo forecast for one list from its own history. Anyone who can see the list can ask (a
 * hidden one is a 404). `now` is a parameter so that tests control the clock.
 */
export async function getListForecast(
  userId: string,
  listId: string,
  query: ForecastQuery,
  now = Date.now(),
) {
  const metrics = await getListMetrics(
    userId,
    listId,
    { from: query.from, to: query.to },
    now,
  );
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const { workdaysOnly, seed } = query;

  const daily = metrics.throughput.daily;
  const samples = samplesOf(daily, workdaysOnly);
  const history = {
    from: metrics.range.from,
    to: metrics.range.to,
    days: daily.length,
    daysWithData: daily.filter((d) => d.count > 0).length,
    finished: metrics.throughput.total,
  };
  const warnings: string[] = [];
  if (history.daysWithData < MIN_DAYS_WITH_DATA) {
    warnings.push(
      `Only ${history.daysWithData} days in this window had finished tasks (fewer than ${MIN_DAYS_WITH_DATA}): treat the forecast as a rough guide.`,
    );
  }
  if (history.finished < MIN_FINISHED) {
    warnings.push(
      `Only ${history.finished} tasks were finished in this window (fewer than ${MIN_FINISHED}): there is little pace to learn from.`,
    );
  }
  // Without any finished task in the samples there is nothing to replay.
  const possible = samples.some((count) => count > 0);
  const common = {
    window: history,
    workdaysOnly,
    seed,
    runs: RUNS,
    warnings,
    possible,
  };

  if (query.date !== undefined) {
    const days = daysUntil(today, query.date, workdaysOnly);
    const values = possible ? howMany(samples, days, { seed }) : [];
    return {
      ...common,
      question: "HOW_MANY" as const,
      date: dayKey(query.date),
      days,
      /** "At least this many were finished in that share of the simulated futures." */
      confidence: PERCENTILES.map((percent) => ({
        percent,
        count: possible ? atLeast(values, percent) : null,
      })),
      histogram: histogram(values),
    };
  }

  const pending = await db.task.count({
    where: {
      listId,
      column: { category: { in: ["BACKLOG", "ACTIVE", "WAITING"] } },
    },
  });
  const items = query.items ?? pending;
  const defaulted = query.items === undefined;
  if (items === 0) {
    return {
      ...common,
      question: "WHEN" as const,
      items,
      defaulted,
      pending,
      nothingPending: true as const,
      confidence: [] as Confidence[],
      histogram: [],
    };
  }
  const values = possible ? whenDone(samples, items, { seed }) : [];
  return {
    ...common,
    question: "WHEN" as const,
    items,
    defaulted,
    pending,
    nothingPending: false as const,
    confidence: PERCENTILES.map((percent): Confidence => {
      const days = possible ? daysWithin(values, percent) : null;
      return {
        percent,
        days,
        date:
          days === null ? null : dayKey(dateOfDay(today, days, workdaysOnly)),
      };
    }),
    histogram: histogram(values),
  };
}
