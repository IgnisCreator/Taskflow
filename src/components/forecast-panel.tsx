import Link from "next/link";
import { ChartCard, M, PLOT_H, Svg, Table } from "@/components/metric-charts";
import { axis, labelIndexes, linear } from "@/lib/charts";
import { HORIZON_DAYS, MAX_ITEMS } from "@/lib/forecast";
import { DAY_MS } from "@/lib/metrics";
import type { getListForecast } from "@/server/services/forecast";

type Forecast = Awaited<ReturnType<typeof getListForecast>>;

const PRESETS = [30, 90, 180];
const tasks = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);
const unit = (n: number, workdays: boolean) =>
  `${workdays ? "working " : ""}${n === 1 ? "day" : "days"}`;

/** The settings every question shares: history window, working days and seed. */
function Settings({ forecast }: { forecast: Forecast }) {
  return (
    <>
      <label className="field">
        History from
        <input
          type="date"
          name="from"
          defaultValue={forecast.window.from}
          className="input"
        />
      </label>
      <label className="field">
        to
        <input
          type="date"
          name="to"
          defaultValue={forecast.window.to}
          className="input"
        />
      </label>
      <label className="field">
        Seed
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
        Only working days (Monday to Friday)
      </label>
    </>
  );
}

function summary(forecast: Forecast): string {
  const { window, workdaysOnly } = forecast;
  if (forecast.question === "WHEN" && forecast.nothingPending) {
    return "There is nothing pending in this list (no tasks in to do, active or waiting), so there is nothing to forecast. Enter a number of tasks to ask anyway.";
  }
  if (!forecast.possible) {
    return `No task was finished between ${window.from} and ${window.to}, so there is no pace to replay. Choose a longer window or finish some work first.`;
  }
  if (forecast.question === "HOW_MANY") {
    if (forecast.days === 0) {
      return `There are no ${workdaysOnly ? "working " : ""}days between tomorrow and ${forecast.date}, so nothing more can be finished by then.`;
    }
    const [p50, p85, p95] = forecast.confidence;
    return `By ${forecast.date} (${forecast.days} ${unit(forecast.days, workdaysOnly)} from tomorrow) the team finishes at least ${tasks(p95!.count!)} with 95% probability, ${tasks(p85!.count!)} with 85%, and ${tasks(p50!.count!)} with 50%.`;
  }
  const parts = forecast.confidence.map((c) =>
    c.days === null
      ? `${c.percent}% probability: not within ${HORIZON_DAYS} ${unit(HORIZON_DAYS, workdaysOnly)}`
      : `${c.percent}% probability: within ${c.days} ${unit(c.days, workdaysOnly)} (by ${c.date})`,
  );
  return `Finishing ${tasks(forecast.items)}${forecast.defaulted ? " (all the pending ones)" : ""} takes, counting from tomorrow: ${parts.join("; ")}.`;
}

export function ForecastPanel({
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
  const slot = (640 - M.l - M.r) / Math.max(bins.length, 1);
  const binLabel = (b: { from: number; to: number }) =>
    b.from === b.to ? `${b.from}` : `${b.from}-${b.to}`;
  const what =
    forecast.question === "WHEN"
      ? `${forecast.workdaysOnly ? "Working days" : "Days"} until done`
      : "Tasks finished";
  const lineClass = ["stroke-control", "stroke-primary", "stroke-danger"];

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="card-danger text-danger-text">
          {error}. Showing the default instead.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          method="get"
          action={basePath}
          aria-label="When will it be done?"
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">When will it be done?</h2>
          <label className="field">
            Number of tasks
            <input
              type="number"
              name="items"
              min={1}
              max={MAX_ITEMS}
              placeholder="All the pending ones"
              defaultValue={
                forecast.question === "WHEN" && !forecast.defaulted
                  ? forecast.items
                  : ""
              }
              className="input"
            />
          </label>
          <Settings forecast={forecast} />
          <button type="submit" className="btn">
            Forecast the date
          </button>
        </form>
        <form
          method="get"
          action={basePath}
          aria-label="How many by a date?"
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">How many by a date?</h2>
          <label className="field">
            Date (after today)
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
          <Settings forecast={forecast} />
          <button type="submit" className="btn">
            Forecast the count
          </button>
        </form>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">History window:</span>
        {PRESETS.map((n) => (
          <Link key={n} href={preset(n)} className="btn-secondary">
            {n} days
          </Link>
        ))}
      </p>
      {forecast.warnings.map((warning) => (
        <p key={warning} role="note" className="card-danger text-danger-text">
          {warning}
        </p>
      ))}
      <ChartCard
        metric="forecast"
        summary={summary(forecast)}
        data={
          bins.length > 0 && (
            <Table
              caption={`${what} in ${runs} simulated futures`}
              head={[what, "Simulated futures", "Share"]}
              rows={bins.map((b) => [
                binLabel(b),
                b.count,
                `${share(b.count).toFixed(1)}%`,
              ])}
            />
          )
        }
      >
        <p data-testid="forecast-settings" className="text-sm text-muted">
          History {window.from} to {window.to} ({window.days} days,{" "}
          {window.daysWithData} with finished tasks, {window.finished}{" "}
          finished). Seed {forecast.seed}.{" "}
          {forecast.workdaysOnly ? "Working days only." : "All calendar days."}{" "}
          {runs.toLocaleString("en-GB")} simulated futures; the same history and
          seed always give the same answer.
        </p>
        {bins.length > 0 && (
          <p className="text-xs text-muted">
            Each bar is the share of simulated futures (%) that ended with that
            result; the dashed lines mark 50%, 85% and 95%.
          </p>
        )}
        {bins.length > 0 && (
          <Svg
            label={`How the simulated futures spread: ${what.toLowerCase()}`}
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
                <title>{`${binLabel(b)}: ${share(b.count).toFixed(1)}% of futures`}</title>
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
                  y={M.t + 10 + i * 11}
                  className="fill-fg text-[10px]"
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
