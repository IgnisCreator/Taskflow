import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { can, canSeeSpace, type WorkspaceAction } from "@/server/policies";

export type Tx = Prisma.TransactionClient;

export const notFound = (what: string) =>
  new ApiError(404, "NOT_FOUND", `${what} not found`);
export const forbidden = () => new ApiError(403, "FORBIDDEN", "Not allowed");

export type WorkspaceActor = { role: WorkspaceRole; workspaceId: string };
export type ListActor = WorkspaceActor & { spaceId: string };

/**
 * What `userId` may do with a list. Null when the list does not exist, the user is not in its
 * workspace, or its space is hidden from them: all reported as 404, never 403.
 */
export async function readListAccess(
  tx: Tx,
  userId: string,
  listId: string,
): Promise<(ListActor & { boardVersion: number }) | null> {
  const list = await tx.list.findUnique({
    where: { id: listId },
    select: {
      boardVersion: true,
      space: {
        select: {
          id: true,
          isPrivate: true,
          workspaceId: true,
          members: { where: { userId }, select: { userId: true } },
          workspace: {
            select: { members: { where: { userId }, select: { role: true } } },
          },
        },
      },
    },
  });
  const member = list?.space.workspace.members[0];
  if (!list || !member) return null;
  if (!canSeeSpace(member.role, list.space, list.space.members.length > 0)) {
    return null;
  }
  return {
    boardVersion: list.boardVersion,
    role: member.role,
    workspaceId: list.space.workspaceId,
    spaceId: list.space.id,
  };
}

/**
 * The only way to change anything inside a list (its tasks, columns, name).
 *
 * 1. One UPDATE bumps `boardVersion` only if the caller is in the workspace AND the version matches.
 *    It also holds the list row until commit, so every write to a list is serialised.
 * 2. Only then are the role and the access read, so a demotion that committed first is honoured.
 * 3. Throwing anywhere rolls back everything, including the version bump.
 *
 * A hidden or missing list is 404, checked before the version so a 409 never reveals it; a stale
 * version is 409; a missing permission is 403.
 */
export async function withListLock<T>(
  userId: string,
  listId: string,
  expectedBoardVersion: number,
  action: WorkspaceAction,
  work: (tx: Tx, actor: ListActor) => Promise<T>,
): Promise<{ result: T; boardVersion: number }> {
  return db.$transaction(async (tx) => {
    const locked = await tx.list.updateMany({
      where: {
        id: listId,
        boardVersion: expectedBoardVersion,
        space: { workspace: { members: { some: { userId } } } },
      },
      data: { boardVersion: { increment: 1 } },
    });
    const access = await readListAccess(tx, userId, listId);
    if (!access) throw notFound("List");
    if (locked.count === 0) {
      throw new ApiError(409, "BOARD_CONFLICT", "The board changed", {
        currentVersion: access.boardVersion,
      });
    }
    if (!can(access, action)) throw forbidden();

    const { boardVersion: _version, ...actor } = access;
    const result = await work(tx, actor);
    return { result, boardVersion: expectedBoardVersion + 1 };
  });
}

/**
 * Serialises changes to a workspace (members, structure): one UPDATE on the workspace row, guarded by
 * membership, holds it until commit, so for example the member limit cannot be raced. No version.
 */
export async function withWorkspaceLock<T>(
  userId: string,
  workspaceId: string,
  action: WorkspaceAction,
  work: (tx: Tx, actor: WorkspaceActor) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    const locked = await tx.workspace.updateMany({
      where: { id: workspaceId, members: { some: { userId } } },
      data: { updatedAt: new Date() },
    });
    if (locked.count === 0) throw notFound("Workspace");
    const { role } = await tx.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!can({ role }, action)) throw forbidden();
    return work(tx, { role, workspaceId });
  });
}

/** withWorkspaceLock for a change inside one space; a space the caller cannot see is 404. */
export async function withSpaceLock<T>(
  userId: string,
  spaceId: string,
  action: WorkspaceAction,
  work: (tx: Tx, actor: WorkspaceActor) => Promise<T>,
): Promise<T> {
  const space = await db.space.findUnique({
    where: { id: spaceId },
    select: { workspaceId: true },
  });
  if (!space) throw notFound("Space");
  return db.$transaction(async (tx) => {
    const locked = await tx.workspace.updateMany({
      where: { id: space.workspaceId, members: { some: { userId } } },
      data: { updatedAt: new Date() },
    });
    const current = await tx.space.findUnique({
      where: { id: spaceId },
      select: {
        isPrivate: true,
        members: { where: { userId }, select: { userId: true } },
        workspace: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
      },
    });
    const role = current?.workspace.members[0]?.role;
    if (
      locked.count === 0 ||
      !current ||
      !role ||
      !canSeeSpace(role, current, current.members.length > 0)
    ) {
      throw notFound("Space");
    }
    if (!can({ role }, action)) throw forbidden();
    return work(tx, { role, workspaceId: space.workspaceId });
  });
}
