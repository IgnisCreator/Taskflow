import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";
import {
  DEMO_GUEST_SPACE,
  DEMO_LABELS,
  DEMO_PEOPLE,
  generateDemo,
  type DemoTask,
} from "@/lib/demo-data";
import { DAY_MS } from "@/lib/metrics";
import { catalogs, type Lang } from "@/lib/i18n";
import { localizeTemplate } from "@/lib/i18n/templates";
import { SYSTEM_TEMPLATES } from "@/lib/workflow";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import type { Tx } from "@/server/locks";
import { runAlerts } from "@/server/services/alerts";
import { DEFAULT_TYPES } from "@/server/services/catalog";

// The public demo gives every visitor a sandbox: a temporary user who owns a private copy of the sample
// workspace, deleted after SANDBOX_HOURS. The made-up teammates are shared by all sandboxes: they have
// no password, so nobody can sign in as them, and they are members of each workspace until it is deleted.

export const DEMO_DOMAIN = "demo.taskflow.test";
export const SANDBOX_HOURS = 24;
/** Sandboxes alive at once; more visitors than this are asked to come back later. */
export const MAX_SANDBOXES = 150;
const HOUR_MS = 3_600_000;

/** The demo is off unless the deployment turns it on. */
export const demoEnabled = () => process.env.DEMO_ENABLED === "1";

/** A sandbox user's password comes from the server secret and its id: nobody knows it, nothing keeps it in clear. */
export const sandboxPassword = (userId: string) =>
  createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update(`sandbox-password:${userId}`)
    .digest("hex");

const slug = (name: string) => name.split(" ")[0]!.toLowerCase();

/** The made-up teammates, created once and kept; the only users with isDemo. */
async function ensureTeammates() {
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
  return people;
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
 * The sample workspace, owned by `ownerId`, with a history that ends yesterday. Its names and words
 * come in `lang`; the simulation keys everything by the English names, so those are mapped by position.
 */
async function buildWorkspace(
  tx: Tx,
  ownerId: string,
  people: Map<number, string>,
  now: number,
  lang: Lang,
) {
  const text = catalogs[lang];
  const lists = generateDemo(
    Math.floor(now / DAY_MS) * DAY_MS,
    undefined,
    lang,
  );
  const workspace = await tx.workspace.create({
    data: {
      name: text.sample.workspace,
      members: {
        create: [
          { userId: ownerId, role: "OWNER" as const },
          ...DEMO_PEOPLE.map((p, i) => ({
            userId: people.get(i)!,
            role: p.role,
          })),
        ],
      },
      types: { create: text.defaults.types.map((name) => ({ name })) },
      labels: { create: text.sample.labels.map((name) => ({ name })) },
    },
    select: {
      id: true,
      types: { select: { id: true, name: true } },
      labels: { select: { id: true, name: true } },
    },
  });
  // The simulation says "Bug" and "urgent"; the workspace has them in `lang`, in the same order.
  const typeByName = new Map(workspace.types.map((t) => [t.name, t.id]));
  const typeId = new Map(
    DEFAULT_TYPES.map((name, i) => [
      name,
      typeByName.get(text.defaults.types[i]!),
    ]),
  );
  const labelByName = new Map(workspace.labels.map((l) => [l.name, l.id]));
  const labelId = new Map(
    DEMO_LABELS.map((name, i) => [
      name,
      labelByName.get(text.sample.labels[i]!),
    ]),
  );
  const guests = DEMO_PEOPLE.flatMap((p, i) =>
    p.role === "GUEST" ? [people.get(i)!] : [],
  );

  const spaces = new Map<string, string>();
  let tasks = 0;
  let events = 0;
  for (const list of lists) {
    if (!spaces.has(list.space)) {
      const space = await tx.space.create({
        data: {
          workspaceId: workspace.id,
          name: text.sample.spaces[list.space as "Software" | "Support"],
        },
        select: { id: true },
      });
      // A guest sees only the spaces they are listed in.
      if (list.space === DEMO_GUEST_SPACE) {
        await tx.spaceMember.createMany({
          data: guests.map((userId) => ({
            spaceId: space.id,
            workspaceId: workspace.id,
            userId,
          })),
        });
      }
      spaces.set(list.space, space.id);
    }
    const template = SYSTEM_TEMPLATES[list.template]!;
    const named = localizeTemplate(list.template, template, lang);
    const created = await tx.list.create({
      data: {
        name: text.sample.lists[list.name as "Platform" | "Customer requests"],
        spaceId: spaces.get(list.space)!,
        columns: {
          create: named.stages.map((stage, position) => ({
            name: stage.name,
            position,
            category: stage.category,
            isCommitmentPoint: stage.isCommitmentPoint,
            wipLimit:
              list.wipLimits[template.stages[position]!.name] ?? stage.wipLimit,
            policy: stage.policy,
          })),
        },
      },
      select: {
        id: true,
        columns: {
          orderBy: { position: "asc" },
          select: { id: true, name: true, category: true },
        },
      },
    });
    // The history names the English stages: they are the same columns, in the same order.
    const column = new Map(
      template.stages.map((s, i) => [s.name, created.columns[i]!]),
    );
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
        fromCategory: e.fromStage ? column.get(e.fromStage)!.category : null,
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
}

const TX = { timeout: 60_000, maxWait: 10_000 };

/** A new sandbox: the temporary user and its workspace, with the alerts of its lists already raised. */
export async function createSandbox(now = Date.now(), lang: Lang = "en") {
  const people = await ensureTeammates();
  const id = `sandbox-${randomUUID()}`;
  const email = `${id}@${DEMO_DOMAIN}`;
  const password = sandboxPassword(id);
  const hash = await (await auth.$context).password.hash(password);
  const built = await db.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id,
        name: "Demo visitor",
        email,
        emailVerified: true,
        sandboxUntil: new Date(now + SANDBOX_HOURS * HOUR_MS),
      },
    });
    await tx.account.create({
      data: {
        id: randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hash,
      },
    });
    return buildWorkspace(tx, id, people, now, lang);
  }, TX);
  await runAlerts(now, built.workspaceId);
  return { userId: id, email, password, ...built };
}

/** The visitor's workspace is replaced by a fresh one; the user and the deadline stay. */
export async function restartSandbox(
  userId: string,
  now = Date.now(),
  lang: Lang = "en",
) {
  const people = await ensureTeammates();
  const built = await db.$transaction(async (tx) => {
    const owner = await tx.user.findFirst({
      where: { id: userId, sandboxUntil: { gt: new Date(now) } },
      select: { id: true },
    });
    if (!owner) return null;
    await tx.workspace.deleteMany({
      where: { members: { some: { userId, role: "OWNER" } } },
    });
    return buildWorkspace(tx, userId, people, now, lang);
  }, TX);
  if (built) await runAlerts(now, built.workspaceId);
  return built;
}

/** The workspace of a live sandbox user, or null (also for anyone who is not a sandbox user). */
export async function sandboxWorkspaceId(userId: string, now = Date.now()) {
  const member = await db.workspaceMember.findFirst({
    where: {
      userId,
      role: "OWNER",
      user: { sandboxUntil: { gt: new Date(now) } },
    },
    select: { workspaceId: true },
  });
  return member?.workspaceId ?? null;
}

export const aliveSandboxes = (now = Date.now()) =>
  db.user.count({ where: { sandboxUntil: { gt: new Date(now) } } });

/**
 * Deletes sandboxes: first the workspaces their users own, then the users (sessions, accounts and
 * alerts go with them). Only users with a deadline are ever selected; real workspaces, real users and
 * the made-up teammates are never read.
 */
async function deleteSandboxes(
  where: {
    id?: string;
    sandboxUntil: { lt: Date } | { not: null };
  },
  limit?: number,
) {
  const users = await db.user.findMany({
    where,
    select: { id: true },
    take: limit,
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return 0;
  await db.workspace.deleteMany({
    where: { members: { some: { userId: { in: ids }, role: "OWNER" } } },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** The sandboxes whose 24 hours are over (`limit` caps the work on a visitor's request; the daily job takes all). */
export const purgeSandboxes = (now = Date.now(), limit?: number) =>
  deleteSandboxes({ sandboxUntil: { lt: new Date(now) } }, limit);

/** The visitor leaves: their sandbox is deleted now. Anyone who is not a sandbox user is left alone. */
export const leaveSandbox = (userId: string) =>
  deleteSandboxes({ id: userId, sandboxUntil: { not: null } });
