import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  computeMetrics,
  dayKey,
  percentile,
  type MetricEvent,
  type MetricTask,
  type MetricsInput,
} from "../../src/lib/metrics";
import type { Category } from "../../src/lib/workflow";

// A small world whose answers were worked out by hand. Stages and their categories:
//   todo BACKLOG | doing ACTIVE (the commitment point) | review ACTIVE | wait WAITING | done DONE | out DISCARDED
// Everything happens in March 2026 (UTC); March 2 is a Monday. "now" is March 16, 12:00.
const CATEGORY: Record<string, Category> = {
  todo: "BACKLOG",
  doing: "ACTIVE",
  review: "ACTIVE",
  wait: "WAITING",
  done: "DONE",
  out: "DISCARDED",
  // An active stage that comes BEFORE the commitment point: being in it is not starting.
  triage: "ACTIVE",
  // A stage that was deleted later: its events keep the category but not the stage.
  gone: "ACTIVE",
};
const at = (day: string, time = "09:00") =>
  Date.parse(`2026-03-${day}T${time}:00Z`);
const NOW = at("16", "12:00");

type Step = [type: MetricEvent["type"], when: number, stage: string];
const task = (id: string, steps: Step[]): MetricTask => ({
  id,
  events: steps.map(([type, when, stage]) => ({
    type,
    at: when,
    toStageId: stage === "gone" ? null : stage,
    toCategory: CATEGORY[stage]!,
  })),
});
const created = (when: number, stage = "todo"): Step => [
  "CREATED",
  when,
  stage,
];
const moved = (when: number, stage: string): Step => ["MOVED", when, stage];

const STARTED = new Set(["doing", "review", "wait", "done"]);
const input = (
  tasks: MetricTask[],
  overrides: Partial<MetricsInput> = {},
): MetricsInput => ({
  tasks,
  from: at("02", "00:00"),
  to: at("15", "00:00"),
  now: NOW,
  isStarted: (e) =>
    e.toStageId === null
      ? ["ACTIVE", "WAITING", "DONE"].includes(e.toCategory)
      : STARTED.has(e.toStageId),
  bucket: (stageId, category) => stageId ?? `removed:${category}`,
  order: ["todo", "doing", "review", "wait", "done", "out"],
  ...overrides,
});

const WORLD: MetricTask[] = [
  // T1: 3 days of work, no waiting. Finished Fri Mar 6.
  task("T1", [
    created(at("02")),
    moved(at("03"), "doing"),
    moved(at("05"), "review"),
    moved(at("06"), "done"),
  ]),
  // T2: waited one day in a waiting stage. Finished Mon Mar 9.
  task("T2", [
    created(at("02", "12:00")),
    moved(at("04", "12:00"), "doing"),
    moved(at("06", "12:00"), "wait"),
    moved(at("07", "12:00"), "review"),
    moved(at("09", "12:00"), "done"),
  ]),
  // T3: blocked for two days in an active stage. Finished Sun Mar 8 (the week of Mar 2).
  task("T3", [
    created(at("03", "08:00")),
    moved(at("04", "08:00"), "doing"),
    ["BLOCKED", at("05", "08:00"), "doing"],
    ["UNBLOCKED", at("07", "08:00"), "doing"],
    moved(at("08", "08:00"), "done"),
  ]),
  // T4: finished, reopened, finished again. Cycle time keeps the first start.
  task("T4", [
    created(at("04", "10:00")),
    moved(at("05", "10:00"), "doing"),
    moved(at("06", "10:00"), "done"),
    ["REOPENED", at("09", "10:00"), "doing"],
    moved(at("12", "10:00"), "done"),
  ]),
  // T5: discarded while in progress.
  task("T5", [
    created(at("05")),
    moved(at("06", "11:00"), "doing"),
    ["DISCARDED", at("08", "11:00"), "out"],
  ]),
  // T6: still in the backlog.
  task("T6", [created(at("09"))]),
  // T7: in progress since Mar 11 09:00, so its age is 5 days and 3 hours.
  task("T7", [created(at("10")), moved(at("11"), "doing")]),
  // T8: created before the range, finished inside it.
  task("T8", [
    created(at("01")),
    moved(at("01", "15:00"), "doing"),
    moved(at("03", "15:00"), "done"),
  ]),
  // T9: finished after the range (Mar 16 08:00).
  task("T9", [
    created(at("12")),
    moved(at("13"), "doing"),
    moved(at("16", "08:00"), "done"),
  ]),
  // T10: in a stage that no longer exists.
  task("T10", [created(at("06")), moved(at("07"), "gone")]),
  // T11: created straight in the done stage: it starts and finishes at once.
  task("T11", [created(at("10"), "done")]),
  // T12: done, then discarded: it never counts as finished.
  task("T12", [
    created(at("02", "08:00")),
    moved(at("02", "16:00"), "doing"),
    moved(at("03", "16:00"), "done"),
    ["DISCARDED", at("04", "16:00"), "out"],
  ]),
];

const m = computeMetrics(input(WORLD));

describe("throughput", () => {
  it("counts the tasks whose last finish is in the range, per day and per week", () => {
    expect(m.throughput.total).toBe(6); // T1, T2, T3, T4, T8, T11
    const busy = m.throughput.daily.filter((d) => d.count > 0);
    expect(busy).toEqual([
      { date: "2026-03-03", count: 1 }, // T8
      { date: "2026-03-06", count: 1 }, // T1
      { date: "2026-03-08", count: 1 }, // T3
      { date: "2026-03-09", count: 1 }, // T2
      { date: "2026-03-10", count: 1 }, // T11
      { date: "2026-03-12", count: 1 }, // T4, the second time
    ]);
    expect(m.throughput.daily).toHaveLength(14);
    expect(m.throughput.weekly).toEqual([
      { weekStart: "2026-03-02", count: 3 }, // T8, T1 and T3 (Sunday Mar 8 belongs to this week)
      { weekStart: "2026-03-09", count: 3 }, // T2, T11, T4
    ]);
  });

  it("leaves out discarded tasks, tasks finished after the range and tasks reopened and not closed", () => {
    const ids = m.finished.map((f) => f.id).sort();
    expect(ids).toEqual(["T1", "T11", "T2", "T3", "T4", "T8"]);
    expect(ids).not.toContain("T12"); // done, then discarded
    expect(ids).not.toContain("T9"); // finished on Mar 16, after the range
    expect(ids).not.toContain("T5");
  });

  it("a task reopened and left open is not finished", () => {
    const open = task("R", [
      created(at("02")),
      moved(at("03"), "doing"),
      moved(at("04"), "done"),
      ["REOPENED", at("05"), "doing"],
    ]);
    expect(computeMetrics(input([open])).throughput.total).toBe(0);
  });
});

describe("cycle time and lead time", () => {
  const days = (id: string, key: "cycleDays" | "leadDays") =>
    m.finished.find((f) => f.id === id)![key];

  it("cycle time runs from the first start to the last finish", () => {
    expect(days("T1", "cycleDays")).toBe(3);
    expect(days("T2", "cycleDays")).toBe(5);
    expect(days("T3", "cycleDays")).toBe(4); // blocking does not stop the clock
    expect(days("T8", "cycleDays")).toBe(2);
    expect(days("T11", "cycleDays")).toBe(0);
  });

  it("reopening does not restart the cycle time", () => {
    expect(days("T4", "cycleDays")).toBe(7); // Mar 5 10:00 to Mar 12 10:00, the days in done included
  });

  it("lead time runs from creation to the last finish", () => {
    expect(days("T1", "leadDays")).toBe(4);
    expect(days("T2", "leadDays")).toBe(7);
    expect(days("T4", "leadDays")).toBe(8);
    expect(days("T8", "leadDays")).toBe(2.25); // created before the range
    expect(days("T11", "leadDays")).toBe(0);
  });

  it("gives the percentiles by nearest rank", () => {
    // Cycle times 0, 2, 3, 4, 5, 7 and lead times 0, 2.25, 4, 5, 7, 8.
    expect(m.cycleTime).toEqual({ count: 6, p50: 3, p85: 7, p95: 7 });
    expect(m.leadTime).toEqual({ count: 6, p50: 4, p85: 8, p95: 8 });
  });

  it("starts the clock at the commitment point, not at an active stage before it", () => {
    // "triage" is active but comes before "doing", the commitment point: being there is not starting.
    const flow = task("P", [
      created(at("02")),
      moved(at("03"), "triage"),
      moved(at("05"), "doing"),
      moved(at("06"), "done"),
    ]);
    const result = computeMetrics(input([flow]));
    expect(result.finished[0]).toMatchObject({ cycleDays: 1, leadDays: 4 }); // from Mar 5, not Mar 3
    expect(result.flowEfficiency.activeDays).toBe(1); // the day in triage is not work in progress either
  });
});

describe("work in progress and age", () => {
  it("counts the tasks in active or waiting stages now", () => {
    expect(m.wip.total).toBe(2); // T7 and T10
  });

  it("says where every task is now, also in a stage that was deleted", () => {
    const count = (bucket: string) =>
      m.wip.current.find((c) => c.bucket === bucket)?.count;
    expect(count("todo")).toBe(1); // T6
    expect(count("doing")).toBe(1); // T7
    expect(count("removed:ACTIVE")).toBe(1); // T10
    expect(count("done")).toBe(7); // T1, T2, T3, T4, T8, T9, T11
    expect(count("out")).toBe(2); // T5, T12
  });

  it("measures the age from the first start to now", () => {
    const age = Object.fromEntries(m.age.map((a) => [a.id, a.days]));
    expect(Object.keys(age).sort()).toEqual(["T10", "T7"]);
    expect(age.T7).toBe(5.125); // Mar 11 09:00 to Mar 16 12:00
    expect(age.T10).toBe(9.125); // Mar 7 09:00 to Mar 16 12:00
  });
});

describe("flow efficiency", () => {
  it("is the active share of the time finished tasks spent in active or waiting stages", () => {
    // Active days: T1 3, T2 4, T3 2, T4 4 (the time in done is not work), T8 2, T11 0 = 15.
    // Waiting days: T2 1 (a waiting stage) and T3 2 (blocked) = 3.
    expect(m.flowEfficiency.activeDays).toBe(15);
    expect(m.flowEfficiency.waitingDays).toBe(3);
    expect(m.flowEfficiency.blockedDays).toBe(2);
    expect(m.flowEfficiency.ratio).toBeCloseTo(15 / 18, 10);
  });

  it("is null when nothing finished, rather than zero or one", () => {
    expect(
      computeMetrics(
        input([task("A", [created(at("02")), moved(at("03"), "doing")])]),
      ).flowEfficiency.ratio,
    ).toBeNull();
  });

  it("does not count blocked time twice in a waiting stage", () => {
    const t = task("W", [
      created(at("02")),
      moved(at("03"), "wait"),
      ["BLOCKED", at("04"), "wait"],
      ["UNBLOCKED", at("05"), "wait"],
      moved(at("06"), "done"),
    ]);
    const f = computeMetrics(input([t])).flowEfficiency;
    expect(f.waitingDays).toBe(3); // Mar 3 to Mar 6, once
    expect(f.activeDays).toBe(0);
    expect(f.blockedDays).toBe(1);
  });
});

describe("reopened and the cumulative flow diagram", () => {
  it("counts the reopenings in the range", () => {
    expect(m.reopened).toBe(1);
    expect(
      computeMetrics(input(WORLD, { from: at("10", "00:00") })).reopened,
    ).toBe(0); // T4 reopened on Mar 9
  });

  const series = (bucket: string) =>
    m.cfd.series.find((s) => s.bucket === bucket)!.counts;

  it("has one entry per day, in flow order with unknown stages last", () => {
    expect(m.cfd.days).toHaveLength(14);
    expect(m.cfd.days[0]).toBe("2026-03-02");
    expect(m.cfd.days[13]).toBe("2026-03-15");
    expect(m.cfd.series.map((s) => s.bucket)).toEqual([
      "todo",
      "doing",
      "review",
      "wait",
      "done",
      "out",
      "removed:ACTIVE",
    ]);
  });

  it("counts where each task was at the end of the first days", () => {
    // End of Mar 2: T1 and T2 in todo; T8 and T12 in doing. T3.. are not created yet.
    expect([series("todo")[0], series("doing")[0], series("done")[0]]).toEqual([
      2, 2, 0,
    ]);
    // End of Mar 3: T2 and T3 in todo; T1 in doing; T8 and T12 done.
    expect([series("todo")[1], series("doing")[1], series("done")[1]]).toEqual([
      2, 1, 2,
    ]);
  });

  it("counts a discarded task in its own band, and a deleted stage under its category", () => {
    expect(series("out")[1]).toBe(0); // T12 is still in done at the end of Mar 3
    expect(series("out")[2]).toBe(1); // and is discarded on Mar 4 (index 2)
    expect(series("out")[5]).toBe(1);
    expect(series("out")[6]).toBe(2); // T5 is discarded on Mar 8
    expect(series("removed:ACTIVE")[4]).toBe(0);
    expect(series("removed:ACTIVE")[5]).toBe(1); // T10 enters on Mar 7
  });

  it("shows the whole world at the end of the range, and the bands add up to the tasks created", () => {
    const last = m.cfd.days.length - 1;
    expect(series("done")[last]).toBe(6); // T9 finishes after Mar 15
    expect(series("doing")[last]).toBe(2); // T7, T9
    expect(series("todo")[last]).toBe(1);
    expect(series("out")[last]).toBe(2);
    expect(series("removed:ACTIVE")[last]).toBe(1);
    const total = m.cfd.series.reduce((sum, s) => sum + s.counts[last]!, 0);
    expect(total).toBe(12);
    // Tasks are never lost between days: the total only grows, by the tasks created that day.
    const totals = m.cfd.days.map((_, i) =>
      m.cfd.series.reduce((sum, s) => sum + s.counts[i]!, 0),
    );
    for (let i = 1; i < totals.length; i++)
      expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]!);
  });

  it("uses the current instant for today instead of the end of the day", () => {
    // Range ending on Mar 16: T9 finished at 08:00, and now is 12:00.
    const wide = computeMetrics(input(WORLD, { to: at("16", "00:00") }));
    const done = wide.cfd.series.find((s) => s.bucket === "done")!.counts;
    expect(done[done.length - 1]).toBe(7);
    // A "now" before the finish does not see it.
    const earlier = computeMetrics(
      input(WORLD, { to: at("16", "00:00"), now: at("16", "07:00") }),
    );
    expect(
      earlier.cfd.series.find((s) => s.bucket === "done")!.counts.at(-1),
    ).toBe(6);
  });
});

describe("ranges", () => {
  it("a one-day range works, and tasks finished in it are counted", () => {
    const one = computeMetrics(
      input(WORLD, { from: at("06", "00:00"), to: at("06", "00:00") }),
    );
    expect(one.throughput.daily).toEqual([{ date: "2026-03-06", count: 1 }]);
    expect(one.throughput.weekly).toEqual([
      { weekStart: "2026-03-02", count: 1 },
    ]);
    expect(one.cfd.days).toEqual(["2026-03-06"]);
  });

  it("ignores tasks without events and handles an empty list", () => {
    const empty = computeMetrics(input([{ id: "x", events: [] }]));
    expect(empty.throughput.total).toBe(0);
    expect(empty.cycleTime).toEqual({
      count: 0,
      p50: null,
      p85: null,
      p95: null,
    });
    expect(empty.cfd.series).toEqual([]);
    expect(empty.wip.total).toBe(0);
  });

  it("a task finished before the range is not in it", () => {
    const early = computeMetrics(input(WORLD, { from: at("07", "00:00") }));
    expect(early.finished.map((f) => f.id).sort()).toEqual([
      "T11",
      "T2",
      "T3",
      "T4",
    ]);
  });
});

describe("helpers", () => {
  it("percentile uses nearest rank", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([4, 1, 3, 2], 50)).toBe(2); // rank ceil(2) = 2
    expect(percentile([4, 1, 3, 2], 75)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 85)).toBe(9); // rank ceil(8.5) = 9
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 100)).toBe(10);
  });

  it("dayKey is the UTC day", () => {
    expect(dayKey(Date.parse("2026-03-08T23:59:59Z"))).toBe("2026-03-08");
    expect(dayKey(Date.parse("2026-03-09T00:00:00Z"))).toBe("2026-03-09");
    expect(DAY_MS).toBe(86_400_000);
  });
});
