import { describe, expect, it } from "vitest";
import {
  HORIZON_DAYS,
  atLeast,
  dateOfDay,
  daysUntil,
  daysWithin,
  histogram,
  howMany,
  mulberry32,
  samplesOf,
  whenDone,
} from "../../src/lib/forecast";

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
// 2026-10-09 is a Friday, so tomorrow is a Saturday.
const FRIDAY = utc("2026-10-09");

describe("mulberry32", () => {
  it("is repeatable per seed and stays in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(mulberry32(8)()).not.toBe(first[0]);
  });
});

describe("a constant pace has an exact answer", () => {
  it("2 tasks every day: 10 tasks take exactly 5 days in every run", () => {
    const days = whenDone([2, 2, 2], 10, { seed: 1, runs: 500 });
    expect(new Set(days)).toEqual(new Set([5]));
    expect(daysWithin(days, 50)).toBe(5);
    expect(daysWithin(days, 95)).toBe(5);
  });

  it("rounds up: 11 tasks at 2 a day take 6 days", () => {
    expect(new Set(whenDone([2], 11, { seed: 9, runs: 100 }))).toEqual(
      new Set([6]),
    );
  });

  it("2 tasks every day: 7 days always finish 14, so every confidence gives 14", () => {
    const done = howMany([2, 2], 7, { seed: 3, runs: 500 });
    expect(new Set(done)).toEqual(new Set([14]));
    expect([50, 85, 95].map((p) => atLeast(done, p))).toEqual([14, 14, 14]);
  });
});

describe("the simulation", () => {
  it("gives the same answer for the same seed and another for a different one", () => {
    const samples = [0, 0, 1, 3, 5];
    const a = whenDone(samples, 20, { seed: 42, runs: 1000 });
    expect(whenDone(samples, 20, { seed: 42, runs: 1000 })).toEqual(a);
    expect(whenDone(samples, 20, { seed: 43, runs: 1000 })).not.toEqual(a);
  });

  it("counts the days with nothing finished", () => {
    // Three quiet days for every day with 4 done: on average 4 days per 4 tasks, not 1.
    const days = whenDone([0, 0, 0, 4], 4, { seed: 5, runs: 5000 });
    const mean = days.reduce((a, b) => a + b, 0) / days.length;
    expect(mean).toBeGreaterThan(3.6);
    expect(mean).toBeLessThan(4.4);
    expect(Math.max(...days)).toBeGreaterThan(8); // some runs are unlucky for long
  });

  it("more confidence means more days, and fewer tasks promised", () => {
    const samples = [0, 1, 1, 2, 4];
    const days = whenDone(samples, 30, { seed: 1, runs: 3000 });
    const d = [50, 85, 95].map((p) => daysWithin(days, p)!) as [
      number,
      number,
      number,
    ];
    expect(d[0]).toBeLessThanOrEqual(d[1]);
    expect(d[1]).toBeLessThanOrEqual(d[2]);
    const done = howMany(samples, 20, { seed: 1, runs: 3000 });
    const m = [50, 85, 95].map((p) => atLeast(done, p)) as [
      number,
      number,
      number,
    ];
    expect(m[0]).toBeGreaterThanOrEqual(m[1]);
    expect(m[1]).toBeGreaterThanOrEqual(m[2]);
  });

  it("a run that does not finish within the horizon is Infinity, and the percentile says null", () => {
    // One task in a hundred days: 1000 tasks cannot be done within 1000 days.
    const samples = [...Array(99).fill(0), 1];
    const days = whenDone(samples, 1000, { seed: 2, runs: 50 });
    expect(days.every((d) => d === Infinity)).toBe(true);
    expect(daysWithin(days, 50)).toBeNull();
    expect(HORIZON_DAYS).toBe(1000);
  });

  it("nothing to draw from or nothing finished gives no finite answer", () => {
    expect(
      whenDone([0, 0], 3, { seed: 1, runs: 10 }).every((d) => d === Infinity),
    ).toBe(true);
    expect(howMany([0, 0], 5, { seed: 1, runs: 10 })).toEqual(
      Array(10).fill(0),
    );
  });
});

describe("atLeast", () => {
  it("is the count reached by at least p% of the runs", () => {
    const runs = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(atLeast(runs, 95)).toBe(6); // 95 of the 100 runs reached 6 or more
    expect(atLeast(runs, 85)).toBe(16);
    expect(atLeast(runs, 50)).toBe(51);
  });
});

describe("histogram", () => {
  it("one bin per value when there are few", () => {
    expect(histogram([3, 3, 4, 6])).toEqual([
      { from: 3, to: 3, count: 2 },
      { from: 4, to: 4, count: 1 },
      { from: 5, to: 5, count: 0 },
      { from: 6, to: 6, count: 1 },
    ]);
  });

  it("equal widths when there are many, covering every value once", () => {
    const values = Array.from({ length: 100 }, (_, i) => i); // 0..99
    const bins = histogram(values, 10);
    expect(bins).toHaveLength(10);
    expect(bins[0]).toEqual({ from: 0, to: 9, count: 10 });
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(100);
  });

  it("leaves out runs that gave up, and is empty without finite values", () => {
    expect(histogram([2, Infinity])).toEqual([{ from: 2, to: 2, count: 1 }]);
    expect(histogram([Infinity])).toEqual([]);
    expect(histogram([])).toEqual([]);
  });
});

describe("working days", () => {
  it("only the Monday-to-Friday days of the window are drawn from", () => {
    const daily = [
      { date: "2026-10-09", count: 4 }, // Friday
      { date: "2026-10-10", count: 9 }, // Saturday
      { date: "2026-10-11", count: 9 }, // Sunday
      { date: "2026-10-12", count: 2 }, // Monday
    ];
    expect(samplesOf(daily, false)).toEqual([4, 9, 9, 2]);
    expect(samplesOf(daily, true)).toEqual([4, 2]);
  });

  it("simulated days skip weekends, starting tomorrow", () => {
    // Today Friday: tomorrow Saturday is day 1 on the calendar, but Monday is day 1 of working days.
    expect(
      new Date(dateOfDay(FRIDAY, 1, false)).toISOString().slice(0, 10),
    ).toBe("2026-10-10");
    expect(
      new Date(dateOfDay(FRIDAY, 1, true)).toISOString().slice(0, 10),
    ).toBe("2026-10-12");
    expect(
      new Date(dateOfDay(FRIDAY, 5, true)).toISOString().slice(0, 10),
    ).toBe("2026-10-16");
    expect(
      new Date(dateOfDay(FRIDAY, 6, true)).toISOString().slice(0, 10),
    ).toBe("2026-10-19");
    expect(
      new Date(dateOfDay(FRIDAY, 6, false)).toISOString().slice(0, 10),
    ).toBe("2026-10-15");
  });

  it("counts the days up to a target date, both ends included", () => {
    expect(daysUntil(FRIDAY, utc("2026-10-13"), false)).toBe(4); // Sat, Sun, Mon, Tue
    expect(daysUntil(FRIDAY, utc("2026-10-13"), true)).toBe(2); // Mon, Tue
    expect(daysUntil(FRIDAY, utc("2026-10-11"), true)).toBe(0); // only the weekend
    expect(daysUntil(FRIDAY, FRIDAY, false)).toBe(0); // not in the future
  });
});
