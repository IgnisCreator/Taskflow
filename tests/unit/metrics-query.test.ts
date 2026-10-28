import { describe, expect, it } from "vitest";
import { DAY_MS } from "../../src/lib/metrics";
import { parseMetricsPageQuery } from "../../src/lib/validations/metrics";

const NOW = Date.parse("2026-10-12T15:00:00Z");
const TODAY = Date.parse("2026-10-12T00:00:00Z");

describe("parseMetricsPageQuery", () => {
  it("passes a good query through without a message", () => {
    const { query, error } = parseMetricsPageQuery(
      { from: "2026-10-01", to: "2026-10-10", type: "t1" },
      NOW,
    );
    expect(error).toBeNull();
    expect(query.from).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(query.type).toBe("t1");
  });

  it.each([
    [{ from: "2026-13-01" }, "real date"],
    [{ from: "2026-10-10", to: "2026-10-01" }, "before it starts"],
    [{ to: "2026-10-13" }, "future"],
    [{ from: "2024-01-01", to: "2026-10-01" }, "at most"],
    [{ bogus: "1" }, "bogus"],
  ])("falls back to the last 30 days with a message for %j", (params, text) => {
    const { query, error } = parseMetricsPageQuery(params, NOW);
    expect(error).toContain(text);
    expect(query.to).toBe(TODAY);
    expect(query.from).toBe(TODAY - 29 * DAY_MS);
    expect(query.type).toBeUndefined();
  });
});

describe("parseMetricsPageQuery with a submitted form", () => {
  it("treats empty fields as not set", () => {
    const { query, error } = parseMetricsPageQuery(
      { from: "", to: "", type: "", assignee: "" },
      NOW,
    );
    expect(error).toBeNull();
    expect(query.to).toBe(TODAY);
    expect(query.type).toBeUndefined();
    expect(query.assignee).toBeUndefined();
  });
});
