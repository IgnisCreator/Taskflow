import type { ReactNode } from "react";
import { axis, bandPath, labelIndexes, linear, stack } from "@/lib/charts";
import { formatNumber } from "@/lib/i18n";
import type { Catalog } from "@/lib/i18n/en";
import { METRIC_HELP, type MetricKey } from "@/lib/metric-help";
import { DAY_MS, type Metrics } from "@/lib/metrics";
import type { Category } from "@/lib/workflow";
import { getT } from "@/server/i18n";

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

// Small enough that the labels stay readable when three charts share a row (see MetricsPanel).
export const W = 480;
export const H = 180;
export const M = { l: 40, r: 12, t: 12, b: 28 };
export const PLOT_W = W - M.l - M.r;
export const PLOT_H = H - M.t - M.b;

// Literal class names, so that Tailwind finds them. Two shades alternate inside one category.
const FILL: Record<Category, [string, string]> = {
  DONE: ["fill-success-text", "fill-success-text/60"],
  ACTIVE: ["fill-primary", "fill-primary/60"],
  WAITING: ["fill-control", "fill-control/60"],
  BACKLOG: ["fill-line", "fill-line/60"],
  DISCARDED: ["fill-danger", "fill-danger/60"],
};

function bucketName(t: Catalog, metrics: PanelMetrics, bucket: string): string {
  const stage = metrics.stages?.find((s) => s.id === bucket);
  if (stage) return stage.name;
  const removed = bucket.startsWith("removed:");
  const category = (removed ? bucket.slice(8) : bucket) as Category;
  const name = t.categories[category] ?? bucket;
  return removed ? t.metrics.deletedStage(name.toLowerCase()) : name;
}

export function Svg({
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
      className="h-auto w-full group-target:mx-auto group-target:max-w-3xl"
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
            className="fill-muted text-[12px]"
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
          className="fill-muted text-[12px]"
        >
          {l.text}
        </text>
      ))}
      {children}
    </svg>
  );
}

export async function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  const { t } = await getT();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-link">
        {t.metrics.showData}
      </summary>
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
export async function ChartCard({
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
  const { t } = await getT();
  const help = { ...t.metricHelp[metric], url: METRIC_HELP[metric].source.url };
  return (
    // `Expand` is a plain link to this card's id: the :target styles widen it to the whole row.
    <section
      id={`card-${metric}`}
      aria-labelledby={`m-${metric}`}
      data-metric={metric}
      className="card group space-y-2 p-4 target:col-span-full"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`m-${metric}`} className="text-base font-semibold">
          {help.title}
        </h2>
        <a
          href={`#card-${metric}`}
          className="link text-sm group-target:hidden"
        >
          {t.metrics.expand}
          <span className="sr-only"> {help.title}</span>
        </a>
        <a
          href="#dashboard"
          className="link hidden text-sm group-target:inline"
        >
          {t.metrics.back}
        </a>
      </div>
      <p className="text-sm">{summary}</p>
      {children}
      {/* The two folds sit side by side to save height; an open one takes the whole row. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-1 [&>details[open]]:basis-full">
        {data}
        <details className="text-sm">
          <summary className="cursor-pointer text-link">
            {t.metrics.whatIs}
          </summary>
          <dl className="mt-2 space-y-2">
            <div>
              <dt className="font-semibold">{t.metrics.what}</dt>
              <dd className="text-muted">{help.what}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.metrics.why}</dt>
              <dd className="text-muted">{help.why}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.metrics.read}</dt>
              <dd className="text-muted">{help.read}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.metrics.source}</dt>
              <dd>
                <a
                  href={help.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {help.sourceLabel}
                </a>
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}

export async function CfdChart({ metrics }: { metrics: PanelMetrics }) {
  const { t } = await getT();
  const m = t.metrics;
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
      name: bucketName(t, metrics, s.bucket),
      path: bandPath(xs, stacked[i]!.lower, stacked[i]!.upper, y),
      className: FILL[s.category][shade]!,
    };
  });
  const last = dates.length - 1;
  const summary =
    dates.length === 0 || shown.length === 0
      ? m.cfd.none
      : m.cfd.summary(
          dates[last]!,
          m.tasks(total),
          [...shown]
            .reverse()
            .map((s) =>
              m.cfd.part(s.counts[last]!, bucketName(t, metrics, s.bucket)),
            )
            .join(", "),
        );
  return (
    <ChartCard
      metric="cfd"
      summary={summary}
      data={
        <Table
          caption={m.cfd.caption}
          head={[
            m.cfd.day,
            ...[...shown]
              .reverse()
              .map((s) => bucketName(t, metrics, s.bucket)),
          ]}
          rows={dates.map((d, i) => [
            d,
            ...[...shown].reverse().map((s) => s.counts[i]!),
          ])}
        />
      }
    >
      <Svg
        label={m.cfd.svg}
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
export function Line({
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
        className="fill-fg text-[12px]"
      >
        {text}
      </text>
    </g>
  );
}

export async function CycleTimeChart({ metrics }: { metrics: PanelMetrics }) {
  const { lang, t } = await getT();
  const m = t.metrics;
  const days = (n: number) => t.units.days(formatNumber(n, lang));
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
      ? m.cycle.none
      : m.cycle.summary(
          m.tasks(c.count),
          days(c.p50!),
          days(c.p85!),
          days(c.p95!),
          days(lead.p50!),
          days(lead.p85!),
        );
  return (
    <ChartCard
      metric="cycleTime"
      summary={summary}
      data={
        <Table
          caption={m.cycle.caption}
          head={[
            m.cycle.task,
            m.cycle.finishedOn,
            m.cycle.cycleDays,
            m.cycle.leadDays,
          ]}
          rows={finished.map((f) => [
            metrics.titles[f.id] ?? f.id,
            new Date(f.finishedAt).toISOString().slice(0, 10),
            formatNumber(f.cycleDays, lang),
            formatNumber(f.leadDays, lang),
          ])}
        />
      }
    >
      <Svg
        label={m.cycle.svg}
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
            text={m.cycle.line(50, days(c.p50))}
            className="stroke-control"
          />
        )}
        {c.p85 !== null && (
          <Line
            y={y(c.p85)}
            text={m.cycle.line(85, days(c.p85))}
            className="stroke-primary"
          />
        )}
        {c.p95 !== null && (
          <Line
            y={y(c.p95)}
            text={m.cycle.line(95, days(c.p95))}
            className="stroke-danger"
          />
        )}
      </Svg>
    </ChartCard>
  );
}

export async function AgingChart({ metrics }: { metrics: PanelMetrics }) {
  const { lang, t } = await getT();
  const m = t.metrics;
  const days = (n: number) => t.units.days(formatNumber(n, lang));
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
      ? m.aging.none
      : m.aging.summary(
          m.tasks(age.length),
          days(Math.max(...age.map((a) => a.days))),
        ) +
        (c.p85 === null
          ? ""
          : older.length === 0
            ? m.aging.noneOlder(days(c.p85))
            : m.aging.someOlder(older.length, days(c.p85)));
  return (
    <ChartCard
      metric="aging"
      summary={summary}
      data={
        <Table
          caption={m.aging.caption}
          head={[m.aging.task, m.aging.stage, m.aging.ageDays]}
          rows={[...age]
            .sort((a, b) => b.days - a.days)
            .map((a) => [
              metrics.titles[a.id] ?? a.id,
              bucketName(t, metrics, a.bucket),
              formatNumber(a.days, lang),
            ])}
        />
      }
    >
      <Svg
        label={m.aging.svg}
        ticks={ticks}
        y={y}
        xLabels={buckets.map((b, i) => ({
          x: M.l + slot * (i + 0.5),
          text: bucketName(t, metrics, b).slice(0, 10),
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
            text={m.aging.line(days(c.p85))}
            className="stroke-primary"
          />
        )}
      </Svg>
    </ChartCard>
  );
}

export async function ThroughputChart({ metrics }: { metrics: PanelMetrics }) {
  const { lang, t } = await getT();
  const m = t.metrics;
  const weeks = metrics.throughput.weekly;
  const { max, ticks } = axis(Math.max(0, ...weeks.map((w) => w.count)));
  const y = linear(0, max, M.t + PLOT_H, M.t);
  const slot = PLOT_W / Math.max(weeks.length, 1);
  const summary = `${m.throughput.summary(
    m.tasks(metrics.throughput.total),
    metrics.range.from,
    metrics.range.to,
  )}${
    weeks.length > 0
      ? m.throughput.perWeek(
          formatNumber(metrics.throughput.total / weeks.length, lang),
        )
      : ""
  }.`;
  return (
    <ChartCard
      metric="throughput"
      summary={summary}
      data={
        <Table
          caption={m.throughput.caption}
          head={[m.throughput.week, m.throughput.finished]}
          rows={weeks.map((w) => [w.weekStart, w.count])}
        />
      }
    >
      <Svg
        label={m.throughput.svg}
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
            <title>{m.throughput.bar(w.weekStart, w.count)}</title>
          </rect>
        ))}
      </Svg>
    </ChartCard>
  );
}

export async function WipPanel({ metrics }: { metrics: PanelMetrics }) {
  const { t } = await getT();
  const m = t.metrics;
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
          name: bucketName(t, metrics, c.bucket),
          count: c.count,
          limit: null,
        }));
  return (
    <ChartCard
      metric="wip"
      summary={`${m.wip.summary(m.tasks(metrics.wip.total))}${
        rows.some((r) => r.limit !== null && r.count > r.limit)
          ? m.wip.over
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
                  {r.limit !== null && m.wip.of(r.limit)}
                  {over && m.wip.overLimit}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

export async function EfficiencyCard({ metrics }: { metrics: PanelMetrics }) {
  const { lang, t } = await getT();
  const m = t.metrics;
  const e = metrics.flowEfficiency;
  const n = (value: number) => formatNumber(value, lang);
  return (
    <ChartCard
      metric="efficiency"
      summary={
        e.ratio === null
          ? m.efficiency.none
          : m.efficiency.summary(
              Math.round(e.ratio * 100),
              n(e.activeDays),
              n(e.waitingDays),
              n(e.blockedDays),
              metrics.reopened,
            )
      }
    />
  );
}
