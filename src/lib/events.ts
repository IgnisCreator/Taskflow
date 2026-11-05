// How a history event reads to people. Pure, so the dialog, the activity page and the tests agree.

import { en, type Catalog } from "@/lib/i18n/en";

export type EventView = {
  type:
    "CREATED" | "MOVED" | "BLOCKED" | "UNBLOCKED" | "DISCARDED" | "REOPENED";
  fromStage: { name: string } | null;
  toStage: { name: string } | null;
  actor: string;
};

/** One line, e.g. "Ana moved it from To do to In progress" (English unless `t` says otherwise). */
export function describeEvent(event: EventView, t: Catalog = en): string {
  const { actor } = event;
  const e = t.events;
  // A stage that was deleted later keeps its category in the event but loses its name.
  const stage = (s: { name: string } | null) => (s ? s.name : e.removedStage);
  const from = stage(event.fromStage);
  const to = stage(event.toStage);
  switch (event.type) {
    case "CREATED":
      return e.created(actor, to);
    case "MOVED":
      return e.moved(actor, from, to);
    case "DISCARDED":
      return e.discarded(actor, from, to);
    case "REOPENED":
      return e.reopened(actor, from, to);
    case "BLOCKED":
      return e.blocked(actor, to);
    case "UNBLOCKED":
      return e.unblocked(actor, to);
  }
}
