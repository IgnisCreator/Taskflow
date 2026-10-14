import { describe, expect, it } from "vitest";
import { MAX_ITEMS, MAX_SEED } from "../../src/lib/forecast";
import { DAY_MS } from "../../src/lib/metrics";
import {
  parseForecastPageQuery,
  parseForecastQuery,
} from "../../src/lib/validations/forecast";

const NOW = Date.parse("2026-10-12T15:00:00Z");
const TODAY = Date.parse("2026-10-12T00:00:00Z");

describe("parseForecastQuery", () => {
  it("defaults: the last 90 days, all days, seed 1, nothing asked yet", () => {
    expect(parseForecastQuery({}, NOW)).toEqual({
      from: TODAY - 89 * DAY_MS,
      to: TODAY,
      items: undefined,
      date: undefined,
      workdaysOnly: false,
      seed: 1,
    });
  });

  it("reads every parameter", () => {
    const q = parseForecastQuery(
      {
        from: "2026-09-01",
        to: "2026-10-01",
        items: "25",
        workdays: "1",
        seed: "77",
      },
      NOW,
    );
    expect(q).toMatchObject({ items: 25, workdaysOnly: true, seed: 77 });
    expect(q.from).toBe(Date.parse("2026-09-01T00:00:00Z"));
    const byDate = parseForecastQuery({ date: "2026-11-30" }, NOW);
    expect(byDate.date).toBe(Date.parse("2026-11-30T00:00:00Z"));
  });

  it.each([
    [{ items: "0" }, "at least 1"],
    [{ items: String(MAX_ITEMS + 1) }, "at most"],
    [{ items: "2.5" }, "whole number"],
    [{ items: "many" }, "items"],
    [{ seed: "-1" }, "negative"],
    [{ seed: String(MAX_SEED + 1) }, "at most"],
    [{ seed: "1.5" }, "whole number"],
    [{ workdays: "yes" }, "workdays"],
    [{ date: "2026-13-01" }, "real date"],
    [{ date: "2026-10-12" }, "after today"],
    [{ date: "2026-10-01" }, "after today"],
    [{ date: "2027-10-14" }, "at most 366"],
    [{ items: "5", date: "2026-11-01" }, "either"],
    [{ from: "2026-10-10", to: "2026-10-01" }, "before it starts"],
    [{ from: "2024-01-01", to: "2026-10-01" }, "at most"],
    [{ to: "2026-10-13" }, "future"],
    [{ bogus: "1" }, "bogus"],
  ])("refuses %j with a clear message", (params, text) => {
    expect(() => parseForecastQuery(params, NOW)).toThrow(text);
  });

  it("accepts the edges: a date a year ahead, the biggest values", () => {
    const edge = new Date(TODAY + 366 * DAY_MS).toISOString().slice(0, 10);
    expect(() => parseForecastQuery({ date: edge }, NOW)).not.toThrow();
    expect(() =>
      parseForecastQuery(
        { items: String(MAX_ITEMS), seed: String(MAX_SEED) },
        NOW,
      ),
    ).not.toThrow();
    expect(() =>
      parseForecastQuery(
        { date: new Date(TODAY + DAY_MS).toISOString().slice(0, 10) },
        NOW,
      ),
    ).not.toThrow();
  });
});

describe("parseForecastPageQuery", () => {
  it("treats empty form fields as not set", () => {
    const { query, error } = parseForecastPageQuery(
      { items: "", date: "", from: "", to: "", seed: "", workdays: "" },
      NOW,
    );
    expect(error).toBeNull();
    expect(query.seed).toBe(1);
    expect(query.to).toBe(TODAY);
  });

  it("goes back to the 90-day default with a message when the query is invalid", () => {
    const { query, error } = parseForecastPageQuery(
      { from: "2026-13-01", items: "5000", workdays: "1" },
      NOW,
    );
    expect(error).toContain("real date");
    expect(query.from).toBe(TODAY - 89 * DAY_MS);
    expect(query.workdaysOnly).toBe(false);
    expect(query.items).toBeUndefined();
  });
});
