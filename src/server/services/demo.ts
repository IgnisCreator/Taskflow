import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";
import {
  DEMO_LABELS,
  DEMO_PEOPLE,
  generateDemo,
  type DemoTask,
} from "@/lib/demo-data";
import { DAY_MS } from "@/lib/metrics";
import { SYSTEM_TEMPLATES } from "@/lib/workflow";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { DEFAULT_TYPES } from "@/server/services/catalog";

export const DEMO_DOMAIN = "demo.taskflow.test";
export const DEMO_VISITOR_EMAIL = `visitor@${DEMO_DOMAIN}`;
const DEMO_WORKSPACE = "Acme Product Team";

/** The demo is off unless the deployment turns it on. */
export const demoEnabled = () => process.env.DEMO_ENABLED === "1";

/** The visitor's password is derived from the server secret: nobody knows it, nothing stores it in clear. */
export const demoPassword = () =>
  createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update("demo-visitor-password")
    .digest("hex");

const slug = (name: string) => name.split(" ")[0]!.toLowerCase();

/**
 * The made-up teammates (they cannot sign in: no password) and the read-only visitor (can, with the
 * derived password). Idempotent, and the only users the demo ever touches are the ones with isDemo.
 */
async function ensureDemoUsers() {
  const people = new Map<number, string>();
  for (const [index, person] of DEMO_PEOPLE.entries()) {
    const id = `demo-${slug(person.name)}`;
    await db.user.upsert({
      where: { id },
      create: {
        id,
        name: person.name,
        email: `${slug(person.name)}@${DEMO_DOMAIN}`,
        emailVerified: true,
        isDemo: true,
      },
      update: { name: person.name },
    });
    people.set(index, id);
  }
  const visitor = await db.user.upsert({
    where: { email: DEMO_VISITOR_EMAIL },
    create: {
      id: "demo-visitor",
      name: "Demo visitor",
      email: DEMO_VISITOR_EMAIL,
      emailVerified: true,
      isDemo: true,
    },
    update: { isDemo: true },
  });
  const credential = await db.account.findFirst({
    where: { userId: visitor.id, providerId: "credential" },
    select: { id: true },
  });
  if (!credential) {
    const context = await auth.$context;
    await db.account.create({
      data: {
        id: randomUUID(),
        accountId: visitor.id,
        providerId: "credential",
        userId: visitor.id,
        password: await context.password.hash(demoPassword()),
      },
    });
  }
  return { people, visitorId: visitor.id };
}

const taskRow = (
  task: DemoTask,
  extra: {
    id: string;
    listId: string;
    columnId: string;
    position: number;
    typeId: string | null;
    createdById: string;
  },
) => ({
  ...extra,
  title: task.title,
  priority: task.priority,
  blockedReason: task.blockedReason,
  dueDate: task.dueDate ? new Date(`${task.dueDate}T00:00:00Z`) : null,
  createdAt: new Date(task.createdAt),
});

/**
 * Replaces the sample workspace with a fresh one whose history ends yesterday. The only rows it
 * deletes are the workspace marked isDemo (and what hangs from it); real workspaces are never read.
 */
export async function regenerateDemo(now = Date.now()) {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const lists = generateDemo(today);
  const { people, visitorId } = await ensureDemoUsers();

  return db.$transaction(
    async (tx) => {
      // Two regenerations at once (the daily job and a first visitor) wait for each other.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('demo-regenerate'))`;
      await tx.workspace.deleteMany({ where: { isDemo: true } });

      const workspace = await tx.workspace.create({
        data: {
          name: DEMO_WORKSPACE,
          isDemo: true,
          members: {
            create: [
              ...DEMO_PEOPLE.map((p, i) => ({
                userId: people.get(i)!,
                role: p.role,
              })),
              { userId: visitorId, role: "GUEST" as const },
            ],
          },
          types: { create: DEFAULT_TYPES.map((name) => ({ name })) },
          labels: { create: DEMO_LABELS.map((name) => ({ name })) },
        },
        select: {
          id: true,
          types: { select: { id: true, name: true } },
          labels: { select: { id: true, name: true } },
        },
      });
      const typeId = new Map(workspace.types.map((t) => [t.name, t.id]));
      const labelId = new Map(workspace.labels.map((l) => [l.name, l.id]));

      const spaces = new Map<string, string>();
      let tasks = 0;
      let events = 0;
      for (const list of lists) {
        if (!spaces.has(list.space)) {
          const space = await tx.space.create({
            data: { workspaceId: workspace.id, name: list.space },
            select: { id: true },
          });
          // A guest sees only the spaces they are listed in.
          await tx.spaceMember.create({
            data: {
              spaceId: space.id,
              workspaceId: workspace.id,
              userId: visitorId,
            },
          });
          spaces.set(list.space, space.id);
        }
        const template = SYSTEM_TEMPLATES[list.template]!;
        const created = await tx.list.create({
          data: {
            name: list.name,
            spaceId: spaces.get(list.space)!,
            columns: {
              create: template.stages.map((stage, position) => ({
                name: stage.name,
                position,
                category: stage.category,
                isCommitmentPoint: stage.isCommitmentPoint,
                wipLimit: list.wipLimits[stage.name] ?? stage.wipLimit,
                policy: stage.policy,
              })),
            },
          },
          select: {
            id: true,
            columns: { select: { id: true, name: true, category: true } },
          },
        });
        const column = new Map(created.columns.map((c) => [c.name, c]));
        const positions = new Map<string, number>();

        const rows = list.tasks.map((task) => {
          const col = column.get(task.stage)!;
          const position = positions.get(col.id) ?? 0;
          positions.set(col.id, position + 1);
          return {
            task,
            row: taskRow(task, {
              id: randomUUID(),
              listId: created.id,
              columnId: col.id,
              position,
              typeId: typeId.get(task.type) ?? null,
              createdById: people.get(task.events[0]!.actor)!,
            }),
          };
        });
        await tx.task.createMany({ data: rows.map((r) => r.row) });
        await tx.taskAssignee.createMany({
          data: rows.flatMap(({ task, row }) =>
            task.assignees.map((a) => ({
              taskId: row.id,
              userId: people.get(a)!,
            })),
          ),
        });
        await tx.taskLabel.createMany({
          data: rows.flatMap(({ task, row }) =>
            task.labels.map((l) => ({
              taskId: row.id,
              labelId: labelId.get(l)!,
            })),
          ),
        });
        const history = rows.flatMap(({ task, row }) =>
          task.events.map((e) => ({
            taskId: row.id,
            listId: created.id,
            type: e.type,
            fromStageId: e.fromStage ? column.get(e.fromStage)!.id : null,
            toStageId: column.get(e.stage)!.id,
            fromCategory: e.fromStage
              ? column.get(e.fromStage)!.category
              : null,
            toCategory: column.get(e.stage)!.category,
            actorId: people.get(e.actor)!,
            at: new Date(e.at),
          })),
        );
        await tx.taskEvent.createMany({ data: history });
        tasks += rows.length;
        events += history.length;
      }
      return { workspaceId: workspace.id, tasks, events };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/** The sample workspace's id, building it the first time (a fresh deployment before the daily job). */
export async function ensureDemo() {
  await ensureDemoUsers();
  const existing = await db.workspace.findFirst({
    where: { isDemo: true },
    select: { id: true },
  });
  return existing?.id ?? (await regenerateDemo()).workspaceId;
}
