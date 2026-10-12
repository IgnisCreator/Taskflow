"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { TaskDetails } from "@/components/task-details";

export type TaskView = {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  assigneeIds: string[];
  type: { id: string; name: string } | null;
  labels: { id: string; name: string }[];
  /** Why the task is blocked, or null. */
  blockedReason: string | null;
  subtasks: { total: number; done: number };
};

/** The workspace task types and labels, for the pickers. */
export type CatalogView = {
  types: { id: string; name: string }[];
  labels: { id: string; name: string }[];
};

/** `total` counts every task of the column, `tasks` only those that pass the active filter. */
export type ColumnView = {
  id: string;
  name: string;
  total: number;
  /** Advisory limit of tasks in the stage (an alert, never a block), and what it takes to enter or leave it. */
  wipLimit: number | null;
  policy: string | null;
  tasks: TaskView[];
};
export type MemberView = { userId: string; name: string };

/** `version` is the board version the user was looking at when the dialog opened. */
export type DialogState =
  | {
      mode: "create";
      columnId: string;
      columnName: string;
      draftId: string;
      version: number;
    }
  | { mode: "edit"; task: TaskView; version: number };

/**
 * Create / edit / move / read a task in a native <dialog> (focus trap and Esc come from the platform).
 *
 * Saves use the version from when the dialog opened, not the latest one: if the board changed while
 * the form was open, the server answers 409, the typed text is kept, the dialog adopts the current
 * version, and a second save repeats the user's intent knowingly.
 */
export function TaskDialog({
  listId,
  columns,
  members,
  catalog,
  viewerId,
  canModerate,
  canWrite,
  busy,
  filtered,
  state,
  onMove,
  onClose,
}: {
  listId: string;
  columns: ColumnView[];
  members: MemberView[];
  catalog: CatalogView;
  /** For comments: who is reading, and whether they can delete other people comments. */
  viewerId: string;
  canModerate: boolean;
  canWrite: boolean;
  busy: boolean;
  filtered: boolean;
  state: DialogState | null;
  onMove: (taskId: string, columnId: string, toIndex: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [adoptedVersion, setAdoptedVersion] = useState<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state && !dialog.open) {
      setError(null);
      setAdoptedVersion(null);
      dialog.showModal();
    }
    if (!state && dialog.open) dialog.close();
  }, [state]);

  const task = state?.mode === "edit" ? state.task : null;
  const readOnly = !canWrite;
  const version = adoptedVersion ?? state?.version ?? 0;

  function fail(result: Awaited<ReturnType<typeof api>> & { ok: false }) {
    if (result.conflict) {
      if (result.currentVersion !== undefined)
        setAdoptedVersion(result.currentVersion);
      setError(
        "The board changed while this was open. Your changes are still here; check the board and save again.",
      );
    } else {
      setError(result.message);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    const form = new FormData(event.currentTarget);
    const fields = {
      title: form.get("title"),
      description: form.get("description"),
      priority: form.get("priority"),
      typeId: form.get("typeId") || null,
      assigneeIds: form.getAll("assigneeIds"),
      labelIds: form.getAll("labelIds"),
      dueDate: form.get("dueDate") || null,
      expectedBoardVersion: version,
    };
    // Blocking exists for tasks that already exist; the reason is required while it is on.
    const blocked =
      state.mode === "edit"
        ? {
            blockedReason: form.get("blocked")
              ? String(form.get("blockedReason")).trim()
              : null,
          }
        : {};
    setPending(true);
    setError(null);
    const result =
      state.mode === "create"
        ? await api("POST", `/api/lists/${listId}/tasks`, {
            ...fields,
            id: state.draftId, // kept while the dialog is open, so a retry cannot duplicate
            columnId: state.columnId,
          })
        : await api("PATCH", `/api/lists/${listId}/tasks/${state.task.id}`, {
            ...fields,
            ...blocked,
          });
    setPending(false);
    if (result.ok || !result.network) router.refresh(); // not when the server was unreachable
    if (result.ok) onClose();
    else fail(result);
  }

  async function onDelete() {
    if (!task || !window.confirm(`Delete “${task.title}”?`)) return;
    setPending(true);
    setError(null);
    const result = await api(
      "DELETE",
      `/api/lists/${listId}/tasks/${task.id}`,
      { expectedBoardVersion: version },
    );
    setPending(false);
    if (result.ok || !result.network) router.refresh(); // not when the server was unreachable
    if (result.ok) onClose();
    else fail(result);
  }

  const heading =
    state?.mode === "create"
      ? `New task in ${state.columnName}`
      : readOnly
        ? "Task"
        : "Edit task";

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="task-dialog-title"
      onClose={onClose}
    >
      {state && (
        <form
          key={state.mode === "edit" ? state.task.id : state.draftId}
          onSubmit={onSubmit}
          className="space-y-4"
        >
          <h2 id="task-dialog-title" className="text-lg font-semibold">
            {heading}
          </h2>
          <label className="field">
            Title
            <input
              name="title"
              defaultValue={task?.title ?? ""}
              required
              maxLength={160}
              readOnly={readOnly}
              className="input"
            />
          </label>
          <label className="field">
            Description
            <textarea
              name="description"
              defaultValue={task?.description ?? ""}
              maxLength={5000}
              rows={3}
              readOnly={readOnly}
              className="input"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              Priority
              <select
                name="priority"
                defaultValue={task?.priority ?? "MEDIUM"}
                disabled={readOnly}
                className="input"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="field">
              Type
              <select
                name="typeId"
                defaultValue={task?.type?.id ?? ""}
                disabled={readOnly}
                className="input"
              >
                <option value="">No type</option>
                {catalog.types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Choices
            legend="Assignees"
            name="assigneeIds"
            options={members.map((m) => ({ id: m.userId, name: m.name }))}
            checked={task?.assigneeIds ?? []}
            disabled={readOnly}
            empty="Nobody can be assigned yet."
          />
          <Choices
            legend="Labels"
            name="labelIds"
            options={catalog.labels}
            checked={task?.labels.map((l) => l.id) ?? []}
            disabled={readOnly}
            empty="The workspace has no labels yet. An admin can add them in the workspace settings."
          />
          <label className="field">
            Due date
            <input
              type="date"
              name="dueDate"
              defaultValue={task?.dueDate ?? ""}
              readOnly={readOnly}
              className="input"
            />
          </label>
          {canWrite && task && (
            <fieldset className="space-y-2 border-t border-line pt-4">
              <legend className="font-medium">Blocked</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="blocked"
                  defaultChecked={task.blockedReason !== null}
                />
                This task is blocked
              </label>
              <label className="field">
                Reason (required while blocked)
                <input
                  name="blockedReason"
                  defaultValue={task.blockedReason ?? ""}
                  maxLength={300}
                  className="input"
                />
              </label>
            </fieldset>
          )}
          {canWrite && task && (
            <MoveControls
              task={task}
              columns={columns}
              filtered={filtered}
              disabled={busy || pending}
              onMove={(columnId, toIndex) => {
                onMove(task.id, columnId, toIndex);
                onClose();
              }}
            />
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <button type="submit" disabled={pending} className="btn">
                {state.mode === "create" ? "Create task" : "Save"}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              {canWrite ? "Cancel" : "Close"}
            </button>
            {canWrite && task && (
              <button
                type="button"
                disabled={pending}
                className="btn-danger ml-auto"
                onClick={onDelete}
              >
                Delete
              </button>
            )}
          </div>
        </form>
      )}
      {task && (
        <TaskDetails
          key={`details-${task.id}`}
          listId={listId}
          taskId={task.id}
          viewerId={viewerId}
          canWrite={canWrite}
          canModerate={canModerate}
        />
      )}
    </dialog>
  );
}

/** The keyboard- and screen-reader-friendly way to move a task: pick a column and a position. */
function MoveControls({
  task,
  columns,
  filtered,
  disabled,
  onMove,
}: {
  task: TaskView;
  columns: ColumnView[];
  /** With a filter the visible order is partial, so a position cannot be chosen: the task goes last. */
  filtered: boolean;
  disabled: boolean;
  onMove: (columnId: string, toIndex: number) => void;
}) {
  const current = columns.find((c) => c.id === task.columnId);
  const currentIndex = current?.tasks.findIndex((t) => t.id === task.id) ?? 0;
  const [columnId, setColumnId] = useState(task.columnId);
  const [toIndex, setToIndex] = useState(currentIndex);

  const target = columns.find((c) => c.id === columnId);
  const others = filtered
    ? (target?.total ?? 0) - (columnId === task.columnId ? 1 : 0)
    : (target?.tasks ?? []).filter((t) => t.id !== task.id).length;
  const unchanged =
    !filtered && columnId === task.columnId && toIndex === currentIndex;

  return (
    <fieldset className="space-y-3 border-t border-line pt-4">
      <legend className="font-medium">Move task</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Column
          <select
            value={columnId}
            className="input"
            onChange={(event) => {
              setColumnId(event.target.value);
              // Moving to another column starts at the end; staying keeps the position.
              setToIndex(
                event.target.value === task.columnId
                  ? currentIndex
                  : (columns.find((c) => c.id === event.target.value)?.tasks
                      .length ?? 0),
              );
            }}
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
        </label>
        {!filtered && (
          <label className="field">
            Position
            <select
              value={toIndex}
              className="input"
              onChange={(event) => setToIndex(Number(event.target.value))}
            >
              {Array.from({ length: others + 1 }, (_, index) => (
                <option key={index} value={index}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {filtered && (
        <p className="text-sm text-muted">
          Filters are on: the task goes to the end of the column.
        </p>
      )}
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled || unchanged}
        onClick={() => onMove(columnId, filtered ? others : toIndex)}
      >
        {filtered ? "Move to end" : "Move"}
      </button>
    </fieldset>
  );
}

/** A group of checkboxes sharing a name: the form reads them with getAll. */
function Choices({
  legend,
  name,
  options,
  checked,
  disabled,
  empty,
}: {
  legend: string;
  name: string;
  options: { id: string; name: string }[];
  checked: string[];
  disabled: boolean;
  empty: string;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="field">{legend}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={name}
                value={option.id}
                defaultChecked={checked.includes(option.id)}
                disabled={disabled}
              />
              {option.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
