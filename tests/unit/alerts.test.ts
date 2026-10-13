import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALERTS,
  detectAlerts,
  type AlertSettings,
} from "../../src/lib/alerts";
import type { Metrics } from "../../src/lib/metrics";

type Overrides = {
  series?: Record<string, number[]>;
  age?: { id: string; days: number }[];
  p85?: number | null;
  finished?: number;
  weekly?: number[];
};

// A list with "Doing" (limit 2) and "Review" (no limit); only what the rules read is filled in.
const stages = [
  { id: "doing", name: "Doing", category: "ACTIVE", wipLimit: 2 },
  { id: "review", name: "Review", category: "ACTIVE", wipLimit: null },
  { id: "done", name: "Done", category: "DONE", wipLimit: null },
] as const;

function metrics(o: Overrides = {}) {
  const series = o.series ?? {};
  return {
    cfd: {
      days: [],
      series: Object.entries(series).map(([bucket, counts]) => ({
        bucket,
        category: "ACTIVE",
        counts,
      })),
    },
    cycleTime: {
      count: o.finished ?? 10,
      p50: 2,
      p85: o.p85 === undefined ? 8 : o.p85,
      p95: 9,
    },
    age: (o.age ?? []).map((a) => ({ ...a, bucket: "doing" })),
    throughput: {
      total: 0,
      daily: [],
      weekly: (o.weekly ?? []).map((count, i) => ({
        weekStart: `2026-08-${String(10 + i).padStart(2, "0")}`,
        count,
      })),
    },
    titles: { a: "Fix login", b: "Write docs" },
  } as unknown as Metrics & { titles: Record<string, string> };
}
const run = (o: Overrides, s: Partial<AlertSettings> = {}) =>
  detectAlerts(metrics(o), [...stages], { ...DEFAULT_ALERTS, ...s });
const kinds = (o: Overrides, s?: Partial<AlertSettings>) =>
  run(o, s).map((a) => a.key);

describe("WIP over the limit", () => {
  it("fires after the configured days in a row, ending today", () => {
    expect(kinds({ series: { doing: [1, 3, 3, 3] } })).toContain("wip:doing");
    expect(kinds({ series: { doing: [1, 3, 3] } })).not.toContain("wip:doing");
  });

  it("does not fire when it went back under the limit today", () => {
    expect(kinds({ series: { doing: [3, 3, 3, 2] } })).not.toContain(
      "wip:doing",
    );
  });

  it("counts a run broken in the middle only from the last break", () => {
    expect(kinds({ series: { doing: [3, 3, 2, 3, 3] } })).not.toContain(
      "wip:doing",
    );
  });

  it("ignores stages without a limit and follows the setting", () => {
    expect(kinds({ series: { review: [9, 9, 9, 9] } })).toEqual([]);
    expect(kinds({ series: { doing: [1, 3, 3] } }, { wipDays: 2 })).toContain(
      "wip:doing",
    );
  });
});

describe("band widening", () => {
  it("fires when the band grows over the days without shrinking, by at least two", () => {
    expect(kinds({ series: { review: [1, 1, 2, 3] } })).toEqual([
      "band:review",
    ]);
    expect(kinds({ series: { review: [0, 1, 1, 2] } })).toEqual([
      "band:review",
    ]);
  });

  it("does not fire for a dip, a growth of one, or too little history", () => {
    expect(kinds({ series: { review: [1, 3, 2, 3] } })).toEqual([]);
    expect(kinds({ series: { review: [2, 2, 3, 3] } })).toEqual([]);
    expect(kinds({ series: { review: [1, 3, 4] } })).toEqual([]);
  });

  it("does not apply to a done stage", () => {
    expect(kinds({ series: { done: [0, 3, 6, 9] } })).toEqual([]);
  });
});

describe("task aging", () => {
  it("fires for tasks older than the 85th percentile, not for equal ones", () => {
    expect(
      kinds({
        age: [
          { id: "a", days: 8.5 },
          { id: "b", days: 8 },
        ],
      }),
    ).toEqual(["age:a"]);
  });

  it("names the task and the percentile", () => {
    const [alert] = run({ age: [{ id: "a", days: 12 }] });
    expect(alert!.message).toContain('"Fix login"');
    expect(alert!.message).toContain("12.0 days");
    expect(alert!.message).toContain("8.0 days");
    expect(alert!.taskId).toBe("a");
  });

  it("needs five finished tasks for the percentile to mean anything", () => {
    expect(kinds({ finished: 4, age: [{ id: "a", days: 99 }] })).toEqual([]);
    expect(kinds({ finished: 5, age: [{ id: "a", days: 99 }] })).toEqual([
      "age:a",
    ]);
    expect(kinds({ p85: null, age: [{ id: "a", days: 99 }] })).toEqual([]);
  });
});

describe("throughput drop", () => {
  // First and last weeks are partial and never count: [x, 4, 4, 4, 4, last, x].
  it("fires when the last complete week is at least the set percent under the average", () => {
    expect(kinds({ weekly: [9, 4, 4, 4, 4, 2, 9] })).toEqual(["drop"]);
    expect(kinds({ weekly: [9, 4, 4, 4, 4, 3, 0] })).toEqual([]);
  });

  it("ignores the partial first and last weeks", () => {
    expect(kinds({ weekly: [0, 4, 4, 4, 4, 4, 0] })).toEqual([]);
  });

  it("needs five complete weeks and an average of at least one a week", () => {
    expect(kinds({ weekly: [9, 4, 4, 4, 0, 9] })).toEqual([]);
    expect(kinds({ weekly: [9, 0, 1, 0, 0, 0, 9] })).toEqual([]);
  });

  it("follows the setting and reports the numbers", () => {
    expect(
      kinds({ weekly: [9, 4, 4, 4, 4, 3, 9] }, { dropPercent: 25 }),
    ).toEqual(["drop"]);
    const [alert] = run({ weekly: [9, 4, 4, 4, 4, 2, 9] });
    expect(alert!.message).toContain("finished 2 tasks");
    expect(alert!.message).toContain("4.0 a week");
    expect(alert!.message).toContain("50%");
  });
});
