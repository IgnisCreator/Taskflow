// The two ways to look at a list (board and table) and how the table is sorted. Pure, so the page
// and the tests agree.

export const VIEWS = ["board", "list"] as const;
export type View = (typeof VIEWS)[number];

export const SORTS = ["stage", "title", "priority", "due", "type"] as const;
export type Sort = (typeof SORTS)[number];
export type Dir = "asc" | "desc";

/** The view and sort in the URL; anything unknown falls back to the board, by stage, ascending. */
export function parseView(
  params: Record<string, string | string[] | undefined>,
): { view: View; sort: Sort; dir: Dir } {
  const one = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const view = VIEWS.find((v) => v === one("view")) ?? "board";
  const sort = SORTS.find((s) => s === one("sort")) ?? "stage";
  return { view, sort, dir: one("dir") === "desc" ? "desc" : "asc" };
}

export type Row = {
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  typeName: string | null;
  /** Where it sits on the board: the index of its stage, then its position in it. */
  stageIndex: number;
  position: number;
};

const PRIORITY: Record<Row["priority"], number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};
const text = (a: string, b: string) =>
  a.localeCompare(b, "en", { sensitivity: "base" });

/**
 * A sorted copy of the rows. Ties fall back to board order, so the result is stable and
 * predictable. Tasks without a due date or a type go last in both directions: "no value" is
 * never the answer to "soonest first".
 */
export function sortRows<T extends Row>(rows: T[], sort: Sort, dir: Dir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const board = (a: T, b: T) =>
    a.stageIndex - b.stageIndex || a.position - b.position;
  const optional = (
    a: string | null,
    b: string | null,
    compare: (x: string, y: string) => number,
  ) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : sign * compare(a, b));
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "stage":
        return sign * board(a, b);
      case "title":
        return sign * text(a.title, b.title) || board(a, b);
      case "priority":
        return (
          sign * (PRIORITY[a.priority] - PRIORITY[b.priority]) || board(a, b)
        );
      case "due":
        return (
          optional(a.dueDate, b.dueDate, (x, y) =>
            x < y ? -1 : x > y ? 1 : 0,
          ) || board(a, b)
        );
      case "type":
        return optional(a.typeName, b.typeName, text) || board(a, b);
    }
  });
}
