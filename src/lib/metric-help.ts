// What each metric is, why it matters and how to read it, with the source it comes from. Shown next
// to every chart so that nobody has to know Kanban to read the panel.

export const KANBAN_GUIDE = "https://kanbanguides.org/english/";
export const KANBAN_GLOSSARY =
  "https://kanban.university/wp-content/uploads/2023/04/The-Official-Kanban-Guide_Glossary.pdf";

export type MetricKey =
  "cfd" | "cycleTime" | "aging" | "throughput" | "wip" | "efficiency";

export const METRIC_HELP: Record<
  MetricKey,
  {
    title: string;
    what: string;
    why: string;
    read: string;
    source: { label: string; url: string };
  }
> = {
  cfd: {
    title: "Cumulative flow diagram",
    what: "How many tasks were in each stage at the end of every day, piled up from done (bottom) to to do (top).",
    why: "It shows bottlenecks early, before anyone complains: work piles up where it is not flowing.",
    read: "Parallel bands mean a steady flow. A band that keeps getting wider is a bottleneck. A flat done band means nothing is being finished. The width of a band is the work in that stage.",
    source: { label: "Kanban University glossary", url: KANBAN_GLOSSARY },
  },
  cycleTime: {
    title: "Cycle time",
    what: "Days from the moment work started (the commitment point) to the moment it was done, for each task finished in the range.",
    why: "It tells how long a piece of work takes once you commit to it, so you can make promises you can keep.",
    read: "Each dot is a finished task. The 85th percentile line says: 85% of the tasks took this long or less. Dots far above the line are the ones to ask about.",
    source: { label: "Kanban Guide", url: KANBAN_GUIDE },
  },
  aging: {
    title: "Work item age",
    what: "Days since work started, for every task that is in progress right now.",
    why: "Cycle time only counts what is already finished; age warns about what is stuck before it finishes.",
    read: "A task above the 85th percentile line of cycle time is older than most finished tasks: it deserves attention now.",
    source: { label: "Kanban Guide", url: KANBAN_GUIDE },
  },
  throughput: {
    title: "Throughput",
    what: "How many tasks were finished each week. Discarded tasks do not count.",
    why: "It is the real pace of the team, and the base to forecast how much will be done.",
    read: "Look at the trend, not at one week. A falling trend with a growing work in progress means things are starting but not finishing.",
    source: { label: "Kanban Guide", url: KANBAN_GUIDE },
  },
  wip: {
    title: "Work in progress",
    what: "How many tasks are in active or waiting stages now, stage by stage, against the limit of each one.",
    why: "Starting less and finishing more is faster: too much work at once slows everything down.",
    read: "A stage over its limit is a signal to finish something before pulling more in. Limits here are advice, nothing is blocked.",
    source: { label: "Kanban Guide", url: KANBAN_GUIDE },
  },
  efficiency: {
    title: "Flow efficiency",
    what: "Of the time the finished tasks spent in progress, the share in which someone was actually working on them (not waiting, not blocked).",
    why: "Most of the time of a task is usually waiting; this makes it visible.",
    read: "A low number is normal and is not a goal in itself: it shows where time is lost. It is a complementary measure, not one of the four official ones.",
    source: { label: "Kanban University glossary", url: KANBAN_GLOSSARY },
  },
};
