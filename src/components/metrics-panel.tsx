import Link from "next/link";
import {
  AgingChart,
  CfdChart,
  CycleTimeChart,
  EfficiencyCard,
  ThroughputChart,
  WipPanel,
  type PanelMetrics,
} from "@/components/metric-charts";
import { DAY_MS } from "@/lib/metrics";
import { UNASSIGNED } from "@/lib/validations/filters";

const PRESETS = [14, 30, 90];

/**
 * The metrics of a list or a space: range and filters (a plain GET form, no script), then one card
 * per metric. `basePath` is the page itself, where the form and the links point.
 */
export function MetricsPanel({
  metrics,
  basePath,
  now,
  error,
  filter,
  types,
  members,
}: {
  metrics: PanelMetrics;
  basePath: string;
  now: number;
  error: string | null;
  filter: { type?: string; assignee?: string };
  types: { id: string; name: string }[];
  members: { userId: string; name: string }[];
}) {
  const today = new Date(Math.floor(now / DAY_MS) * DAY_MS);
  const preset = (n: number) => {
    const params = new URLSearchParams({
      from: new Date(today.getTime() - (n - 1) * DAY_MS)
        .toISOString()
        .slice(0, 10),
      to: today.toISOString().slice(0, 10),
    });
    if (filter.type) params.set("type", filter.type);
    if (filter.assignee) params.set("assignee", filter.assignee);
    return `${basePath}?${params}`;
  };
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="card-danger text-danger-text">
          {error}. Showing the last 30 days instead.
        </p>
      )}
      <form
        method="get"
        action={basePath}
        aria-label="Range and filters"
        className="card flex flex-wrap items-end gap-3"
      >
        <label className="field">
          From
          <input
            type="date"
            name="from"
            defaultValue={metrics.range.from}
            max={today.toISOString().slice(0, 10)}
            className="input"
          />
        </label>
        <label className="field">
          To
          <input
            type="date"
            name="to"
            defaultValue={metrics.range.to}
            max={today.toISOString().slice(0, 10)}
            className="input"
          />
        </label>
        <label className="field">
          Type
          <select
            name="type"
            defaultValue={filter.type ?? ""}
            className="input"
          >
            <option value="">Any type</option>
            <option value={UNASSIGNED}>No type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Assignee
          <select
            name="assignee"
            defaultValue={filter.assignee ?? ""}
            className="input"
          >
            <option value="">Anyone</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Last</span>
        {PRESETS.map((n) => (
          <Link key={n} href={preset(n)} className="btn-secondary">
            {n} days
          </Link>
        ))}
        <span className="text-muted">
          Showing {metrics.range.from} to {metrics.range.to} (UTC days).
        </span>
      </p>
      <CfdChart metrics={metrics} />
      <CycleTimeChart metrics={metrics} />
      <AgingChart metrics={metrics} />
      <ThroughputChart metrics={metrics} />
      <WipPanel metrics={metrics} />
      <EfficiencyCard metrics={metrics} />
    </div>
  );
}
