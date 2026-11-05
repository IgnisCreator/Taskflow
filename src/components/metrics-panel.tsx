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
import { formatNumber } from "@/lib/i18n";
import { DAY_MS } from "@/lib/metrics";
import { UNASSIGNED } from "@/lib/validations/filters";
import { getT } from "@/server/i18n";

const PRESETS = [14, 30, 90];

/**
 * The metrics of a list or a space: range and filters (a plain GET form, no script), then one card
 * per metric. `basePath` is the page itself, where the form and the links point.
 */
export async function MetricsPanel({
  metrics,
  basePath,
  now,
  error,
  filter,
  types,
  members,
  forecastHref,
}: {
  forecastHref?: string;
  metrics: PanelMetrics;
  basePath: string;
  now: number;
  error: string | null;
  filter: { type?: string; assignee?: string };
  types: { id: string; name: string }[];
  members: { userId: string; name: string }[];
}) {
  const { t } = await getT();
  const m = t.metrics;
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
    <div className="space-y-4">
      {error && (
        <p role="alert" className="card-danger text-danger-text">
          {error}. {m.errorSuffix}
        </p>
      )}
      <form
        method="get"
        action={basePath}
        aria-label={m.rangeLabel}
        className="card flex flex-wrap items-end gap-3 p-3"
      >
        <label className="field">
          {m.from}
          <input
            type="date"
            name="from"
            defaultValue={metrics.range.from}
            max={today.toISOString().slice(0, 10)}
            className="input"
          />
        </label>
        <label className="field">
          {m.to}
          <input
            type="date"
            name="to"
            defaultValue={metrics.range.to}
            max={today.toISOString().slice(0, 10)}
            className="input"
          />
        </label>
        <label className="field">
          {m.type}
          <select
            name="type"
            defaultValue={filter.type ?? ""}
            className="input"
          >
            <option value="">{m.anyType}</option>
            <option value={UNASSIGNED}>{m.noType}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {m.assignee}
          <select
            name="assignee"
            defaultValue={filter.assignee ?? ""}
            className="input"
          >
            <option value="">{m.anyone}</option>
            <option value={UNASSIGNED}>{m.unassigned}</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          {m.apply}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{m.last}</span>
          {PRESETS.map((n) => (
            <Link key={n} href={preset(n)} className="btn-secondary">
              {m.days(n)}
            </Link>
          ))}
          {forecastHref && (
            <Link href={forecastHref} className="btn-secondary">
              {m.openForecast}
            </Link>
          )}
        </div>
      </form>
      <KeyFigures metrics={metrics} />
      <div id="dashboard" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CfdChart metrics={metrics} />
        <CycleTimeChart metrics={metrics} />
        <AgingChart metrics={metrics} />
        <ThroughputChart metrics={metrics} />
        <WipPanel metrics={metrics} />
        <EfficiencyCard metrics={metrics} />
      </div>
    </div>
  );
}

/** The four numbers to read first; each one repeats what its chart below says in full. */
async function KeyFigures({ metrics }: { metrics: PanelMetrics }) {
  const { lang, t } = await getT();
  const { cycleTime: c, age } = metrics;
  const older = c.p85 === null ? null : age.filter((a) => a.days > c.p85!);
  const figures: [string, string][] = [
    [
      t.metrics.figures.median,
      c.p50 === null ? "–" : t.units.days(formatNumber(c.p50, lang)),
    ],
    [t.metrics.figures.finished, String(metrics.throughput.total)],
    [t.metrics.figures.inProgress, String(metrics.wip.total)],
    [t.metrics.figures.older, older === null ? "–" : String(older.length)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.map(([label, value]) => (
        <div key={label} className="card px-4 py-2">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="text-xl font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
