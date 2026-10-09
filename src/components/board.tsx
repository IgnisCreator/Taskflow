"use client";

import { useState } from "react";
import { formatDueDate } from "@/lib/dates";
import {
  TaskDialog,
  type DialogState,
  type MemberView,
  type TaskView,
} from "@/components/task-dialog";

export type ColumnView = { id: string; name: string; tasks: TaskView[] };

const PRIORITY_LABEL = { LOW: "low", MEDIUM: "medium", HIGH: "high" } as const;

/** Four fixed columns; tasks open in a dialog. Moving tasks between columns arrives in TF-06. */
export function Board({
  projectId,
  boardVersion,
  canWrite,
  columns,
  members,
}: {
  projectId: string;
  boardVersion: number;
  canWrite: boolean;
  columns: ColumnView[];
  members: MemberView[];
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const nameOf = (id: string | null) =>
    members.find((member) => member.userId === id)?.name;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((column) => (
          <section
            key={column.id}
            aria-labelledby={`col-${column.id}`}
            className="space-y-3"
          >
            <h2
              id={`col-${column.id}`}
              className="flex items-center justify-between text-sm font-semibold"
            >
              {column.name}
              <span className="badge">{column.tasks.length}</span>
            </h2>
            <ul className="space-y-2">
              {column.tasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    className="card block w-full space-y-2 p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
                    onClick={() => setDialog({ mode: "edit", task })}
                  >
                    <span className="block text-sm font-medium">
                      {task.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span
                        className={`badge ${task.priority === "HIGH" ? "text-danger-text" : ""}`}
                      >
                        {PRIORITY_LABEL[task.priority]}
                      </span>
                      {task.dueDate && (
                        <span>Due {formatDueDate(task.dueDate)}</span>
                      )}
                      {nameOf(task.assigneeId) && (
                        <span>{nameOf(task.assigneeId)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {column.tasks.length === 0 && (
              <p className="text-sm text-muted">No tasks</p>
            )}
            {canWrite && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() =>
                  setDialog({
                    mode: "create",
                    columnId: column.id,
                    columnName: column.name,
                    draftId: crypto.randomUUID(),
                  })
                }
              >
                Add task
              </button>
            )}
          </section>
        ))}
      </div>
      <TaskDialog
        projectId={projectId}
        boardVersion={boardVersion}
        members={members}
        canWrite={canWrite}
        state={dialog}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
