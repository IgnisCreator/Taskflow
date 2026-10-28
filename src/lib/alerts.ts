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

export type Alert = {
  kind: AlertKind;
  /** Stable while the condition holds: the same key is never notified twice. */
  key: string;
  stageId?: string;
  taskId?: string;
  message: string;
};

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
        alerts.push({
          kind: "WIP_OVER_LIMIT",
          key: `wip:${stage.id}`,
          stageId: stage.id,
          message: `"${stage.name}" has been over its WIP limit for ${run} days (${counts.at(-1)} of ${stage.wipLimit}). Finish something before pulling more in.`,
        });
      }
    }

    if (inFlight(stage.category) && counts.length > settings.bandDays) {
      const recent = counts.slice(-(settings.bandDays + 1));
      const neverShrinks = recent.every(
        (c, i) => i === 0 || c >= recent[i - 1]!,
      );
      if (neverShrinks && recent.at(-1)! - recent[0]! >= 2) {
        alerts.push({
          kind: "BAND_WIDENING",
          key: `band:${stage.id}`,
          stageId: stage.id,
          message: `"${stage.name}" has grown from ${recent[0]} to ${recent.at(-1)} tasks in ${settings.bandDays} days without shrinking: work is arriving faster than it leaves.`,
        });
      }
    }
  }

  const { cycleTime } = metrics;
  if (cycleTime.p85 !== null && cycleTime.count >= MIN_FINISHED) {
    for (const task of metrics.age) {
      if (task.days <= cycleTime.p85) continue;
      alerts.push({
        kind: "TASK_AGING",
        key: `age:${task.id}`,
        taskId: task.id,
        message: `"${metrics.titles[task.id] ?? "A task"}" has been in progress for ${task.days.toFixed(1)} days, longer than 85% of finished tasks (${cycleTime.p85.toFixed(1)} days).`,
      });
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
      alerts.push({
        kind: "THROUGHPUT_DROP",
        key: "drop",
        message: `The week of ${last.weekStart} finished ${last.count} tasks, against ${average.toFixed(1)} a week on average before: a drop of ${Math.round((1 - last.count / average) * 100)}%.`,
      });
    }
  }

  return alerts;
}
