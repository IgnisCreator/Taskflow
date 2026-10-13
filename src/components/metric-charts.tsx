import type { ReactNode } from "react";
import { axis, bandPath, labelIndexes, linear, stack } from "@/lib/charts";
import { METRIC_HELP, type MetricKey } from "@/lib/metric-help";
import { DAY_MS, type Metrics } from "@/lib/metrics";
import { CATEGORY_LABEL, type Category } from "@/lib/workflow";

// The charts are plain SVG drawn on the server: no chart library and no script. The geometry comes
// from `src/lib/charts.ts`; colours are the design tokens. Every chart has a text summary and a
// table with the same data, so none of it depends on seeing the picture.

export type PanelMetrics = Metrics & {
  /** Present for a list: its stages, to name the buckets and show the limits. */
  stages?: {
    id: string;
    name: string;
    category: Category;
    wipLimit: number | null;
  }[];
  titles: Record<string, string>;
};

const W = 640;
const H = 260;
const M = { l: 40, r: 12, t: 12, b: 28 };
const PLOT_W = W - M.l - M.r;
const PLOT_H = H - M.t - M.b;

// Literal class names, so that Tailwind finds them. Two shades alternate inside one category.
const FILL: Record<Category, [string, string]> = {
  DONE: ["fill-success-text", "fill-success-text/60"],
  ACTIVE: ["fill-primary", "fill-primary/60"],
  WAITING: ["fill-control", "fill-control/60"],
  BACKLOG: ["fill-line", "fill-line/60"],
  DISCARDED: ["fill-danger", "fill-danger/60"],
};

const tasks = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);
const days = (n: number) => `${n.toFixed(1)} days`;

function bucketName(metrics: PanelMetrics, bucket: string): string {
  const stage = metrics.stages?.find((s) => s.id === bucket);
  if (stage) return stage.name;
  const removed = bucket.startsWith("removed:");
  const category = (removed ? bucket.slice(8) : bucket) as Category;
  const name = CATEGORY_LABEL[category] ?? bucket;
  return removed ? `Deleted stage (${name.toLowerCase()})` : name;
}

function Svg({
  label,
  ticks,
  y,
  xLabels,
  children,
}: {
  label: string;
  ticks: number[];
  y: (value: number) => number;
  xLabels: { x: number; text: string; anchor?: "start" | "middle" | "end" }[];
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="h-auto w-full"
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={M.l}
            x2={W - M.r}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-line"
          />
          <text
            x={M.l - 6}
            y={y(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted text-[10px]"
          >
            {tick}
          </text>
        </g>
      ))}
      {xLabels.map((l) => (
        <text
          key={`${l.x}-${l.text}`}
          x={l.x}
          y={H - 8}
          textAnchor={l.anchor ?? "middle"}
          className="fill-muted text-[10px]"
        >
          {l.text}
        </text>
      ))}
      {children}
    </svg>
  );
}

function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-link">Show the data</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="p-1 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("|")} className="border-t border-line">
                {row.map((cell, i) => (
                  <td key={i} className="p-1">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** One metric: its name, a sentence with the result, the picture, the data and what it means. */
export function ChartCard({
  metric,
  summary,
  children,
  data,
}: {
  metric: MetricKey;
  summary: string;
  children?: ReactNode;
  data?: ReactNode;
}) {
  const help = METRIC_HELP[metric];
  return (
    <section
      aria-labelledby={`m-${metric}`}
      data-metric={metric}
      className="card space-y-3"
    >
      <h2 id={`m-${metric}`} className="text-lg font-semibold">
        {help.title}
      </h2>
      <p>{summary}</p>
      {children}
      {data}
      <details className="text-sm">
        <summary className="cursor-pointer text-link">
          What is this and how to read it
        </summary>
        <dl className="mt-2 space-y-2">
          <div>
            <dt className="font-semibold">What it is</dt>
            <dd className="text-muted">{help.what}</dd>
          </div>
          <div>
            <dt className="font-semibold">Why it matters</dt>
            <dd className="text-muted">{help.why}</dd>
          </div>
          <div>
            <dt className="font-semibold">How to read it</dt>
            <dd className="text-muted">{help.read}</dd>
          </div>
          <div>
            <dt className="font-semibold">Source</dt>
            <dd>
              <a
                href={help.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                {help.source.label}
              </a>
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

export function CfdChart({ metrics }: { metrics: PanelMetrics }) {
  const { days: dates, series } = metrics.cfd;
  // Done at the bottom, to do on top; what was discarded is not work in the flow.
  const shown = series.filter((s) => s.category !== "DISCARDED").reverse();
  const stacked = stack(shown);
  const total = Math.max(0, ...(stacked.at(-1)?.upper ?? [0]));
  const { max, ticks } = axis(total);
  const x = linear(0, Math.max(dates.length - 1, 1), M.l, W - M.r);
  const y = linear(0, max, M.t + PLOT_H, M.t);
  const xs = dates.map((_, i) => x(i));
  const seen: Record<string, number> = {};
  const bands = shown.map((s, i) => {
    const shade = (seen[s.category] = (seen[s.category] ?? -1) + 1) % 2;
    return {
      name: bucketName(metrics, s.bucket),
      path: bandPath(xs, stacked[i]!.lower, stacked[i]!.upper, y),
      className: FILL[s.category][shade]!,
    };
  });
  const last = dates.length - 1;
  const summary =
    dates.length === 0 || shown.length === 0
      ? "There is no history in this range yet."
      : `On ${dates[last]} there were ${tasks(total)} in the flow: ${[...shown]
          .reverse()
          .map((s) => `${s.counts[last]} in ${bucketName(metrics, s.bucket)}`)
          .join(", ")}.`;
  return (
    <ChartCard
      metric="cfd"
      summary={summary}
      data={
        <Table
          caption="Tasks per stage at the end of each day"
          head={[
            "Day",
            ...[...shown].reverse().map((s) => bucketName(metrics, s.bucket)),
          ]}
          rows={dates.map((d, i) => [
            d,
            ...[...shown].reverse().map((s) => s.counts[i]!),
          ])}
        />
      }
    >
      <Svg
        label="Cumulative flow diagram"
        ticks={ticks}
        y={y}
        xLabels={labelIndexes(dates.length, 5).map((i) => ({
          x: x(i),
          text: dates[i]!.slice(5),
        }))}
      >
        {bands.map((b) => (
          <path
            key={b.name}
            d={b.path}
            className={`${b.className} stroke-surface`}
          />
        ))}
      </Svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {shown.map((s, i) => (
          <li key={s.bucket} className="flex items-center gap-1">
            <svg width="10" height="10" aria-hidden="true">
              <rect width="10" height="10" className={bands[i]!.className} />
            </svg>
            {bands[i]!.name}
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/** Horizontal reference line with its label at the right end. */
function Line({
  y,
  text,
  className,
}: {
  y: number;
  text: string;
  className: string;
}) {
  return (
    <g>
      <line
        x1={M.l}
        x2={W - M.r}
        y1={y}
        y2={y}
        strokeDasharray="4 3"
        className={className}
      />
      <text
        x={W - M.r - 2}
        y={y - 3}
        textAnchor="end"
        className="fill-fg text-[10px]"
      >
        {text}
      </text>
    </g>
  );
}

export function CycleTimeChart({ metrics }: { metrics: PanelMetrics }) {
  const { finished, cycleTime: c, leadTime: lead } = metrics;
  const from = Date.parse(metrics.range.from);
  const to = Date.parse(metrics.range.to) + DAY_MS;
  const top = Math.max(0, c.p95 ?? 0, ...finished.map((f) => f.cycleDays));
  const { max, ticks } = axis(top);
  const x = linear(from, to, M.l, W - M.r);
  const y = linear(0, max, M.t + PLOT_H, M.t);
  const dates = labelIndexes(Math.round((to - from) / DAY_MS), 5);
  const summary =
    c.count === 0
      ? "No task was finished in this range."
      : `${tasks(c.count)} finished. Half took ${days(c.p50!)} or less, 85% took ${days(c.p85!)} or less and 95% took ${days(c.p95!)} or less. Lead time (from creation): ${days(lead.p50!)} the median, ${days(lead.p85!)} at 85%.`;
  return (
    <ChartCard
      metric="cycleTime"
      summary={summary}
      data={
        <Table
          caption="Cycle and lead time of each finished task"
          head={["Task", "Finished", "Cycle time (days)", "Lead time (days)"]}
          rows={finished.map((f) => [
            metrics.titles[f.id] ?? f.id,
            new Date(f.finishedAt).toISOString().slice(0, 10),
            f.cycleDays.toFixed(1),
            f.leadDays.toFixed(1),
          ])}
        />
      }
    >
      <Svg
        label="Cycle time of each finished task"
        ticks={ticks}
        y={y}
        xLabels={dates.map((i) => ({
          x: x(from + i * DAY_MS),
          text: new Date(from + i * DAY_MS).toISOString().slice(5, 10),
        }))}
      >
        {finished.map((f) => (
          <circle
            key={f.id}
            cx={x(f.finishedAt)}
            cy={y(f.cycleDays)}
            r="3.5"
            className="fill-primary/70 stroke-surface"
          >
            <title>{`${metrics.titles[f.id] ?? f.id}: ${days(f.cycleDays)}`}</title>
          </circle>
        ))}
        {c.p50 !== null && (
          <Line
            y={y(c.p50)}
            text={`50%: ${days(c.p50)}`}
            className="stroke-control"
          />
        )}
        {c.p85 !== null && (
          <Line
            y={y(c.p85)}
            text={`85%: ${days(c.p85)}`}
            className="stroke-primary"
          />
        )}
        {c.p95 !== null && (
          <Line
            y={y(c.p95)}
            text={`95%: ${days(c.p95)}`}
            className="stroke-danger"
          />
        )}
      </Svg>
    </ChartCard>
  );
}

export function AgingChart({ metrics }: { metrics: PanelMetrics }) {
  const { age, cycleTime: c } = metrics;
  const order = [
    ...(metrics.stages?.map((s) => s.id) ?? []),
    ...age.map((a) => a.bucket),
  ];
  const buckets = [...new Set(order)].filter((b) =>
    age.some((a) => a.bucket === b),
  );
  const top = Math.max(0, c.p85 ?? 0, ...age.map((a) => a.days));
  const { max, ticks } = axis(top);
  const y = linear(0, max, M.t + PLOT_H, M.t);
  const slot = PLOT_W / Math.max(buckets.length, 1);
  const older = c.p85 === null ? [] : age.filter((a) => a.days > c.p85!);
  const summary =
    age.length === 0
      ? "Nothing is in progress right now."
      : `${tasks(age.length)} in progress; the oldest has been going for ${days(Math.max(...age.map((a) => a.days)))}.${c.p85 === null ? "" : older.length === 0 ? ` None is older than the 85th percentile of cycle time (${days(c.p85)}).` : ` ${older.length} older than the 85th percentile of cycle time (${days(c.p85)}).`}`;
  return (
    <ChartCard
      metric="aging"
      summary={summary}
      data={
        <Table
          caption="Age of each task in progress"
          head={["Task", "Stage", "Age (days)"]}
          rows={[...age]
            .sort((a, b) => b.days - a.days)
            .map((a) => [
              metrics.titles[a.id] ?? a.id,
              bucketName(metrics, a.bucket),
              a.days.toFixed(1),
            ])}
        />
      }
    >
      <Svg
        label="Age of each task in progress, by stage"
        ticks={ticks}
        y={y}
        xLabels={buckets.map((b, i) => ({
          x: M.l + slot * (i + 0.5),
          text: bucketName(metrics, b).slice(0, 14),
        }))}
      >
        {buckets.map((bucket, i) =>
          age
            .filter((a) => a.bucket === bucket)
            .map((a, j) => (
              <circle
                key={a.id}
                cx={M.l + slot * (i + 0.5) + ((j % 5) - 2) * 9}
                cy={y(a.days)}
                r="4"
                className={
                  c.p85 !== null && a.days > c.p85
                    ? "fill-danger stroke-surface"
                    : "fill-primary/70 stroke-surface"
                }
              >
                <title>{`${metrics.titles[a.id] ?? a.id}: ${days(a.days)}`}</title>
              </circle>
            )),
        )}
        {c.p85 !== null && (
          <Line
            y={y(c.p85)}
            text={`85% of finished: ${days(c.p85)}`}
            className="stroke-primary"
          />
        )}
      </Svg>
    </ChartCard>
  );
}

export function ThroughputChart({ metrics }: { metrics: PanelMetrics }) {
  const weeks = metrics.throughput.weekly;
  const { max, ticks } = axis(Math.max(0, ...weeks.map((w) => w.count)));
  const y = linear(0, max, M.t + PLOT_H, M.t);
  const slot = PLOT_W / Math.max(weeks.length, 1);
  const summary = `${tasks(metrics.throughput.total)} finished between ${metrics.range.from} and ${metrics.range.to}${
    weeks.length > 0
      ? `, ${(metrics.throughput.total / weeks.length).toFixed(1)} per week on average`
      : ""
  }.`;
  return (
    <ChartCard
      metric="throughput"
      summary={summary}
      data={
        <Table
          caption="Tasks finished per week"
          head={["Week starting (Monday)", "Finished"]}
          rows={weeks.map((w) => [w.weekStart, w.count])}
        />
      }
    >
      <Svg
        label="Tasks finished per week"
        ticks={ticks}
        y={y}
        xLabels={labelIndexes(weeks.length, 6).map((i) => ({
          x: M.l + slot * (i + 0.5),
          text: weeks[i]!.weekStart.slice(5),
        }))}
      >
        {weeks.map((w, i) => (
          <rect
            key={w.weekStart}
            x={M.l + slot * i + slot * 0.15}
            width={slot * 0.7}
            y={y(w.count)}
            height={y(0) - y(w.count)}
            className="fill-primary"
          >
            <title>{`Week of ${w.weekStart}: ${w.count}`}</title>
          </rect>
        ))}
      </Svg>
    </ChartCard>
  );
}

export function WipPanel({ metrics }: { metrics: PanelMetrics }) {
  const count = (bucket: string) =>
    metrics.wip.current.find((c) => c.bucket === bucket)?.count ?? 0;
  // A list: every active or waiting stage, even if empty, with its limit. A space: the categories.
  const rows = metrics.stages
    ? metrics.stages
        .filter((s) => s.category === "ACTIVE" || s.category === "WAITING")
        .map((s) => ({ name: s.name, count: count(s.id), limit: s.wipLimit }))
    : metrics.wip.current
        .filter((c) => c.category === "ACTIVE" || c.category === "WAITING")
        .map((c) => ({
          name: bucketName(metrics, c.bucket),
          count: c.count,
          limit: null,
        }));
  return (
    <ChartCard
      metric="wip"
      summary={`${tasks(metrics.wip.total)} in progress now.${
        rows.some((r) => r.limit !== null && r.count > r.limit)
          ? " At least one stage is over its limit."
          : ""
      }`}
    >
      {rows.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => {
            const over = r.limit !== null && r.count > r.limit;
            return (
              <li
                key={r.name}
                className={`flex items-baseline justify-between gap-2 rounded-md border px-3 py-2 ${over ? "border-danger bg-danger-soft" : "border-line"}`}
              >
                <span className="truncate">{r.name}</span>
                <span className={over ? "font-semibold text-danger-text" : ""}>
                  {r.count}
                  {r.limit !== null && ` of ${r.limit}`}
                  {over && " (over the limit)"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

export function EfficiencyCard({ metrics }: { metrics: PanelMetrics }) {
  const e = metrics.flowEfficiency;
  return (
    <ChartCard
      metric="efficiency"
      summary={
        e.ratio === null
          ? "No task was finished in this range."
          : `${Math.round(e.ratio * 100)}% of the in-progress time of finished tasks was active work (${e.activeDays.toFixed(1)} days active, ${e.waitingDays.toFixed(1)} waiting, ${e.blockedDays.toFixed(1)} of them blocked). Reopened in this range: ${metrics.reopened}.`
      }
    />
  );
}
