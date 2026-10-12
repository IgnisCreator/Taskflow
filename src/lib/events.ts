// How a history event reads to people. Pure, so the dialog, the activity page and the tests agree.

export type EventView = {
  type:
    "CREATED" | "MOVED" | "BLOCKED" | "UNBLOCKED" | "DISCARDED" | "REOPENED";
  fromStage: { name: string } | null;
  toStage: { name: string } | null;
  actor: string;
};

// A stage that was deleted later keeps its category in the event but loses its name.
const stage = (s: { name: string } | null) => (s ? s.name : "a removed stage");

/** One line, e.g. "Ana moved it from To do to In progress". */
export function describeEvent(event: EventView): string {
  const { actor } = event;
  const route = `from ${stage(event.fromStage)} to ${stage(event.toStage)}`;
  switch (event.type) {
    case "CREATED":
      return `${actor} created it in ${stage(event.toStage)}`;
    case "MOVED":
      return `${actor} moved it ${route}`;
    case "DISCARDED":
      return `${actor} discarded it (${route})`;
    case "REOPENED":
      return `${actor} reopened it (${route})`;
    case "BLOCKED":
      return `${actor} blocked it in ${stage(event.toStage)}`;
    case "UNBLOCKED":
      return `${actor} unblocked it in ${stage(event.toStage)}`;
  }
}
