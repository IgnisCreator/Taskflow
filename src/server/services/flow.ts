import "server-only";
import type { PutFlowInput } from "@/lib/validations/workflow";
import { validateFlow } from "@/lib/workflow";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { withListLock } from "@/server/locks";
import { can } from "@/server/policies";
import { getList } from "@/server/services/lists";

export const stageSelect = {
  id: true,
  name: true,
  position: true,
  category: true,
  isCommitmentPoint: true,
  wipLimit: true,
  policy: true,
} as const;

const invalid = (code: string, message: string) =>
  new ApiError(400, code, message);

/**
 * Replaces the flow of a list in one transaction under the list lock (version +1, OWNER and ADMIN).
 * Stages with an id are updated and reordered, stages without one are created, the others are
 * removed after their tasks move to the stage chosen in `moveTo` (appended at its end, in order).
 * Positions are first shifted out of the way because (list, position) is unique.
 */
export async function applyFlow(
  userId: string,
  listId: string,
  { expectedBoardVersion, stages, moveTo }: PutFlowInput,
) {
  const problem = validateFlow(stages);
  if (problem) throw invalid("INVALID_FLOW", problem);

  const { result, boardVersion } = await withListLock(
    userId,
    listId,
    expectedBoardVersion,
    "structure:manage",
    async (tx) => {
      const existing = await tx.boardColumn.findMany({
        where: { listId },
        select: { id: true, _count: { select: { tasks: true } } },
      });
      const known = new Set(existing.map((stage) => stage.id));
      const submitted = stages.flatMap((stage) => (stage.id ? [stage.id] : []));
      if (
        new Set(submitted).size !== submitted.length ||
        submitted.some((id) => !known.has(id))
      ) {
        throw invalid("INVALID_STAGE", "A stage does not belong to this list");
      }
      const kept = new Set(submitted);
      const removed = existing.filter((stage) => !kept.has(stage.id));
      for (const stage of removed) {
        const target = moveTo[stage.id];
        if (
          stage._count.tasks > 0 &&
          (target === undefined || target >= stages.length)
        ) {
          throw invalid(
            "MISSING_TARGET",
            `Choose where the ${stage._count.tasks} task(s) of a removed stage go`,
          );
        }
      }

      await tx.boardColumn.updateMany({
        where: { listId },
        data: { position: { increment: 1000 } },
      });
      const ids: string[] = [];
      for (const [position, { id, ...stage }] of stages.entries()) {
        const data = { ...stage, position };
        ids.push(
          id
            ? (
                await tx.boardColumn.update({
                  where: { id },
                  data,
                  select: { id: true },
                })
              ).id
            : (
                await tx.boardColumn.create({
                  data: { ...data, listId },
                  select: { id: true },
                })
              ).id,
        );
      }

      for (const stage of removed) {
        if (stage._count.tasks === 0) continue;
        const target = ids[moveTo[stage.id]!]!;
        const tasks = await tx.task.findMany({
          where: { columnId: stage.id },
          orderBy: { position: "asc" },
          select: { id: true },
        });
        const first = await tx.task.count({ where: { columnId: target } });
        for (const [offset, task] of tasks.entries()) {
          await tx.task.update({
            where: { id: task.id },
            data: { columnId: target, position: first + offset },
          });
        }
      }
      await tx.boardColumn.deleteMany({
        where: { id: { in: removed.map((stage) => stage.id) } },
      });

      return tx.boardColumn.findMany({
        where: { listId },
        orderBy: { position: "asc" },
        select: stageSelect,
      });
    },
  );
  return { stages: result, boardVersion };
}

/**
 * The stages of a list with how many tasks each holds, for the flow editor. Only OWNER and ADMIN may
 * open it (null otherwise, shown as 404), so a hidden or forbidden list reveals nothing.
 */
export async function getFlow(userId: string, listId: string) {
  const list = await getList(userId, listId);
  if (!list || !can(list, "structure:manage")) return null;
  const stages = await db.boardColumn.findMany({
    where: { listId },
    orderBy: { position: "asc" },
    select: { ...stageSelect, _count: { select: { tasks: true } } },
  });
  return {
    list,
    stages: stages.map(({ _count, ...stage }) => ({
      ...stage,
      tasks: _count.tasks,
    })),
  };
}
