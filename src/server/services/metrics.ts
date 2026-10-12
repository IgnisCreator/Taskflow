import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { computeMetrics, type MetricTask } from "@/lib/metrics";
import type { Category } from "@/lib/workflow";
import { UNASSIGNED } from "@/lib/validations/filters";
import type { MetricsQuery } from "@/lib/validations/metrics";
import { db } from "@/server/db";
import { notFound, readListAccess, type Tx } from "@/server/locks";
import { canSeeSpace } from "@/server/policies";

const CATEGORIES: Category[] = [
  "BACKLOG",
  "ACTIVE",
  "WAITING",
  "DONE",
  "DISCARDED",
];

/** The tasks of a set of lists that pass the filters, each with its history, oldest event first. */
async function loadTasks(
  tx: Tx,
  where: Prisma.TaskWhereInput,
  { type, assignee }: Pick<MetricsQuery, "type" | "assignee">,
) {
  const rows = await tx.task.findMany({
    where: {
      ...where,
      typeId: type === UNASSIGNED ? null : type,
      assignees:
        assignee === UNASSIGNED
          ? { none: {} }
          : assignee
            ? { some: { userId: assignee } }
            : undefined,
    },
    select: {
      id: true,
      title: true,
      events: {
        orderBy: [{ at: "asc" }, { id: "asc" }],
        select: { type: true, at: true, toStageId: true, toCategory: true },
      },
    },
  });
  const titles: Record<string, string> = {};
  const tasks: MetricTask[] = rows.map((row) => {
    titles[row.id] = row.title;
    return {
      id: row.id,
      // Every event the app writes says where the task is; the column is nullable only for the type.
      events: row.events.map((e) => ({
        type: e.type,
        at: e.at.getTime(),
        toStageId: e.toStageId,
        toCategory: e.toCategory!,
      })),
    };
  });
  return { tasks, titles };
}

/** Stages that count as work started: the commitment point and what comes after it, up to done. */
function startedStages(
  stages: {
    id: string;
    position: number;
    category: Category;
    isCommitmentPoint: boolean;
  }[],
) {
  const commitment = stages.find((s) => s.isCommitmentPoint)?.position ?? 0;
  return new Set(
    stages
      .filter(
        (s) =>
          s.position >= commitment &&
          ["ACTIVE", "WAITING", "DONE"].includes(s.category),
      )
      .map((s) => s.id),
  );
}

function engineOptions(started: Set<string>) {
  return {
    // A stage deleted later is unknown: its category decides.
    isStarted: (e: { toStageId: string | null; toCategory: Category }) =>
      e.toStageId === null
        ? ["ACTIVE", "WAITING", "DONE"].includes(e.toCategory)
        : started.has(e.toStageId),
  };
}

/**
 * The flow metrics of one list, stage by stage. The list must be visible to the caller (a hidden or
 * missing one is a 404). `now` is a parameter so that tests control the clock.
 */
export async function getListMetrics(
  userId: string,
  listId: string,
  query: MetricsQuery,
  now = Date.now(),
) {
  return db.$transaction(async (tx) => {
    if (!(await readListAccess(tx, userId, listId))) throw notFound("List");
    const stages = await tx.boardColumn.findMany({
      where: { listId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        category: true,
        wipLimit: true,
        isCommitmentPoint: true,
      },
    });
    const { tasks, titles } = await loadTasks(tx, { listId }, query);
    const metrics = computeMetrics({
      tasks,
      from: query.from,
      to: query.to,
      now,
      ...engineOptions(startedStages(stages)),
      bucket: (stageId, category) => stageId ?? `removed:${category}`,
      order: stages.map((s) => s.id),
    });
    return { scope: "list" as const, ...metrics, stages, titles };
  });
}

/**
 * The flow metrics of every list in a space together. Stages differ from list to list, so the
 * groups are the categories: to do, active, waiting, done, discarded.
 */
export async function getSpaceMetrics(
  userId: string,
  spaceId: string,
  query: MetricsQuery,
  now = Date.now(),
) {
  return db.$transaction(async (tx) => {
    const space = await tx.space.findUnique({
      where: { id: spaceId },
      select: {
        name: true,
        workspaceId: true,
        isPrivate: true,
        members: { where: { userId }, select: { userId: true } },
        workspace: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
      },
    });
    const role = space?.workspace.members[0]?.role;
    if (
      !space ||
      !role ||
      !canSeeSpace(role, space, space.members.length > 0)
    ) {
      throw notFound("Space");
    }
    const stages = await tx.boardColumn.findMany({
      where: { list: { spaceId } },
      select: {
        id: true,
        position: true,
        category: true,
        isCommitmentPoint: true,
        listId: true,
      },
    });
    // The commitment point is per list.
    const started = new Set<string>();
    for (const listId of new Set(stages.map((s) => s.listId))) {
      for (const id of startedStages(stages.filter((s) => s.listId === listId)))
        started.add(id);
    }
    const { tasks, titles } = await loadTasks(tx, { list: { spaceId } }, query);
    const metrics = computeMetrics({
      tasks,
      from: query.from,
      to: query.to,
      now,
      ...engineOptions(started),
      bucket: (_stageId, category) => category,
      order: CATEGORIES,
    });
    return {
      scope: "space" as const,
      space: { id: spaceId, name: space.name, workspaceId: space.workspaceId },
      ...metrics,
      titles,
    };
  });
}
