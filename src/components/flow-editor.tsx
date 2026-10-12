"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  MAX_STAGES,
  defaultTarget,
  validateFlow,
  type Category,
  type FlowStage,
} from "@/lib/workflow";

export type ExistingStage = FlowStage & { id: string; tasks: number };
export type TemplateOption = {
  ref: string;
  name: string;
  stages: FlowStage[];
  group: "System" | "Your workspace";
};

/** A row being edited. `id` is set for a stage that already exists; `key` identifies it in the form. */
type Row = {
  key: string;
  id?: string;
  name: string;
  category: Category;
  wipLimit: string;
  policy: string;
  isCommitmentPoint: boolean;
};

const newKey = () => crypto.randomUUID();
const fromStage = (stage: FlowStage, id?: string): Row => ({
  key: id ?? newKey(),
  id,
  name: stage.name,
  category: stage.category,
  wipLimit: stage.wipLimit?.toString() ?? "",
  policy: stage.policy ?? "",
  isCommitmentPoint: stage.isCommitmentPoint,
});
const toStage = (row: Row): FlowStage => ({
  name: row.name.trim(),
  category: row.category,
  wipLimit: row.wipLimit ? Number(row.wipLimit) : null,
  policy: row.policy.trim() || null,
  isCommitmentPoint: row.isCommitmentPoint,
});

/**
 * Edits the flow of a list: rename, reorder, add and remove stages, set category, WIP limit, policy
 * and the commitment point, or start from a template. A stage that is removed while it holds tasks
 * asks where those tasks go. The same rules as the server run live (validateFlow).
 */
export function FlowEditor({
  listId,
  version,
  stages,
  templates,
  saved,
}: {
  listId: string;
  version: number;
  stages: ExistingStage[];
  templates: TemplateOption[];
  /** The page was reloaded right after a successful save (the editor is rebuilt with the new version). */
  saved: boolean;
}) {
  const router = useRouter();
  const initial = stages.map((stage) => fromStage(stage, stage.id));
  const [rows, setRows] = useState<Row[]>(initial);
  // Existing stages that are no longer in the flow, and where their tasks go (a row key).
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState(templates[0]?.ref ?? "");
  const [error, setError] = useState<string | null>(null);
  // Edits after a save hide the "saved" notice.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);

  const removed = stages.filter((stage) => removedIds.includes(stage.id));
  const problem = validateFlow(rows.map(toStage));
  const targetFor = (stage: ExistingStage) => {
    const chosen = target[stage.id];
    if (chosen && rows.some((row) => row.key === chosen)) return chosen;
    const index = defaultTarget(
      stage,
      rows.map((row) => ({ category: row.category })),
    );
    return index === null ? "" : rows[index]!.key;
  };

  function update(key: string, patch: Partial<Row>) {
    setDirty(true);
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) {
          return patch.isCommitmentPoint
            ? { ...row, isCommitmentPoint: false }
            : row;
        }
        return { ...row, ...patch };
      }),
    );
  }

  function move(index: number, by: -1 | 1) {
    setDirty(true);
    setRows((current) => {
      const next = [...current];
      const other = index + by;
      if (other < 0 || other >= next.length) return current;
      [next[index], next[other]] = [next[other]!, next[index]!];
      return next;
    });
  }

  function remove(row: Row) {
    setDirty(true);
    setRows((current) => current.filter((r) => r.key !== row.key));
    if (row.id) setRemovedIds((ids) => [...ids, row.id!]);
  }

  function add() {
    setDirty(true);
    // New stages start as active work just before the first done stage.
    setRows((current) => {
      const at = current.findIndex((row) => row.category === "DONE");
      const row = fromStage({
        name: "",
        category: "ACTIVE",
        wipLimit: null,
        policy: null,
        isCommitmentPoint: false,
      });
      return at === -1
        ? [...current, row]
        : [...current.slice(0, at), row, ...current.slice(at)];
    });
  }

  function loadTemplate() {
    const chosen = templates.find((t) => t.ref === template);
    if (!chosen) return;
    setDirty(true);
    setRows(chosen.stages.map((stage) => fromStage(stage)));
    setRemovedIds(stages.map((stage) => stage.id)); // every current stage is replaced
    setTarget({});
  }

  function reset() {
    setDirty(true);
    setRows(initial);
    setRemovedIds([]);
    setTarget({});
  }

  async function save() {
    setPending(true);
    setError(null);
    const moveTo: Record<string, number> = {};
    for (const stage of removed) {
      if (stage.tasks > 0) {
        moveTo[stage.id] = rows.findIndex(
          (row) => row.key === targetFor(stage),
        );
      }
    }
    const result = await api("PUT", `/api/lists/${listId}/flow`, {
      expectedBoardVersion: version,
      stages: rows.map((row) => ({ id: row.id, ...toStage(row) })),
      moveTo,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      if (!result.network) router.refresh();
      return;
    }
    // The page reloads with the new version; the notice travels in the URL.
    router.replace(`/lists/${listId}/flow?saved=1`);
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Start from a template</h2>
        <p className="text-sm text-muted">
          Loading a template replaces the stages below. Nothing changes until
          you save, and the tasks of any replaced stage go where you choose.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="field min-w-56 flex-1">
            Template
            <select
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              className="input"
            >
              {(["System", "Your workspace"] as const).map((group) => {
                const options = templates.filter((t) => t.group === group);
                return options.length === 0 ? null : (
                  <optgroup key={group} label={group}>
                    {options.map((t) => (
                      <option key={t.ref} value={t.ref}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadTemplate}
          >
            Load template
          </button>
          <button type="button" className="btn-secondary" onClick={reset}>
            Undo my changes
          </button>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="stages-heading">
        <h2 id="stages-heading" className="text-lg font-semibold">
          Stages
        </h2>
        <p className="text-sm text-muted">
          Work moves from top to bottom. The order of categories is fixed: to
          do, then active or waiting, then done, then discarded. The{" "}
          <strong>commitment point</strong> is where a task counts as started:
          the cycle time begins there.
        </p>
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.key} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="field min-w-48 flex-1">
                  Name
                  <input
                    value={row.name}
                    maxLength={40}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                    className="input"
                  />
                </label>
                <label className="field">
                  Category
                  <select
                    value={row.category}
                    onChange={(e) =>
                      update(row.key, { category: e.target.value as Category })
                    }
                    className="input"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABEL[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field w-28">
                  WIP limit
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={row.wipLimit}
                    onChange={(e) =>
                      update(row.key, { wipLimit: e.target.value })
                    }
                    placeholder="None"
                    className="input"
                  />
                </label>
              </div>
              <label className="field">
                Policy: what it takes to enter or leave this stage
                <input
                  value={row.policy}
                  maxLength={300}
                  onChange={(e) => update(row.key, { policy: e.target.value })}
                  className="input"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="commitment"
                    checked={row.isCommitmentPoint}
                    onChange={() =>
                      update(row.key, { isCommitmentPoint: true })
                    }
                  />
                  Commitment point
                </label>
                <span className="ml-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    Move {row.name || "stage"} up
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Move {row.name || "stage"} down
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => remove(row)}
                  >
                    Remove {row.name || "stage"}
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn-secondary"
          disabled={rows.length >= MAX_STAGES}
          onClick={add}
        >
          Add a stage
        </button>
      </section>

      {removed.some((stage) => stage.tasks > 0) && (
        <section className="card space-y-3" aria-labelledby="move-heading">
          <h2 id="move-heading" className="text-lg font-semibold">
            Where do the tasks of removed stages go?
          </h2>
          {removed
            .filter((stage) => stage.tasks > 0)
            .map((stage) => (
              <label key={stage.id} className="field">
                {stage.name}: {stage.tasks} task{stage.tasks === 1 ? "" : "s"}{" "}
                move to
                <select
                  value={targetFor(stage)}
                  onChange={(e) =>
                    setTarget((current) => ({
                      ...current,
                      [stage.id]: e.target.value,
                    }))
                  }
                  className="input"
                >
                  {rows.map((row) => (
                    <option key={row.key} value={row.key}>
                      {row.name || "(unnamed stage)"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <p className="text-sm text-muted">
            They are added at the end of the chosen stage, in their current
            order.
          </p>
        </section>
      )}

      <div className="space-y-2">
        {problem && <p className="error">{problem}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {saved && !dirty && (
          <p role="status" className="notice">
            Flow saved.
          </p>
        )}
        <button
          type="button"
          className="btn"
          disabled={pending || problem !== null}
          onClick={() => void save()}
        >
          Save flow
        </button>
      </div>
    </div>
  );
}
