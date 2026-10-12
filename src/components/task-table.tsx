"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { formatDueDate } from "@/lib/dates";
import { sortRows, type Dir, type Sort } from "@/lib/list-view";
import { messages } from "@/lib/messages";
import { useVersionPolling } from "@/lib/use-version-polling";
import {
  TaskDialog,
  type CatalogView,
  type ColumnView,
  type DialogState,
  type MemberView,
  type TaskView,
} from "@/components/task-dialog";

const t = messages.table;
const PRIORITY_LABEL = { LOW: "low", MEDIUM: "medium", HIGH: "high" } as const;

type Row = TaskView & {
  stage: string;
  stageIndex: number;
  position: number;
};

/**
 * The tasks of a list as a table: every task on a row, sortable by the columns that have an order
 * (title, stage, priority, type, due date). Opening a row shows the same dialog as the board, and
 * the page keeps itself current in the same way. Dragging does not exist here; moving is done
 * from the dialog.
 */
export function TaskTable({
  listId,
  boardVersion,
  canWrite,
  columns,
  members,
  catalog,
  viewerId,
  canModerate,
  filtered,
  sort,
  dir,
  query,
}: {
  listId: string;
  boardVersion: number;
  canWrite: boolean;
  columns: ColumnView[];
  members: MemberView[];
  catalog: CatalogView;
  viewerId: string;
  canModerate: boolean;
  filtered: boolean;
  sort: Sort;
  dir: Dir;
  /** The filters and the view in the URL, without the sort: the sort links add their own. */
  query: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useVersionPolling({
    listId,
    boardVersion,
    paused: false,
    onChange: () => setNotice(messages.board.updatedByOthers),
  });
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const rows: Row[] = columns.flatMap((column, stageIndex) =>
    column.tasks.map((task, position) => ({
      ...task,
      stage: column.name,
      stageIndex,
      position,
    })),
  );
  const sorted = sortRows(
    rows.map((row) => ({ ...row, typeName: row.type?.name ?? null })),
    sort,
    dir,
  );
  const people = (ids: string[]) =>
    members.filter((m) => ids.includes(m.userId)).map((m) => m.name);

  async function move(taskId: string, columnId: string, toIndex: number) {
    setError(null);
    const result = await api(
      "PATCH",
      `/api/lists/${listId}/tasks/${taskId}/move`,
      { columnId, toIndex, expectedBoardVersion: boardVersion },
    );
    if (!result.ok) setError(result.message);
    if (result.ok || !result.network) router.refresh();
  }

  /** A header that sorts: a second click on the same column reverses it. */
  const header = (id: Sort, label: string) => {
    const active = sort === id;
    const next = active && dir === "asc" ? "desc" : "asc";
    return (
      <th
        scope="col"
        aria-sort={
          active ? (dir === "asc" ? "ascending" : "descending") : undefined
        }
        className="px-3 py-2 text-left font-medium"
      >
        <Link
          href={`?${query}${query ? "&" : ""}sort=${id}&dir=${next}`}
          className="link"
        >
          {label}
          {active && (
            <span aria-hidden="true">{dir === "asc" ? " ▲" : " ▼"}</span>
          )}
        </Link>
      </th>
    );
  };

  const first = columns[0];
  return (
    <>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {canWrite && first && (
        <p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setDialog({
                mode: "create",
                columnId: first.id,
                columnName: first.name,
                draftId: crypto.randomUUID(),
                version: boardVersion,
              })
            }
          >
            {t.newTask}
          </button>
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="card text-muted">
          {filtered ? messages.board.noMatches : t.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">
              {t.caption}. {t.sortedBy(sort, dir)}
            </caption>
            <thead className="border-b border-line bg-subtle">
              <tr>
                {header("title", t.title)}
                {header("stage", t.stage)}
                {header("priority", t.priority)}
                {header("type", t.type)}
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t.assignees}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t.labels}
                </th>
                {header("due", t.due)}
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t.status}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {sorted.map((task) => (
                <tr key={task.id}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <button
                      type="button"
                      className="link text-left"
                      onClick={() =>
                        setDialog({ mode: "edit", task, version: boardVersion })
                      }
                    >
                      {task.title}
                    </button>
                  </th>
                  <td className="px-3 py-2">{task.stage}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`badge ${task.priority === "HIGH" ? "text-danger-text" : ""}`}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  </td>
                  <td className="px-3 py-2">{task.type?.name ?? ""}</td>
                  <td className="px-3 py-2">
                    {people(task.assigneeIds).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {task.labels.map((label) => (
                        <span key={label.id} className="badge">
                          {label.name}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {task.dueDate ? formatDueDate(task.dueDate) : ""}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {task.blockedReason !== null && (
                        <span
                          className="badge text-danger-text"
                          title={task.blockedReason}
                        >
                          blocked
                        </span>
                      )}
                      {task.subtasks.total > 0 && (
                        <span className="text-muted">
                          {task.subtasks.done}/{task.subtasks.total} done
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TaskDialog
        listId={listId}
        catalog={catalog}
        viewerId={viewerId}
        canModerate={canModerate}
        columns={columns}
        members={members}
        canWrite={canWrite}
        busy={false}
        filtered={filtered}
        state={dialog}
        onMove={(taskId, columnId, toIndex) =>
          void move(taskId, columnId, toIndex)
        }
        onClose={() => setDialog(null)}
      />
    </>
  );
}
