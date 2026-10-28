import "server-only";
import { ALERT_WINDOW_DAYS, detectAlerts, type Alert } from "@/lib/alerts";
import { DAY_MS } from "@/lib/metrics";
import { db } from "@/server/db";
import type { Tx } from "@/server/locks";
import { can, canSeeSpace } from "@/server/policies";
import { listMetricsData } from "@/server/services/metrics";

/**
 * The daily job: for every list, work out which alerts hold today and make the notifications say
 * the same. A condition that holds and has no open notification gets one; an open notification whose
 * condition no longer holds is resolved. Running it twice in a row changes nothing.
 */
export async function runAlerts(now = Date.now()) {
  const lists = await loadLists();
  const totals = { lists: lists.length, created: 0, resolved: 0, failed: 0 };
  for (const list of lists) {
    try {
      const done = await db.$transaction((tx) => reconcile(tx, list, now));
      totals.created += done.created;
      totals.resolved += done.resolved;
    } catch (error) {
      // One broken list must not stop the others from being checked.
      totals.failed++;
      console.error(
        "Alerts failed for a list:",
        (error as Error).name,
        (error as { code?: string }).code,
      );
    }
  }
  return totals;
}

type ListToCheck = Awaited<ReturnType<typeof loadLists>>[number];
const loadLists = () =>
  db.list.findMany({
    select: {
      id: true,
      name: true,
      alertBandDays: true,
      alertWipDays: true,
      alertDropPercent: true,
      space: {
        select: {
          isPrivate: true,
          workspaceId: true,
          members: { select: { userId: true } },
          workspace: { select: { isDemo: true } },
        },
      },
    },
  });

async function reconcile(tx: Tx, list: ListToCheck, now: number) {
  // Two runs at once (a retry, two instances) wait for each other instead of both creating rows.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${list.id}))`;

  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const metrics = await listMetricsData(
    tx,
    list.id,
    { from: today - (ALERT_WINDOW_DAYS - 1) * DAY_MS, to: today },
    now,
  );
  const alerts = detectAlerts(metrics, metrics.stages, {
    bandDays: list.alertBandDays,
    wipDays: list.alertWipDays,
    dropPercent: list.alertDropPercent,
  });

  // Who can see this list: workspace members, by the same rule as the pages.
  const listed = new Set(list.space.members.map((m) => m.userId));
  const members = (
    await tx.workspaceMember.findMany({
      where: { workspaceId: list.space.workspaceId },
      select: { userId: true, role: true },
    })
  ).filter((m) => canSeeSpace(m.role, list.space, listed.has(m.userId)));
  const admins = members.filter((m) => can(m, "structure:manage"));
  const assignees = await tx.taskAssignee.findMany({
    where: { taskId: { in: alerts.flatMap((a) => a.taskId ?? []) } },
    select: { taskId: true, userId: true },
  });
  // In the public demo the read-only visitor (a guest) also sees every alert of the sample lists.
  const visitors = list.space.workspace.isDemo
    ? members.filter((m) => m.role === "GUEST").map((m) => m.userId)
    : [];
  const recipients = (alert: Alert) => [
    ...new Set([...intended(alert), ...visitors]),
  ];
  const intended = (alert: Alert) => {
    if (!alert.taskId) return admins.map((m) => m.userId);
    const own = assignees
      .filter(
        (a) =>
          a.taskId === alert.taskId &&
          members.some((m) => m.userId === a.userId),
      )
      .map((a) => a.userId);
    return own.length > 0 ? own : admins.map((m) => m.userId);
  };

  const wanted = new Map<string, { userId: string; alert: Alert }>();
  for (const alert of alerts) {
    for (const userId of recipients(alert))
      wanted.set(`${userId}|${alert.key}`, { userId, alert });
  }
  const open = await tx.notification.findMany({
    where: { listId: list.id, resolvedAt: null },
    select: { id: true, userId: true, key: true },
  });
  const have = new Set(open.map((n) => `${n.userId}|${n.key}`));

  const stale = open.filter((n) => !wanted.has(`${n.userId}|${n.key}`));
  await tx.notification.updateMany({
    where: { id: { in: stale.map((n) => n.id) } },
    data: { resolvedAt: new Date(now) },
  });
  const fresh = [...wanted.entries()].filter(([id]) => !have.has(id));
  await tx.notification.createMany({
    data: fresh.map(([, { userId, alert }]) => ({
      userId,
      listId: list.id,
      kind: alert.kind,
      key: alert.key,
      message: alert.message,
      createdAt: new Date(now),
    })),
  });
  return { created: fresh.length, resolved: stale.length };
}
