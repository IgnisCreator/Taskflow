// The four early warnings of a list, as a pure function over its metrics. The daily job calls this
// and compares the result with the open notifications; nothing here touches the database.
//
// - WIP_OVER_LIMIT: a stage has been over its WIP limit for `wipDays` days in a row, ending today.
// - BAND_WIDENING: the stage's band in the CFD grew over the last `bandDays` days without ever
//   shrinking, by at least two tasks in all: work arrives faster than it leaves.
// - TASK_AGING: a task in progress is older than the 85th percentile of cycle time (only when at
//   least MIN_FINISHED tasks finished in the range, so the percentile means something).
// - THROUGHPUT_DROP: the last complete week finished `dropPercent`% less than the average of the four
//   weeks before it (only when that average is at least one task a week).

import { catalogs, formatNumber, type Lang } from "@/lib/i18n";
import type { Metrics } from "@/lib/metrics";
import type { Category } from "@/lib/workflow";

export type AlertSettings = {
  bandDays: number;
  wipDays: number;
  dropPercent: number;
};

export const DEFAULT_ALERTS: AlertSettings = {
  bandDays: 3,
  wipDays: 3,
  dropPercent: 50,
};
export const ALERT_LIMITS = {
  days: { min: 1, max: 30 },
  dropPercent: { min: 10, max: 90 },
};
export const MIN_FINISHED = 5;
/** The metrics must cover at least this many days for the rules above to have their history. */
export const ALERT_WINDOW_DAYS = 90;

export type AlertKind =
  "WIP_OVER_LIMIT" | "BAND_WIDENING" | "TASK_AGING" | "THROUGHPUT_DROP";

/** What each alert says, as data: the reader's language turns it into a sentence. */
export type AlertParamsOf = {
  WIP_OVER_LIMIT: {
    stage: string;
    days: number;
    count: number;
    limit: number;
  };
  BAND_WIDENING: { stage: string; from: number; to: number; days: number };
  TASK_AGING: { title: string | null; days: number; p85: number };
  THROUGHPUT_DROP: {
    week: string;
    count: number;
    average: number;
    percent: number;
  };
};

export type Alert = {
  [K in AlertKind]: {
    kind: K;
    /** Stable while the condition holds: the same key is never notified twice. */
    key: string;
    stageId?: string;
    taskId?: string;
    params: AlertParamsOf[K];
    /** The sentence in English (the daily email and old notifications use it). */
    message: string;
  };
}[AlertKind];

/** The alert as a sentence in `lang`. */
export function describeAlert<K extends AlertKind>(
  kind: K,
  params: AlertParamsOf[K],
  lang: Lang,
): string {
  const t = catalogs[lang].alerts;
  const n = (value: number) => formatNumber(value, lang);
  switch (kind as AlertKind) {
    case "WIP_OVER_LIMIT": {
      const p = params as AlertParamsOf["WIP_OVER_LIMIT"];
      return t.wipOverLimit(p.stage, p.days, p.count, p.limit);
    }
    case "BAND_WIDENING": {
      const p = params as AlertParamsOf["BAND_WIDENING"];
      return t.bandWidening(p.stage, p.from, p.to, p.days);
    }
    case "TASK_AGING": {
      const p = params as AlertParamsOf["TASK_AGING"];
      return t.taskAging(p.title ?? t.aTask, n(p.days), n(p.p85));
    }
    case "THROUGHPUT_DROP": {
      const p = params as AlertParamsOf["THROUGHPUT_DROP"];
      return t.throughputDrop(p.week, p.count, n(p.average), p.percent);
    }
  }
}

/**
 * What a stored notification says in `lang`: made from its data, or its English sentence when it
 * was stored before the data was (`params` is null).
 */
export function notificationText(
  n: { kind: AlertKind; message: string; params: unknown },
  lang: Lang,
): string {
  return n.params ? describeAlert(n.kind, n.params as never, lang) : n.message;
}

/** An alert with its English sentence made from its data. */
function alert<K extends AlertKind>(
  kind: K,
  key: string,
  params: AlertParamsOf[K],
  ids: { stageId?: string; taskId?: string } = {},
): Alert {
  return {
    kind,
    key,
    ...ids,
    params,
    message: describeAlert(kind, params, "en"),
  } as Alert;
}

type Stage = {
  id: string;
  name: string;
  category: Category;
  wipLimit: number | null;
};

const inFlight = (c: Category) => c === "ACTIVE" || c === "WAITING";

export function detectAlerts(
  metrics: Metrics & { titles: Record<string, string> },
  stages: Stage[],
  settings: AlertSettings,
): Alert[] {
  const alerts: Alert[] = [];

  for (const stage of stages) {
    const counts = metrics.cfd.series.find(
      (s) => s.bucket === stage.id,
    )?.counts;
    if (!counts) continue;

    if (stage.wipLimit !== null && inFlight(stage.category)) {
      let run = 0;
      for (
        let i = counts.length - 1;
        i >= 0 && counts[i]! > stage.wipLimit;
        i--
      )
        run++;
      if (run >= settings.wipDays) {
        alerts.push(
          alert(
            "WIP_OVER_LIMIT",
            `wip:${stage.id}`,
            {
              stage: stage.name,
              days: run,
              count: counts.at(-1)!,
              limit: stage.wipLimit,
            },
            { stageId: stage.id },
          ),
        );
      }
    }

    if (inFlight(stage.category) && counts.length > settings.bandDays) {
      const recent = counts.slice(-(settings.bandDays + 1));
      const neverShrinks = recent.every(
        (c, i) => i === 0 || c >= recent[i - 1]!,
      );
      if (neverShrinks && recent.at(-1)! - recent[0]! >= 2) {
        alerts.push(
          alert(
            "BAND_WIDENING",
            `band:${stage.id}`,
            {
              stage: stage.name,
              from: recent[0]!,
              to: recent.at(-1)!,
              days: settings.bandDays,
            },
            { stageId: stage.id },
          ),
        );
      }
    }
  }

  const { cycleTime } = metrics;
  if (cycleTime.p85 !== null && cycleTime.count >= MIN_FINISHED) {
    for (const task of metrics.age) {
      if (task.days <= cycleTime.p85) continue;
      alerts.push(
        alert(
          "TASK_AGING",
          `age:${task.id}`,
          {
            title: metrics.titles[task.id] ?? null,
            days: task.days,
            p85: cycleTime.p85,
          },
          { taskId: task.id },
        ),
      );
    }
  }

  // Complete weeks only: the first one of the range may start before it and the last is still going.
  const weeks = metrics.throughput.weekly.slice(1, -1);
  if (weeks.length >= 5) {
    const last = weeks.at(-1)!;
    const before = weeks.slice(-5, -1);
    const average = before.reduce((sum, w) => sum + w.count, 0) / 4;
    if (
      average >= 1 &&
      last.count <= average * (1 - settings.dropPercent / 100)
    ) {
      alerts.push(
        alert("THROUGHPUT_DROP", "drop", {
          week: last.weekStart,
          count: last.count,
          average,
          percent: Math.round((1 - last.count / average) * 100),
        }),
      );
    }
  }

  return alerts;
}
