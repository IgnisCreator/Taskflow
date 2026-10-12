import { describe, expect, it } from "vitest";
import { isFiltered, parseFilter } from "../../src/lib/validations/filters";
import { parseView, sortRows, type Row } from "../../src/lib/list-view";

const row = (title: string, extra: Partial<Row> = {}): Row => ({
  title,
  priority: "MEDIUM",
  dueDate: null,
  typeName: null,
  stageIndex: 0,
  position: 0,
  ...extra,
});
const titles = (rows: Row[]) => rows.map((r) => r.title);

describe("parseView", () => {
  it("falls back to the board, by stage, ascending", () => {
    expect(parseView({})).toEqual({ view: "board", sort: "stage", dir: "asc" });
    expect(parseView({ view: "nope", sort: "nope", dir: "sideways" })).toEqual({
      view: "board",
      sort: "stage",
      dir: "asc",
    });
    expect(parseView({ view: ["list", "board"], sort: ["due"] }).view).toBe(
      "board",
    );
  });

  it("reads a valid view, sort and direction", () => {
    expect(parseView({ view: "list", sort: "due", dir: "desc" })).toEqual({
      view: "list",
      sort: "due",
      dir: "desc",
    });
  });
});

describe("sortRows", () => {
  const rows = [
    row("c", {
      priority: "HIGH",
      dueDate: "2026-03-01",
      typeName: "Bug",
      stageIndex: 1,
      position: 0,
    }),
    row("A", {
      priority: "LOW",
      dueDate: "2026-01-01",
      typeName: "task",
      stageIndex: 0,
      position: 1,
    }),
    row("b", {
      priority: "MEDIUM",
      dueDate: null,
      typeName: null,
      stageIndex: 0,
      position: 0,
    }),
    row("d", {
      priority: "HIGH",
      dueDate: "2026-02-01",
      typeName: "Bug",
      stageIndex: 2,
      position: 0,
    }),
  ];

  it("by stage is board order, and reversed when descending", () => {
    expect(titles(sortRows(rows, "stage", "asc"))).toEqual([
      "b",
      "A",
      "c",
      "d",
    ]);
    expect(titles(sortRows(rows, "stage", "desc"))).toEqual([
      "d",
      "c",
      "A",
      "b",
    ]);
  });

  it("by title ignores case", () => {
    expect(titles(sortRows(rows, "title", "asc"))).toEqual([
      "A",
      "b",
      "c",
      "d",
    ]);
    expect(titles(sortRows(rows, "title", "desc"))).toEqual([
      "d",
      "c",
      "b",
      "A",
    ]);
  });

  it("by priority goes low to high, ties in board order", () => {
    expect(titles(sortRows(rows, "priority", "asc"))).toEqual([
      "A",
      "b",
      "c",
      "d",
    ]);
    expect(titles(sortRows(rows, "priority", "desc"))).toEqual([
      "c",
      "d",
      "b",
      "A",
    ]);
  });

  it("by due date puts tasks without one last, in both directions", () => {
    expect(titles(sortRows(rows, "due", "asc"))).toEqual(["A", "d", "c", "b"]);
    expect(titles(sortRows(rows, "due", "desc"))).toEqual(["c", "d", "A", "b"]);
  });

  it("by type puts tasks without a type last, in both directions, ignoring case", () => {
    expect(titles(sortRows(rows, "type", "asc"))).toEqual(["c", "d", "A", "b"]);
    expect(titles(sortRows(rows, "type", "desc"))).toEqual([
      "A",
      "c",
      "d",
      "b",
    ]);
  });

  it("does not change the input", () => {
    const before = titles(rows);
    sortRows(rows, "title", "desc");
    expect(titles(rows)).toEqual(before);
  });
});

describe("parseFilter with type, label and blocked", () => {
  it("keeps valid values and ignores the rest", () => {
    expect(
      parseFilter({ type: "t1", label: "l1", blocked: "yes" }),
    ).toMatchObject({
      type: "t1",
      label: "l1",
      blocked: "yes",
    });
    expect(parseFilter({ type: "none", blocked: "no" })).toMatchObject({
      type: "none",
      blocked: "no",
    });
    expect(parseFilter({ blocked: "maybe", label: "" })).toMatchObject({
      blocked: undefined,
      label: undefined,
    });
  });

  it("counts as filtered when any of them is set", () => {
    expect(isFiltered(parseFilter({}))).toBe(false);
    for (const key of ["type", "label", "blocked"]) {
      expect(
        isFiltered(parseFilter({ [key]: key === "blocked" ? "yes" : "x" })),
      ).toBe(true);
    }
  });
});

describe("sortRows ties", () => {
  // The input is NOT in board order, so only an explicit tie-break can put equal rows right.
  const scrambled = [
    row("same", { priority: "HIGH", stageIndex: 2, position: 0 }),
    row("same", { priority: "HIGH", stageIndex: 0, position: 1 }),
    row("same", { priority: "HIGH", stageIndex: 0, position: 0 }),
  ];
  const order = (rows: Row[]) => rows.map((r) => [r.stageIndex, r.position]);

  it.each(["title", "priority", "due", "type"] as const)(
    "by %s equal rows keep board order, whichever the direction",
    (sort) => {
      for (const dir of ["asc", "desc"] as const) {
        expect(order(sortRows(scrambled, sort, dir))).toEqual([
          [0, 0],
          [0, 1],
          [2, 0],
        ]);
      }
    },
  );
});
