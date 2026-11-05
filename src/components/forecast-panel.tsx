import Link from "next/link";
import {
  ChartCard,
  M,
  PLOT_H,
  PLOT_W,
  Svg,
  Table,
} from "@/components/metric-charts";
import { axis, labelIndexes, linear } from "@/lib/charts";
import { HORIZON_DAYS, MAX_ITEMS, forecastWarnings } from "@/lib/forecast";
import { LOCALE, formatNumber } from "@/lib/i18n";
import type { Catalog } from "@/lib/i18n/en";
import { DAY_MS } from "@/lib/metrics";
import { getT } from "@/server/i18n";
import type { getListForecast } from "@/server/services/forecast";

type Forecast = Awaited<ReturnType<typeof getListForecast>>;

const PRESETS = [30, 90, 180];

/** The settings every question shares: history window, working days and seed. */
function Settings({ forecast, t }: { forecast: Forecast; t: Catalog }) {
  const f = t.forecast;
  return (
    <>
      <label className="field">
        {f.historyFrom}
        <input
          type="date"
          name="from"
          defaultValue={forecast.window.from}
          className="input"
        />
      </label>
      <label className="field">
        {f.to}
        <input
          type="date"
          name="to"
          defaultValue={forecast.window.to}
          className="input"
        />
      </label>
      <label className="field">
        {f.seed}
        <input
          type="number"
          name="seed"
          min={0}
          defaultValue={forecast.seed}
          className="input"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="workdays"
          value="1"
          defaultChecked={forecast.workdaysOnly}
        />
        {f.workdays}
      </label>
    </>
  );
}

function summary(forecast: Forecast, t: Catalog): string {
  const f = t.forecast;
  const { window, workdaysOnly } = forecast;
  if (forecast.question === "WHEN" && forecast.nothingPending) {
    return f.nothingPending;
  }
  if (!forecast.possible) return f.impossible(window.from, window.to);
  if (forecast.question === "HOW_MANY") {
    if (forecast.days === 0) {
      return workdaysOnly
        ? f.noWorkdays(forecast.date)
        : f.noDays(forecast.date);
    }
    const [p50, p85, p95] = forecast.confidence;
    return f.howMany(
      forecast.date,
      forecast.days,
      f.unit(forecast.days, workdaysOnly),
      t.metrics.tasks(p95!.count!),
      t.metrics.tasks(p85!.count!),
      t.metrics.tasks(p50!.count!),
    );
  }
  const parts = forecast.confidence.map((c) =>
    c.days === null
      ? f.notWithin(c.percent, HORIZON_DAYS, f.unit(HORIZON_DAYS, workdaysOnly))
      : f.within(c.percent, c.days, f.unit(c.days, workdaysOnly), c.date!),
  );
  return f.whenSummary(
    t.metrics.tasks(forecast.items),
    forecast.defaulted,
    parts.join("; "),
  );
}

export async function ForecastPanel({
  forecast,
  basePath,
  params,
  error,
}: {
  forecast: Forecast;
  basePath: string;
  /** The page's own query, to keep it when a preset changes the window. */
  params: Record<string, string>;
  error: string | null;
}) {
  const { lang, t } = await getT();
  const f = t.forecast;
  const preset = (n: number) => {
    const next = new URLSearchParams(params);
    const to = Date.parse(`${forecast.window.to}T00:00:00Z`);
    next.set("to", forecast.window.to);
    next.set(
      "from",
      new Date(to - (n - 1) * DAY_MS).toISOString().slice(0, 10),
    );
    return `${basePath}?${next}`;
  };
  const { window, histogram: bins, runs } = forecast;
  const values =
    forecast.question === "WHEN"
      ? forecast.confidence.map((c) => ({ percent: c.percent, value: c.days }))
      : forecast.confidence.map((c) => ({
          percent: c.percent,
          value: c.count,
        }));
  const markers = values.flatMap(({ percent, value }) => {
    const index =
      value === null
        ? -1
        : bins.findIndex((b) => value >= b.from && value <= b.to);
    return index < 0 ? [] : [{ percent, index }];
  });
  const share = (count: number) => (count / runs) * 100;
  const { max, ticks } = axis(Math.max(0, ...bins.map((b) => share(b.count))));
  const y = linear(0, max, M.t + PLOT_H, M.t);
  const slot = PLOT_W / Math.max(bins.length, 1);
  const binLabel = (b: { from: number; to: number }) =>
    b.from === b.to ? `${b.from}` : `${b.from}-${b.to}`;
  const what =
    forecast.question === "WHEN"
      ? forecast.workdaysOnly
        ? f.whatWorkdays
        : f.whatDays
      : f.whatTasks;
  const lineClass = ["stroke-control", "stroke-primary", "stroke-danger"];
  const percent = (value: number) => formatNumber(value, lang);
  const runsText = runs.toLocaleString(LOCALE[lang]);

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="card-danger text-danger-text">
          {error}. {f.errorSuffix}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          method="get"
          action={basePath}
          aria-label={f.whenTitle}
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">{f.whenTitle}</h2>
          <label className="field">
            {f.numberOfTasks}
            <input
              type="number"
              name="items"
              min={1}
              max={MAX_ITEMS}
              placeholder={f.allPending}
              defaultValue={
                forecast.question === "WHEN" && !forecast.defaulted
                  ? forecast.items
                  : ""
              }
              className="input"
            />
          </label>
          <Settings forecast={forecast} t={t} />
          <button type="submit" className="btn">
            {f.forecastDate}
          </button>
        </form>
        <form
          method="get"
          action={basePath}
          aria-label={f.howManyTitle}
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">{f.howManyTitle}</h2>
          <label className="field">
            {f.dateAfter}
            <input
              type="date"
              name="date"
              required
              defaultValue={
                forecast.question === "HOW_MANY" ? forecast.date : ""
              }
              className="input"
            />
          </label>
          <Settings forecast={forecast} t={t} />
          <button type="submit" className="btn">
            {f.forecastCount}
          </button>
        </form>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{f.historyWindow}</span>
        {PRESETS.map((n) => (
          <Link key={n} href={preset(n)} className="btn-secondary">
            {t.metrics.days(n)}
          </Link>
        ))}
      </p>
      {forecastWarnings(window).map((warning) => (
        <p
          key={warning.code}
          role="note"
          className="card-danger text-danger-text"
        >
          {warning.code === "FEW_DAYS"
            ? f.warnings.fewDays(warning.have, warning.need)
            : f.warnings.fewTasks(warning.have, warning.need)}
        </p>
      ))}
      <ChartCard
        metric="forecast"
        summary={summary(forecast, t)}
        data={
          bins.length > 0 && (
            <Table
              caption={f.caption(what, runsText)}
              head={[what, f.simulated, f.share]}
              rows={bins.map((b) => [
                binLabel(b),
                b.count,
                `${percent(share(b.count))}%`,
              ])}
            />
          )
        }
      >
        <p data-testid="forecast-settings" className="text-sm text-muted">
          {f.settings(
            window.from,
            window.to,
            window.days,
            window.daysWithData,
            window.finished,
            forecast.seed,
            forecast.workdaysOnly,
            runsText,
          )}
        </p>
        {bins.length > 0 && <p className="text-xs text-muted">{f.barNote}</p>}
        {bins.length > 0 && (
          <Svg
            label={f.svg(what.toLowerCase())}
            ticks={ticks}
            y={y}
            xLabels={labelIndexes(bins.length, 6).map((i) => ({
              x: M.l + slot * (i + 0.5),
              text: binLabel(bins[i]!),
            }))}
          >
            {bins.map((b, i) => (
              <rect
                key={b.from}
                x={M.l + slot * i + slot * 0.1}
                width={slot * 0.8}
                y={y(share(b.count))}
                height={y(0) - y(share(b.count))}
                className="fill-primary/70"
              >
                <title>
                  {f.barTitle(binLabel(b), percent(share(b.count)))}
                </title>
              </rect>
            ))}
            {markers.map((m, i) => (
              <g key={m.percent}>
                <line
                  x1={M.l + slot * (m.index + 0.5)}
                  x2={M.l + slot * (m.index + 0.5)}
                  y1={M.t}
                  y2={M.t + PLOT_H}
                  strokeDasharray="4 3"
                  className={lineClass[i]}
                />
                <text
                  x={M.l + slot * (m.index + 0.5) + 3}
                  y={M.t + 12 + i * 13}
                  className="fill-fg text-[12px]"
                >
                  {m.percent}%
                </text>
              </g>
            ))}
          </Svg>
        )}
      </ChartCard>
    </div>
  );
}
