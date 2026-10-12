"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { dropTarget, moveTask } from "@/lib/board-order";
import { formatDueDate } from "@/lib/dates";
import {
  TaskDialog,
  type CatalogView,
  type ColumnView,
  type DialogState,
  type MemberView,
  type TaskView,
} from "@/components/task-dialog";

const POLL_MS = 10_000;
// If the refresh after a move never arrives, drop the optimistic state after this long.
const SETTLE_MS = 8_000;
const columnDropId = (columnId: string) => `col:${columnId}`;

type Notice = { kind: "info" | "error"; text: string };

/**
 * Four fixed columns. Cards can be dragged (mouse, touch or keyboard) or moved from the task dialog.
 *
 * A move shows at once (optimistic), is sent with the board version, and on any failure (conflict,
 * server error, lost connection) the optimistic order is dropped and the board is reloaded. Only one
 * move is in flight at a time. While the tab is visible the board checks the version every 10 s and
 * on focus, and reloads when someone else changed it.
 */
export function Board({
  listId,
  boardVersion,
  canWrite,
  columns,
  members,
  catalog,
  viewerId,
  canModerate,
  filtered,
}: {
  listId: string;
  boardVersion: number;
  canWrite: boolean;
  columns: ColumnView[];
  members: MemberView[];
  catalog: CatalogView;
  viewerId: string;
  canModerate: boolean;
  /** A filter is active: the board shows part of the tasks, so dragging is off. */
  filtered: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The optimistic order only counts while the server data it was built from is still the current
  // one; as soon as a refresh brings new `columns`, it is ignored, so no effect is needed to clear it.
  const [local, setLocal] = useState<{
    base: ColumnView[];
    columns: ColumnView[];
  } | null>(null);

  const busy = local !== null && local.base === columns;
  const shown = busy ? local.columns : columns;

  const versionRef = useRef(boardVersion);
  const busyRef = useRef(busy);
  useEffect(() => {
    versionRef.current = boardVersion;
    busyRef.current = busy;
  });

  useEffect(() => {
    async function check() {
      if (document.visibilityState !== "visible" || busyRef.current) return;
      try {
        const res = await fetch(`/api/lists/${listId}/version`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const latest = (await res.json()).boardVersion;
        if (latest !== versionRef.current) {
          setNotice({
            kind: "info",
            text: "The board was updated by someone else.",
          });
          router.refresh();
        }
      } catch {
        // Offline: try again on the next tick.
      }
    }
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [listId, router]);

  useEffect(() => {
    if (notice?.kind !== "info") return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function requestMove(
    taskId: string,
    columnId: string,
    toIndex: number,
  ) {
    if (busy) return;
    // Filtered: the visible order is partial, so there is nothing to show ahead of the server.
    const next = filtered ? shown : moveTask(shown, taskId, columnId, toIndex);
    if (!next || (!filtered && next === shown)) return;

    const mine = { base: columns, columns: next };
    setLocal(mine);
    setNotice(null);
    window.setTimeout(
      () => setLocal((cur) => (cur === mine ? null : cur)),
      SETTLE_MS,
    );

    const result = await api(
      "PATCH",
      `/api/lists/${listId}/tasks/${taskId}/move`,
      { columnId, toIndex, expectedBoardVersion: boardVersion },
    );
    if (!result.ok) {
      setLocal(null); // back to what the server last said
      setNotice({ kind: "error", text: result.message });
      // No answer at all: refreshing would fail and make Next reload the whole page offline.
      if (result.network) return;
    }
    router.refresh(); // the real order and version
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const allTasks = shown.flatMap((column) => column.tasks);
  const titleOf = (id: string | number) =>
    allTasks.find((task) => task.id === id)?.title ?? "task";
  const labelOf = (id: string | number) => {
    const column = shown.find((c) => columnDropId(c.id) === id);
    return column ? `column ${column.name}` : titleOf(id);
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const target = dropTarget(
      shown,
      String(active.id),
      String(over.id),
      columnDropId,
    );
    if (target)
      void requestMove(String(active.id), target.columnId, target.toIndex);
  }

  const active = allTasks.find((task) => task.id === activeId);

  return (
    <>
      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "error" : "notice"}
        >
          {notice.text}
        </p>
      )}
      <DndContext
        id="board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `${titleOf(active.id)} is over ${labelOf(over.id)}.`
                : `${titleOf(active.id)} is not over a drop area.`,
            onDragEnd: ({ active, over }) =>
              over
                ? `${titleOf(active.id)} was dropped on ${labelOf(over.id)}.`
                : `${titleOf(active.id)} was dropped.`,
            onDragCancel: ({ active }) =>
              `Moving ${titleOf(active.id)} was cancelled.`,
          },
        }}
      >
        {filtered && shown.every((column) => column.tasks.length === 0) && (
          <p className="notice">No tasks match these filters.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              members={members}
              canWrite={canWrite}
              busy={busy}
              filtered={filtered}
              onOpen={(task) =>
                setDialog({ mode: "edit", task, version: boardVersion })
              }
              onAdd={() =>
                setDialog({
                  mode: "create",
                  columnId: column.id,
                  columnName: column.name,
                  draftId: crypto.randomUUID(),
                  version: boardVersion,
                })
              }
            />
          ))}
        </div>
        <DragOverlay>
          {active && <CardBody task={active} members={members} />}
        </DragOverlay>
      </DndContext>
      <TaskDialog
        listId={listId}
        catalog={catalog}
        viewerId={viewerId}
        canModerate={canModerate}
        columns={shown}
        members={members}
        canWrite={canWrite}
        busy={busy}
        filtered={filtered}
        state={dialog}
        onMove={(taskId, columnId, toIndex) =>
          void requestMove(taskId, columnId, toIndex)
        }
        onClose={() => setDialog(null)}
      />
    </>
  );
}

function BoardColumn({
  column,
  members,
  canWrite,
  busy,
  filtered,
  onOpen,
  onAdd,
}: {
  column: ColumnView;
  members: MemberView[];
  canWrite: boolean;
  busy: boolean;
  filtered: boolean;
  onOpen: (task: TaskView) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(column.id) });
  // Over the limit counts every task of the stage, also those a filter hides.
  const count = filtered ? column.total : column.tasks.length;
  const over = column.wipLimit !== null && count > column.wipLimit;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`col-${column.id}`}
      className={`space-y-3 rounded-lg border p-2 ${isOver ? "border-primary" : "border-transparent"}`}
    >
      <h2
        id={`col-${column.id}`}
        className="flex items-center justify-between text-sm font-semibold"
      >
        {column.name}
        <span className="badge">
          {filtered
            ? `${column.tasks.length} of ${column.total}`
            : column.tasks.length}
          {column.wipLimit !== null && ` · limit ${column.wipLimit}`}
        </span>
      </h2>
      {column.policy && <p className="text-xs text-muted">{column.policy}</p>}
      {over && (
        <p className="error text-xs">
          Over the WIP limit ({count} of {column.wipLimit}). Too much work
          started at once slows everything down: finish something before pulling
          more in.
        </p>
      )}
      <ul className="space-y-2">
        {column.tasks.map((task) => (
          <li key={task.id}>
            <TaskCard
              task={task}
              members={members}
              disabled={!canWrite || busy || filtered}
              onOpen={() => onOpen(task)}
            />
          </li>
        ))}
      </ul>
      {column.tasks.length === 0 && (
        <p className="text-sm text-muted">No tasks</p>
      )}
      {canWrite && (
        <button type="button" className="btn-secondary w-full" onClick={onAdd}>
          Add task
        </button>
      )}
    </section>
  );
}

function TaskCard({
  task,
  members,
  disabled,
  onOpen,
}: {
  task: TaskView;
  members: MemberView[];
  disabled: boolean;
  onOpen: () => void;
}) {
  const drag = useDraggable({ id: task.id, disabled });
  const drop = useDroppable({ id: task.id });
  return (
    <button
      type="button"
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.listeners}
      {...drag.attributes}
      className={`card block w-full space-y-2 p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link ${drag.isDragging ? "opacity-40" : ""}`}
      onClick={onOpen}
    >
      <CardContent task={task} members={members} />
    </button>
  );
}

function CardBody({
  task,
  members,
}: {
  task: TaskView;
  members: MemberView[];
}) {
  return (
    <div className="card w-full space-y-2 p-3 shadow-lg">
      <CardContent task={task} members={members} />
    </div>
  );
}

function CardContent({
  task,
  members,
}: {
  task: TaskView;
  members: MemberView[];
}) {
  const assignees = members
    .filter((member) => task.assigneeIds.includes(member.userId))
    .map((member) => member.name);
  return (
    <>
      <span className="block text-sm font-medium">{task.title}</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span
          className={`badge ${task.priority === "HIGH" ? "text-danger-text" : ""}`}
        >
          {task.priority.toLowerCase()}
        </span>
        {task.blockedReason !== null && (
          <span className="badge text-danger-text" title={task.blockedReason}>
            blocked
          </span>
        )}
        {task.type && <span className="badge">{task.type.name}</span>}
        {task.labels.map((label) => (
          <span key={label.id} className="badge">
            {label.name}
          </span>
        ))}
        {task.dueDate && <span>Due {formatDueDate(task.dueDate)}</span>}
        {task.subtasks.total > 0 && (
          <span>
            {task.subtasks.done}/{task.subtasks.total} done
          </span>
        )}
        {assignees.length > 0 && <span>{assignees.join(", ")}</span>}
      </span>
    </>
  );
}
