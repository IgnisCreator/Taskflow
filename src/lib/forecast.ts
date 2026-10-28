// Monte Carlo forecast, as pure functions. The history is the number of tasks finished on each day of
// a window; every simulated day draws one of those days at random (zeros included, so quiet days are
// part of the answer) and adds what it finished. The random numbers come from a seed: the same
// history and seed always give the same answer.
//
// - whenDone: how many days until `items` tasks are finished, in each run.
// - howMany: how many tasks are finished within `days` days, in each run.
//
// Day 1 is tomorrow. With `workdaysOnly`, history samples are the Monday-to-Friday days only and
// simulated days skip weekends (work finished on a weekend in the past is not counted).

import { DAY_MS, percentile } from "@/lib/metrics";

export const RUNS = 10_000;
/** A run that needs more simulated days than this is counted as "beyond the horizon". */
export const HORIZON_DAYS = 1000;
export const MAX_ITEMS = 1000;
export const MAX_AHEAD_DAYS = 366;
export const MAX_SEED = 2_147_483_647;
export const DEFAULT_WINDOW_DAYS = 90;
/** Below these a forecast is a rough guide at best. */
export const MIN_DAYS_WITH_DATA = 10;
export const MIN_FINISHED = 5;

/** A small seedable generator (mulberry32): numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isWorkday = (ms: number) => {
  const weekday = new Date(ms).getUTCDay();
  return weekday !== 0 && weekday !== 6;
};

/** The daily counts to draw from: the whole window, or only its Monday-to-Friday days. */
export function samplesOf(
  daily: { date: string; count: number }[],
  workdaysOnly: boolean,
): number[] {
  return daily
    .filter(
      (d) => !workdaysOnly || isWorkday(Date.parse(`${d.date}T00:00:00Z`)),
    )
    .map((d) => d.count);
}

/** The calendar date (midnight UTC) of simulated day `n`, where day 1 is the day after `today`. */
export function dateOfDay(today: number, n: number, workdaysOnly: boolean) {
  let date = today;
  for (let left = n; left > 0;) {
    date += DAY_MS;
    if (!workdaysOnly || isWorkday(date)) left--;
  }
  return date;
}

/** How many simulated days lie between tomorrow and `target` (both included). */
export function daysUntil(
  today: number,
  target: number,
  workdaysOnly: boolean,
) {
  let days = 0;
  for (let date = today + DAY_MS; date <= target; date += DAY_MS) {
    if (!workdaysOnly || isWorkday(date)) days++;
  }
  return days;
}

type Options = { seed: number; runs?: number };

/** Days to finish `items` tasks, one value per run; Infinity when the run gave up at the horizon. */
export function whenDone(
  samples: number[],
  items: number,
  { seed, runs = RUNS }: Options,
): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: runs }, () => {
    let left = items;
    let days = 0;
    while (left > 0 && days < HORIZON_DAYS) {
      left -= samples[Math.floor(random() * samples.length)]!;
      days++;
    }
    return left > 0 ? Infinity : days;
  });
}

/** Tasks finished within `days` days, one value per run. */
export function howMany(
  samples: number[],
  days: number,
  { seed, runs = RUNS }: Options,
): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: runs }, () => {
    let done = 0;
    for (let day = 0; day < days; day++) {
      done += samples[Math.floor(random() * samples.length)]!;
    }
    return done;
  });
}

/** Days within which `p`% of the runs finished (nearest rank); null when that is beyond the horizon. */
export function daysWithin(values: number[], p: number): number | null {
  const days = percentile(values, p);
  return days === null || !Number.isFinite(days) ? null : days;
}

/** The count reached or beaten in at least `p`% of the runs. */
export function atLeast(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * (1 - p / 100))]!;
}

export type Bin = { from: number; to: number; count: number };

/** Whole-number bins covering the finite values: one per value, or equal widths if there are many. */
export function histogram(values: number[], maxBins = 20): Bin[] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const width = Math.ceil((max - min + 1) / maxBins);
  const bins: Bin[] = Array.from(
    { length: Math.ceil((max - min + 1) / width) },
    (_, i) => ({
      from: min + i * width,
      to: min + (i + 1) * width - 1,
      count: 0,
    }),
  );
  for (const v of finite) bins[Math.floor((v - min) / width)]!.count++;
  return bins;
}

export const PERCENTILES = [50, 85, 95] as const;
