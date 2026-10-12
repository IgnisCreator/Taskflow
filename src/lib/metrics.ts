// The flow metrics, as pure functions over the history of events. No database here: the service
// reads the events and calls `computeMetrics`; the tests feed it small histories whose answers were
// worked out by hand.
//
// Definitions (the Kanban Guide for WIP, throughput, work item age and cycle time; the Kanban
// University glossary for lead time and the cumulative flow diagram):
//
// - Started: the first time a task enters a stage at or after the commitment point (`isStarted`).
// - Finished: the moment a task entered DONE for the last time, if it is in DONE now. A task that
//   is reopened is not finished until it is closed again; a discarded task never is.
// - Cycle time: from the first start to the last finish. Reopening does not restart it.
// - Lead time: from creation to the last finish.
// - Throughput: tasks finished per day or per week (Monday to Sunday, UTC). Discarded tasks do not count.
// - WIP: tasks in ACTIVE or WAITING stages now.
// - Work item age: now minus the first start, for tasks in ACTIVE or WAITING stages now.
// - Flow efficiency (complementary): of the time finished tasks spent in ACTIVE or WAITING stages,
//   the share that was active (not waiting, not blocked).
// - Reopened: REOPENED events in the range.
// - CFD: how many tasks were in each stage at the end of each day.
//
// All days are UTC days; durations are in days (fractions allowed).

import type { Category } from "@/lib/workflow";

export const DAY_MS = 86_400_000;

export type MetricEvent = {
  type:
    "CREATED" | "MOVED" | "BLOCKED" | "UNBLOCKED" | "DISCARDED" | "REOPENED";
  /** Milliseconds since the epoch. */
  at: number;
  /** Null when the stage was deleted later; the category is still known. */
  toStageId: string | null;
  toCategory: Category;
};

export type MetricTask = {
  id: string;
  /** Oldest first. */
  events: MetricEvent[];
};

export type MetricsInput = {
  tasks: MetricTask[];
  /** First day of the range, as milliseconds at 00:00 UTC. */
  from: number;
  /** Last day of the range (inclusive), as milliseconds at 00:00 UTC. */
  to: number;
  now: number;
  /** Does entering this stage count as starting work? */
  isStarted: (event: MetricEvent) => boolean;
  /** The CFD and WIP group of a position: usually the stage id, or the category across lists. */
  bucket: (stageId: string | null, category: Category) => string;
  /** The buckets in flow order, for the CFD; unknown ones go last, by category. */
  order: string[];
};

const CATEGORY_RANK: Record<Category, number> = {
  BACKLOG: 0,
  ACTIVE: 1,
  WAITING: 1,
  DONE: 2,
  DISCARDED: 3,
};
const inFlight = (c: Category) => c === "ACTIVE" || c === "WAITING";

const dayStart = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;
export const dayKey = (ms: number) =>
  new Date(dayStart(ms)).toISOString().slice(0, 10);
/** Monday 00:00 UTC of the week of `ms`. */
const weekStart = (ms: number) => {
  const day = dayStart(ms);
  const weekday = (new Date(day).getUTCDay() + 6) % 7; // Monday is 0
  return day - weekday * DAY_MS;
};

/** The p-th percentile by the nearest-rank method: the smallest value with at least p% of the data at or below it. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1]!;
}

type Summary = {
  id: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  category: Category;
  bucket: string;
  activeMs: number;
  waitingMs: number;
  blockedMs: number;
};

function summarize(task: MetricTask, input: MetricsInput): Summary | null {
  if (task.events.length === 0) return null;
  const events = task.events;
  let startedAt: number | null = null;
  let doneSince: number | null = null;
  // The category before each event is unknown for the first one, so a task created in a done stage
  // counts as finished from its creation. Only the final category decides whether it is finished now;
  // `doneSince` is when it last entered done.
  let category: Category | null = null;
  for (const e of events) {
    if (
      startedAt === null &&
      inFlightOrDone(e.toCategory) &&
      input.isStarted(e)
    )
      startedAt = e.at;
    if (e.toCategory === "DONE" && category !== "DONE") doneSince = e.at;
    category = e.toCategory;
  }
  const finishedAt = category === "DONE" ? doneSince : null;
  const last = events[events.length - 1]!;

  // Time in flight between the first start and the finish, split into active and waiting.
  let activeMs = 0;
  let waitingMs = 0;
  let blockedMs = 0;
  if (startedAt !== null && finishedAt !== null) {
    let at = events[0]!.at;
    let cat = events[0]!.toCategory;
    let blocked = false;
    const close = (until: number) => {
      const from = Math.max(at, startedAt);
      const to = Math.min(until, finishedAt);
      if (to <= from || !inFlight(cat)) return;
      if (blocked) blockedMs += to - from;
      if (blocked || cat === "WAITING") waitingMs += to - from;
      else activeMs += to - from;
    };
    for (const e of events.slice(1)) {
      close(e.at);
      at = e.at;
      if (e.type === "BLOCKED") blocked = true;
      else if (e.type === "UNBLOCKED") blocked = false;
      cat = e.toCategory;
    }
    close(finishedAt);
  }

  return {
    id: task.id,
    createdAt: events.find((e) => e.type === "CREATED")?.at ?? events[0]!.at,
    startedAt,
    finishedAt,
    category: last.toCategory,
    bucket: input.bucket(last.toStageId, last.toCategory),
    activeMs,
    waitingMs,
    blockedMs,
  };
}

const inFlightOrDone = (c: Category) => inFlight(c) || c === "DONE";

export type Metrics = {
  range: { from: string; to: string };
  throughput: {
    total: number;
    daily: { date: string; count: number }[];
    weekly: { weekStart: string; count: number }[];
  };
  /** One per finished task in the range: when it finished and how long it took. */
  finished: {
    id: string;
    finishedAt: number;
    cycleDays: number;
    leadDays: number;
  }[];
  cycleTime: Percentiles;
  leadTime: Percentiles;
  wip: {
    total: number;
    current: { bucket: string; category: Category; count: number }[];
  };
  age: { id: string; bucket: string; days: number }[];
  flowEfficiency: {
    /** Active time over active plus waiting time of the finished tasks; null without any. */
    ratio: number | null;
    activeDays: number;
    waitingDays: number;
    blockedDays: number;
  };
  reopened: number;
  cfd: {
    days: string[];
    series: { bucket: string; category: Category; counts: number[] }[];
  };
};

export type Percentiles = {
  count: number;
  p50: number | null;
  p85: number | null;
  p95: number | null;
};

const percentiles = (values: number[]): Percentiles => ({
  count: values.length,
  p50: percentile(values, 50),
  p85: percentile(values, 85),
  p95: percentile(values, 95),
});

export function computeMetrics(input: MetricsInput): Metrics {
  const { from, to, now } = input;
  const end = to + DAY_MS; // exclusive
  const summaries = input.tasks.flatMap((t) => summarize(t, input) ?? []);

  // Throughput and the samples: tasks whose last finish is in the range.
  const done = summaries.filter(
    (s) => s.finishedAt !== null && s.finishedAt >= from && s.finishedAt < end,
  );
  const dailyCounts = new Map<number, number>();
  const weeklyCounts = new Map<number, number>();
  for (const s of done) {
    dailyCounts.set(
      dayStart(s.finishedAt!),
      (dailyCounts.get(dayStart(s.finishedAt!)) ?? 0) + 1,
    );
    weeklyCounts.set(
      weekStart(s.finishedAt!),
      (weeklyCounts.get(weekStart(s.finishedAt!)) ?? 0) + 1,
    );
  }
  const days: number[] = [];
  for (let d = dayStart(from); d <= dayStart(to); d += DAY_MS) days.push(d);
  const weeks = [...new Set(days.map(weekStart))];

  const finished = done.map((s) => ({
    id: s.id,
    finishedAt: s.finishedAt!,
    cycleDays: (s.finishedAt! - s.startedAt!) / DAY_MS,
    leadDays: (s.finishedAt! - s.createdAt) / DAY_MS,
  }));

  // WIP and age: where the tasks are now.
  const inProgress = summaries.filter((s) => inFlight(s.category));
  const nowCounts = new Map<string, { category: Category; count: number }>();
  for (const s of summaries) {
    const entry = nowCounts.get(s.bucket) ?? { category: s.category, count: 0 };
    entry.count++;
    nowCounts.set(s.bucket, entry);
  }

  // Flow efficiency over the tasks finished in the range.
  const sum = (pick: (s: Summary) => number) =>
    done.reduce((total, s) => total + pick(s), 0);
  const active = sum((s) => s.activeMs);
  const waiting = sum((s) => s.waitingMs);

  // CFD: the state at the end of each day (the current instant for today).
  const cfdCounts = new Map<string, { category: Category; counts: number[] }>();
  days.forEach((day, index) => {
    const at = Math.min(day + DAY_MS - 1, now);
    for (const task of input.tasks) {
      let last: MetricEvent | undefined;
      for (const e of task.events) {
        if (e.at <= at) last = e;
        else break;
      }
      if (!last) continue;
      const key = input.bucket(last.toStageId, last.toCategory);
      const entry = cfdCounts.get(key) ?? {
        category: last.toCategory,
        counts: new Array<number>(days.length).fill(0),
      };
      entry.counts[index]!++;
      cfdCounts.set(key, entry);
    }
  });
  const known = new Map(input.order.map((bucket, i) => [bucket, i]));
  const series = [...cfdCounts.entries()]
    .map(([bucket, { category, counts }]) => ({ bucket, category, counts }))
    .sort(
      (a, b) =>
        (known.get(a.bucket) ?? Infinity) - (known.get(b.bucket) ?? Infinity) ||
        CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
        a.bucket.localeCompare(b.bucket),
    );

  return {
    range: { from: dayKey(from), to: dayKey(to) },
    throughput: {
      total: done.length,
      daily: days.map((d) => ({
        date: dayKey(d),
        count: dailyCounts.get(d) ?? 0,
      })),
      weekly: weeks.map((w) => ({
        weekStart: dayKey(w),
        count: weeklyCounts.get(w) ?? 0,
      })),
    },
    finished,
    cycleTime: percentiles(finished.map((f) => f.cycleDays)),
    leadTime: percentiles(finished.map((f) => f.leadDays)),
    wip: {
      total: inProgress.length,
      current: [...nowCounts.entries()].map(([bucket, v]) => ({
        bucket,
        ...v,
      })),
    },
    age: inProgress.map((s) => ({
      id: s.id,
      bucket: s.bucket,
      days: (now - (s.startedAt ?? s.createdAt)) / DAY_MS,
    })),
    flowEfficiency: {
      ratio: active + waiting > 0 ? active / (active + waiting) : null,
      activeDays: active / DAY_MS,
      waitingDays: waiting / DAY_MS,
      blockedDays: sum((s) => s.blockedMs) / DAY_MS,
    },
    reopened: input.tasks.reduce(
      (total, t) =>
        total +
        t.events.filter(
          (e) => e.type === "REOPENED" && e.at >= from && e.at < end,
        ).length,
      0,
    ),
    cfd: { days: days.map(dayKey), series },
  };
}
