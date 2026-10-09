import { describe, expect, it } from "vitest";
import { dropTarget, moveTask } from "../../src/lib/board-order";

type T = { id: string; columnId: string };
const task = (id: string, columnId: string): T => ({ id, columnId });
const board = () => [
  { id: "c1", tasks: [task("a", "c1"), task("b", "c1"), task("c", "c1")] },
  { id: "c2", tasks: [task("d", "c2")] },
  { id: "c3", tasks: [] as T[] },
];
const ids = (columns: ReturnType<typeof board>) =>
  columns.map((c) => c.tasks.map((t) => t.id).join(""));

describe("moveTask", () => {
  it.each([
    ["first to last in its column", "a", "c1", 2, ["bca", "d", ""]],
    ["last to first in its column", "c", "c1", 0, ["cab", "d", ""]],
    ["to the middle in its column", "a", "c1", 1, ["bac", "d", ""]],
    ["to another column, first", "b", "c2", 0, ["ac", "bd", ""]],
    ["to another column, last", "b", "c2", 1, ["ac", "db", ""]],
    ["into an empty column", "b", "c3", 0, ["ac", "d", "b"]],
    ["out of a column that becomes empty", "d", "c3", 0, ["abc", "", "d"]],
  ])("%s", (_label, taskId, column, index, expected) => {
    expect(ids(moveTask(board(), taskId, column, index)!)).toEqual(expected);
  });

  it("updates the columnId of the moved task", () => {
    const moved = moveTask(board(), "b", "c3", 0)!;
    expect(moved[2]!.tasks[0]).toEqual({ id: "b", columnId: "c3" });
  });

  it("returns the same array when the task does not change place", () => {
    const columns = board();
    expect(moveTask(columns, "b", "c1", 1)).toBe(columns);
  });

  it.each([
    ["an index below zero", "a", "c1", -1],
    ["an index past the end", "a", "c1", 3], // same column: only 2 others, valid range is 0..2
    ["a fractional index", "a", "c1", 0.5],
    ["an unknown task", "zz", "c1", 0],
    ["an unknown column", "a", "zz", 0],
    ["an index past the end of another column", "a", "c2", 2],
  ])("rejects %s", (_label, taskId, column, index) => {
    expect(moveTask(board(), taskId, column, index)).toBeNull();
  });

  it("does not modify its input", () => {
    const columns = board();
    const snapshot = JSON.stringify(columns);
    moveTask(columns, "a", "c2", 0);
    expect(JSON.stringify(columns)).toBe(snapshot);
  });
});

describe("dropTarget", () => {
  const colId = (id: string) => `col:${id}`;

  it("takes the place of the task it is dropped on", () => {
    expect(dropTarget(board(), "a", "c", colId)).toEqual({
      columnId: "c1",
      toIndex: 2,
    });
    expect(dropTarget(board(), "b", "d", colId)).toEqual({
      columnId: "c2",
      toIndex: 0,
    });
  });

  it("goes to the end when dropped on a column", () => {
    expect(dropTarget(board(), "a", "col:c1", colId)).toEqual({
      columnId: "c1",
      toIndex: 2,
    });
    expect(dropTarget(board(), "a", "col:c3", colId)).toEqual({
      columnId: "c3",
      toIndex: 0,
    });
  });

  it("is null when the drop is not on the board", () => {
    expect(dropTarget(board(), "a", "nowhere", colId)).toBeNull();
  });
});
