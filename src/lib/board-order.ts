// Pure model of moving a task on the board. The browser uses it for the optimistic update, and the
// tests use it as the reference the server's SQL reordering must agree with.
//
// `toIndex` is the final index of the task in the destination column, counted WITHOUT the task
// itself: it ranges from 0 (first) to the number of other tasks in that column (last).

type WithId = { id: string };
type Column<T extends WithId> = WithId & { tasks: T[] };

/**
 * Returns the columns after the move. Returns the same array (identity) when nothing changes, and
 * null when the task, the column or the index do not exist or are out of range.
 */
export function moveTask<T extends WithId, C extends Column<T>>(
  columns: C[],
  taskId: string,
  toColumnId: string,
  toIndex: number,
): C[] | null {
  const from = columns.find((c) => c.tasks.some((t) => t.id === taskId));
  const to = columns.find((c) => c.id === toColumnId);
  if (!from || !to || !Number.isInteger(toIndex) || toIndex < 0) return null;

  const task = from.tasks.find((t) => t.id === taskId)!;
  const others = to.tasks.filter((t) => t.id !== taskId);
  if (toIndex > others.length) return null;
  if (from === to && from.tasks.indexOf(task) === toIndex) return columns;

  const moved = "columnId" in task ? { ...task, columnId: toColumnId } : task;
  const placed = [...others.slice(0, toIndex), moved, ...others.slice(toIndex)];

  return columns.map((column) => {
    if (column === to) return { ...column, tasks: placed };
    if (column === from) {
      return { ...column, tasks: column.tasks.filter((t) => t.id !== taskId) };
    }
    return column;
  });
}

/**
 * Where a drop lands. `overId` is what the pointer ended on: a task (take its place, like an array
 * move) or a column (go to the end). Returns null when the drop is not on the board.
 */
export function dropTarget<T extends WithId, C extends Column<T>>(
  columns: C[],
  taskId: string,
  overId: string,
  columnDropId: (columnId: string) => string,
): { columnId: string; toIndex: number } | null {
  for (const column of columns) {
    if (overId === columnDropId(column.id)) {
      const others = column.tasks.filter((t) => t.id !== taskId);
      return { columnId: column.id, toIndex: others.length };
    }
    const index = column.tasks.findIndex((t) => t.id === overId);
    if (index !== -1) return { columnId: column.id, toIndex: index };
  }
  return null;
}
