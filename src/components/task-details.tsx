"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { describeEvent, type EventView } from "@/lib/events";

type Subtask = { id: string; title: string; done: boolean };
type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
};
type Detail = {
  subtasks: Subtask[];
  comments: Comment[];
  events: (EventView & { id: string; at: string })[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

/**
 * Checklist, comments and history of one task. They load when the dialog opens and change through
 * their own small calls, which do not move the board version (so they never cause a conflict).
 */
export function TaskDetails({
  listId,
  taskId,
  viewerId,
  canWrite,
  canModerate,
}: {
  listId: string;
  taskId: string;
  viewerId: string;
  canWrite: boolean;
  canModerate: boolean;
}) {
  const router = useRouter();
  const base = `/api/lists/${listId}/tasks/${taskId}`;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The current detail, or null when it could not be read. Only reads: state is set by the callers. */
  async function fetchDetail(): Promise<Detail | null> {
    try {
      const res = await fetch(base, { cache: "no-store" });
      return res.ok ? ((await res.json()) as Detail) : null;
    } catch {
      return null;
    }
  }
  const loadError = "Could not load the checklist, comments and history.";

  useEffect(() => {
    let cancelled = false;
    void fetchDetail().then((loaded) => {
      if (cancelled) return;
      if (loaded) setDetail(loaded);
      else setError(loadError);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per task
  }, [taskId]);

  /** Runs a write, reloads the detail and refreshes the board (the card shows the subtask count). */
  async function run(call: () => ReturnType<typeof api>) {
    setError(null);
    const result = await call();
    const loaded = await fetchDetail();
    if (loaded) setDetail(loaded);
    setError(result.ok ? (loaded ? null : loadError) : result.message);
    if (!result.ok && result.network) return;
    router.refresh();
  }

  function onAddSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title"));
    void run(() => api("POST", `${base}/subtasks`, { title })).then(() =>
      form.reset(),
    );
  }

  function onAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body"));
    void run(() => api("POST", `${base}/comments`, { body })).then(() =>
      form.reset(),
    );
  }

  return (
    <div className="mt-6 space-y-6 border-t border-line pt-4">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!detail && !error && <p className="text-sm text-muted">Loading...</p>}
      {detail && (
        <>
          <section aria-labelledby="subtasks-heading" className="space-y-2">
            <h3 id="subtasks-heading" className="font-medium">
              Checklist
              {detail.subtasks.length > 0 &&
                ` (${detail.subtasks.filter((s) => s.done).length}/${detail.subtasks.length})`}
            </h3>
            <ul className="space-y-1">
              {detail.subtasks.map((subtask) => (
                <li
                  key={subtask.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <label className="flex flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={subtask.done}
                      disabled={!canWrite}
                      onChange={(e) => {
                        const done = e.target.checked;
                        setDetail(
                          (d) =>
                            d && {
                              ...d,
                              subtasks: d.subtasks.map((x) =>
                                x.id === subtask.id ? { ...x, done } : x,
                              ),
                            },
                        );
                        void run(() =>
                          api("PATCH", `${base}/subtasks/${subtask.id}`, {
                            done,
                          }),
                        );
                      }}
                    />
                    <span
                      className={subtask.done ? "text-muted line-through" : ""}
                    >
                      {subtask.title}
                    </span>
                  </label>
                  {canWrite && (
                    <button
                      type="button"
                      className="btn-secondary px-2 py-1 text-xs"
                      onClick={() =>
                        void run(() =>
                          api("DELETE", `${base}/subtasks/${subtask.id}`, {}),
                        )
                      }
                    >
                      Remove {subtask.title}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {detail.subtasks.length === 0 && (
              <p className="text-sm text-muted">No checklist items.</p>
            )}
            {canWrite && (
              <form onSubmit={onAddSubtask} className="flex items-end gap-2">
                <label className="field flex-1">
                  New checklist item
                  <input
                    name="title"
                    required
                    maxLength={160}
                    className="input"
                  />
                </label>
                <button type="submit" className="btn-secondary">
                  Add item
                </button>
              </form>
            )}
          </section>

          <section aria-labelledby="comments-heading" className="space-y-2">
            <h3 id="comments-heading" className="font-medium">
              Comments
            </h3>
            <ul className="space-y-3">
              {detail.comments.map((comment) => (
                <li key={comment.id} className="space-y-1 text-sm">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-fg">
                      {comment.author.name}
                    </span>
                    {when(comment.createdAt)}
                    {canWrite &&
                      (comment.author.id === viewerId || canModerate) && (
                        <button
                          type="button"
                          className="link ml-auto"
                          onClick={() =>
                            void run(() =>
                              api(
                                "DELETE",
                                `${base}/comments/${comment.id}`,
                                {},
                              ),
                            )
                          }
                        >
                          Delete comment by {comment.author.name}
                        </button>
                      )}
                  </p>
                  <p className="whitespace-pre-wrap">{comment.body}</p>
                </li>
              ))}
            </ul>
            {detail.comments.length === 0 && (
              <p className="text-sm text-muted">No comments yet.</p>
            )}
            {canWrite && (
              <form onSubmit={onAddComment} className="space-y-2">
                <label className="field">
                  New comment
                  <textarea
                    name="body"
                    required
                    maxLength={2000}
                    rows={2}
                    className="input"
                  />
                </label>
                <button type="submit" className="btn-secondary">
                  Add comment
                </button>
              </form>
            )}
          </section>

          <section aria-labelledby="history-heading" className="space-y-2">
            <h3 id="history-heading" className="font-medium">
              History
            </h3>
            <ul className="space-y-1 text-sm">
              {detail.events.map((event) => (
                <li key={event.id}>
                  <span className="text-muted">{when(event.at)}</span>{" "}
                  {describeEvent(event)}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
