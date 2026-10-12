import { describe, expect, it } from "vitest";
import {
  axis,
  bandPath,
  labelIndexes,
  linear,
  niceCeil,
  stack,
} from "../../src/lib/charts";

describe("niceCeil", () => {
  it.each([
    [0, 1],
    [-3, 1],
    [1, 1],
    [1.2, 2],
    [2, 2],
    [3, 5],
    [5, 5],
    [6, 10],
    [11, 20],
    [42, 50],
    [0.3, 0.5],
    [0.04, 0.05],
    [1000, 1000],
    [1001, 2000],
  ])("niceCeil(%d) is %d", (value, expected) => {
    expect(niceCeil(value)).toBeCloseTo(expected, 10);
  });
});

describe("axis", () => {
  it("has round ticks from 0 and a top that is a tick above the maximum", () => {
    expect(axis(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(axis(10)).toEqual({ max: 10, ticks: [0, 5, 10] }); // step niceCeil(2.5) = 5
    expect(axis(42)).toEqual({ max: 60, ticks: [0, 20, 40, 60] }); // step niceCeil(10.5) = 20
  });

  it("never has a top below one step, so an empty chart has a scale", () => {
    expect(axis(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(axis(0.2).max).toBeGreaterThanOrEqual(0.2);
  });

  it("always includes the maximum value under the top", () => {
    for (const value of [1, 2, 3, 9, 13, 99, 0.7, 4.4]) {
      const { max, ticks } = axis(value);
      expect(max).toBeGreaterThanOrEqual(value);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeCloseTo(max, 6);
    }
  });
});

describe("linear", () => {
  it("maps a domain onto a range, also upside down", () => {
    const x = linear(0, 10, 100, 200);
    expect([x(0), x(5), x(10)]).toEqual([100, 150, 200]);
    const y = linear(0, 8, 300, 20); // SVG y grows downwards
    expect([y(0), y(8)]).toEqual([300, 20]);
  });

  it("maps a flat domain to the start of the range instead of dividing by zero", () => {
    expect(linear(3, 3, 10, 50)(3)).toBe(10);
    expect(Number.isFinite(linear(3, 3, 10, 50)(7))).toBe(true);
  });
});

describe("stack", () => {
  it("piles series bottom to top and the last upper edge is the total", () => {
    const stacked = stack([
      { counts: [1, 2, 0] },
      { counts: [3, 0, 4] },
      { counts: [0, 1, 1] },
    ]);
    expect(stacked[0]).toEqual({ lower: [0, 0, 0], upper: [1, 2, 0] });
    expect(stacked[1]).toEqual({ lower: [1, 2, 0], upper: [4, 2, 4] });
    expect(stacked[2]).toEqual({ lower: [4, 2, 4], upper: [4, 3, 5] });
  });

  it("handles no series", () => {
    expect(stack([])).toEqual([]);
  });
});

describe("bandPath", () => {
  it("goes along the upper edge and back along the lower one, closed", () => {
    const y = linear(0, 10, 100, 0);
    expect(bandPath([0, 50], [0, 0], [10, 5], y)).toBe(
      "M0,0L50,50L50,100L0,100Z",
    );
  });

  it("is empty for no points", () => {
    expect(bandPath([], [], [], (v) => v)).toBe("");
  });
});

describe("labelIndexes", () => {
  it("includes the first and the last, spread in between, without repeats", () => {
    expect(labelIndexes(30, 4)).toEqual([0, 10, 19, 29]);
    expect(labelIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(labelIndexes(1, 4)).toEqual([0]);
    expect(labelIndexes(0, 4)).toEqual([]);
    const many = labelIndexes(14, 5);
    expect(new Set(many).size).toBe(many.length);
    expect(many[0]).toBe(0);
    expect(many[many.length - 1]).toBe(13);
  });
});
