import { describe, expect, it } from "vitest";
import { DEFAULT_ALERTS, detectAlerts } from "../../src/lib/alerts";
import {
  DEMO_PEOPLE,
  DEMO_SEED,
  generateDemo,
  type DemoList,
} from "../../src/lib/demo-data";
import { DAY_MS, computeMetrics, type MetricTask } from "../../src/lib/metrics";
import { SYSTEM_TEMPLATES, type Category } from "../../src/lib/workflow";

const TODAY = Date.parse("2026-10-28T00:00:00Z");
const demo = generateDemo(TODAY);
const [platform, support] = demo as [DemoList, DemoList];
const stagesOf = (list: DemoList) =>
  SYSTEM_TEMPLATES[list.template]!.stages.map((s) => ({
    id: s.name,
    name: s.name,
    category: s.category as Category,
    isCommitmentPoint: s.isCommitmentPoint,
    wipLimit: list.wipLimits[s.name] ?? s.wipLimit,
  }));

/** The generated history as the metrics engine reads it (stage names stand for ids). */
function metricsOf(list: DemoList, from = TODAY - 89 * DAY_MS) {
  const stages = stagesOf(list);
  const commitment = stages.findIndex((s) => s.isCommitmentPoint);
  const category = new Map(stages.map((s) => [s.name, s.category]));
  const index = new Map(stages.map((s, i) => [s.name, i]));
  const tasks: MetricTask[] = list.tasks.map((task, i) => ({
    id: String(i),
    events: task.events.map((e) => ({
      type: e.type,
      at: e.at,
      toStageId: e.stage,
      toCategory: category.get(e.stage)!,
    })),
  }));
  const metrics = computeMetrics({
    tasks,
    from,
    to: TODAY - DAY_MS,
    now: TODAY,
    isStarted: (e) => {
      const i = index.get(e.toStageId!)!;
      return (
        i >= commitment &&
        e.toCategory !== "DISCARDED" &&
        e.toCategory !== "BACKLOG"
      );
    },
    bucket: (stageId) => stageId!,
    order: stages.map((s) => s.id),
  });
  return {
    stages,
    metrics: { ...metrics, titles: {} as Record<string, string> },
  };
}

describe("the demo history", () => {
  it("is the same for the same day and seed, and different for another seed", () => {
    expect(generateDemo(TODAY)).toEqual(demo);
    expect(generateDemo(TODAY, DEMO_SEED + 1)).not.toEqual(demo);
  });

  it("is a believable size: a couple of hundred tasks over six months", () => {
    expect(platform.tasks.length).toBeGreaterThan(70);
    expect(platform.tasks.length).toBeLessThan(160);
    expect(support.tasks.length).toBeGreaterThan(90);
    expect(support.tasks.length).toBeLessThan(200);
    const total = platform.tasks.length + support.tasks.length;
    expect(total).toBeGreaterThan(150);
    expect(total).toBeLessThan(330);
    const first = Math.min(
      ...demo.flatMap((l) => l.tasks.map((t) => t.createdAt)),
    );
    expect((TODAY - first) / DAY_MS).toBeGreaterThan(170);
  });

  it("every task has a valid history ending yesterday at the latest", () => {
    for (const list of demo) {
      const names = new Set(stagesOf(list).map((s) => s.name));
      const first = stagesOf(list)[0]!.name;
      for (const task of list.tasks) {
        const { events } = task;
        expect(events[0]).toMatchObject({
          type: "CREATED",
          stage: first,
          fromStage: null,
        });
        let blocked = false;
        events.forEach((e, i) => {
          expect(names.has(e.stage)).toBe(true);
          expect(e.at).toBeLessThan(TODAY);
          expect(e.actor).toBeGreaterThanOrEqual(0);
          expect(e.actor).toBeLessThan(DEMO_PEOPLE.length);
          if (i > 0) {
            expect(e.at).toBeGreaterThanOrEqual(events[i - 1]!.at);
            expect(e.fromStage).toBe(events[i - 1]!.stage);
          }
          if (e.type === "BLOCKED") {
            expect(blocked).toBe(false);
            blocked = true;
          }
          if (e.type === "UNBLOCKED") {
            expect(blocked).toBe(true);
            blocked = false;
          }
        });
        expect(task.stage).toBe(events.at(-1)!.stage);
        expect(task.blockedReason !== null).toBe(blocked);
        expect(new Set(task.assignees).size).toBe(task.assignees.length);
        for (const a of task.assignees) expect(a).toBeGreaterThanOrEqual(1);
        expect(task.createdAt).toBe(events[0]!.at);
      }
    }
  });

  it("works on weekdays only", () => {
    for (const list of demo) {
      for (const e of list.tasks.flatMap((t) => t.events)) {
        const weekday = new Date(e.at).getUTCDay();
        expect(weekday).toBeGreaterThanOrEqual(1);
        expect(weekday).toBeLessThanOrEqual(5);
      }
    }
  });

  it("has the cases the charts and rules need to show: blocks, reopenings and discards", () => {
    const count = (type: string) =>
      demo
        .flatMap((l) => l.tasks)
        .filter((t) => t.events.some((e) => e.type === type)).length;
    expect(count("BLOCKED")).toBeGreaterThanOrEqual(3);
    expect(count("REOPENED")).toBeGreaterThanOrEqual(3);
    expect(count("DISCARDED")).toBeGreaterThanOrEqual(5);
  });
});

describe("the story the demo tells", () => {
  it("code review is the bottleneck of the platform list: over its limit and a rule fires", () => {
    const { stages, metrics } = metricsOf(platform);
    const alerts = detectAlerts(metrics, stages, DEFAULT_ALERTS);
    expect(alerts.map((a) => a.key)).toContain("wip:Code review");
    const review = metrics.cfd.series.find((s) => s.bucket === "Code review")!;
    const tail = review.counts.slice(-5);
    expect(Math.min(...tail)).toBeGreaterThan(3); // over its limit for days
    // Before the shortage review was fine: never far over the limit.
    const early = review.counts.slice(0, 40);
    expect(Math.max(...early)).toBeLessThanOrEqual(4);
  });

  it("the support list is steady: no stage over its limit", () => {
    const { stages, metrics } = metricsOf(support);
    const alerts = detectAlerts(metrics, stages, DEFAULT_ALERTS);
    expect(alerts.filter((a) => a.kind === "WIP_OVER_LIMIT")).toEqual([]);
  });

  it("finishes a steady stream of work with sensible cycle times", () => {
    for (const list of demo) {
      const { metrics } = metricsOf(list, TODAY - 179 * DAY_MS);
      expect(metrics.throughput.total).toBeGreaterThan(50);
      expect(metrics.cycleTime.p50!).toBeGreaterThan(1);
      expect(metrics.cycleTime.p85!).toBeLessThan(30);
      // Enough history in the last 90 days for a forecast and the alert rules.
      const recent = metricsOf(list).metrics;
      expect(recent.cycleTime.count).toBeGreaterThanOrEqual(30);
      expect(
        recent.throughput.daily.filter((d) => d.count > 0).length,
      ).toBeGreaterThan(30);
    }
  });

  it("tells the same story whatever the day: a queue of more than five waiting in review", () => {
    for (const shift of [0, 1, 3, 10, 400]) {
      const [list, other] = generateDemo(TODAY + shift * DAY_MS) as [
        DemoList,
        DemoList,
      ];
      const inReview = list.tasks.filter((t) => t.stage === "Code review");
      expect(inReview.length, `day +${shift}`).toBeGreaterThan(5);
      expect(
        other.tasks.filter((t) => t.stage === "In progress").length,
      ).toBeLessThanOrEqual(5);
      expect(list.tasks.length).toBeGreaterThan(70);
    }
  });
});
