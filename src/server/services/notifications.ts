import "server-only";
import { db } from "@/server/db";
import { canSeeSpace } from "@/server/policies";

/** What the user can still see: a notification outlives their access, so it is checked on every read. */
async function visibleTo(userId: string, resolved: boolean) {
  const rows = await db.notification.findMany({
    where: {
      userId,
      resolvedAt: resolved ? { not: null } : null,
      list: { space: { workspace: { members: { some: { userId } } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: resolved ? 20 : 200,
    select: {
      id: true,
      kind: true,
      message: true,
      createdAt: true,
      readAt: true,
      listId: true,
      list: {
        select: {
          name: true,
          space: {
            select: {
              isPrivate: true,
              members: { where: { userId }, select: { userId: true } },
              workspace: {
                select: {
                  members: { where: { userId }, select: { role: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return rows
    .filter(({ list: { space } }) =>
      canSeeSpace(
        space.workspace.members[0]!.role,
        space,
        space.members.length > 0,
      ),
    )
    .map(({ list, ...row }) => ({ ...row, listName: list.name }));
}

/** The open alerts, newest first, and the last twenty that stopped holding. */
export async function listNotifications(userId: string) {
  const [open, resolved] = await Promise.all([
    visibleTo(userId, false),
    visibleTo(userId, true),
  ]);
  return { open, resolved };
}

/** How many open alerts the user has not read (for the counter in the header). */
export async function unreadCount(userId: string) {
  return (await visibleTo(userId, false)).filter((n) => !n.readAt).length;
}

/** Marks one of the user's alerts as read, or all of them without an id. */
export async function markRead(userId: string, id?: string) {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
}
