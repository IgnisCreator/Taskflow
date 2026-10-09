import { describe, expect, it } from "vitest";
import { formatDueDate, isCalendarDate } from "../../src/lib/dates";

describe("calendar dates", () => {
  it.each(["2026-03-01", "2028-02-29", "2026-12-31"])("accepts %s", (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-3-1",
    "01/03/2026",
    "",
    "2026-03-01T00:00:00Z",
  ])("rejects %s", (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it("formats without using the local time zone", () => {
    expect(formatDueDate("2026-03-01")).toBe("Mar 1, 2026");
    expect(formatDueDate("2026-12-31")).toBe("Dec 31, 2026");
  });
});
