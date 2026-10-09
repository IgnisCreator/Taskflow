"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";

export type TaskView = {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  assigneeId: string | null;
  dueDate: string | null;
};

export type MemberView = { userId: string; name: string };

export type DialogState =
  | { mode: "create"; columnId: string; columnName: string; draftId: string }
  | { mode: "edit"; task: TaskView };

/**
 * Create / edit / read a task in a native <dialog> (focus trap and Esc come from the platform).
 * `key` on the form resets the fields whenever another task is opened. The version is read from
 * props at submit time, so after a 409 the board refreshes and a second save repeats the intent.
 */
export function TaskDialog({
  projectId,
  boardVersion,
  members,
  canWrite,
  state,
  onClose,
}: {
  projectId: string;
  boardVersion: number;
  members: MemberView[];
  canWrite: boolean;
  state: DialogState | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state && !dialog.open) {
      setError(null);
      dialog.showModal();
    }
    if (!state && dialog.open) dialog.close();
  }, [state]);

  const task = state?.mode === "edit" ? state.task : null;
  const readOnly = !canWrite;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    const form = new FormData(event.currentTarget);
    const fields = {
      title: form.get("title"),
      description: form.get("description"),
      priority: form.get("priority"),
      assigneeId: form.get("assigneeId") || null,
      dueDate: form.get("dueDate") || null,
      expectedBoardVersion: boardVersion,
    };
    setPending(true);
    setError(null);
    const result =
      state.mode === "create"
        ? await api("POST", `/api/projects/${projectId}/tasks`, {
            ...fields,
            id: state.draftId, // kept while the dialog is open, so a retry cannot duplicate
            columnId: state.columnId,
          })
        : await api(
            "PATCH",
            `/api/projects/${projectId}/tasks/${state.task.id}`,
            fields,
          );
    setPending(false);
    router.refresh();
    if (result.ok) onClose();
    else setError(result.message);
  }

  async function onDelete() {
    if (!task || !window.confirm(`Delete “${task.title}”?`)) return;
    setPending(true);
    setError(null);
    const result = await api(
      "DELETE",
      `/api/projects/${projectId}/tasks/${task.id}`,
      { expectedBoardVersion: boardVersion },
    );
    setPending(false);
    router.refresh();
    if (result.ok) onClose();
    else setError(result.message);
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
              Assignee
              <select
                name="assigneeId"
                defaultValue={task?.assigneeId ?? ""}
                disabled={readOnly}
                className="input"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
    </dialog>
  );
}
