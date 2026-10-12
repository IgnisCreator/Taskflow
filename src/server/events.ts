import "server-only";
import type { StageCategory, TaskEventType } from "@/generated/prisma/enums";
import type { Tx } from "@/server/locks";

/** Where a task is, for the history: the stage and its category at that moment (copied, never looked up later). */
export type Place = { id: string; category: StageCategory };

/**
 * Appends events to the history, inside the same transaction as the change they describe, so a
 * change that rolls back leaves no event and an event never exists without its change.
 * This is the only place events are written.
 */
export async function recordEvents(
  tx: Tx,
  events: {
    taskId: string;
    listId: string;
    type: TaskEventType;
    from?: Place;
    to?: Place;
    actorId: string;
  }[],
) {
  if (events.length === 0) return;
  await tx.taskEvent.createMany({
    data: events.map(({ from, to, ...event }) => ({
      ...event,
      fromStageId: from?.id ?? null,
      fromCategory: from?.category ?? null,
      toStageId: to?.id ?? null,
      toCategory: to?.category ?? null,
    })),
  });
}
