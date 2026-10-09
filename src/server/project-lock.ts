import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { can, type Actor, type ProjectAction } from "@/server/policies";

export const projectNotFound = () =>
  new ApiError(404, "NOT_FOUND", "Project not found");
export const forbidden = () => new ApiError(403, "FORBIDDEN", "Not allowed");

/**
 * The only way to change anything inside a project.
 *
 * 1. One UPDATE bumps `boardVersion` only if the caller is a member AND the version matches. It also
 *    holds the project row until commit, so every write to a project is serialised.
 * 2. Only then is the caller's role read, so a demotion or removal that committed first is honoured
 *    (no check-then-act race).
 * 3. Throwing anywhere rolls back everything, including the version bump.
 *
 * Non-members get 404 (never 403), a stale version gets 409, a missing permission gets 403.
 */
export async function withProjectLock<T>(
  userId: string,
  projectId: string,
  expectedBoardVersion: number,
  action: ProjectAction,
  work: (tx: Prisma.TransactionClient, actor: Actor) => Promise<T>,
): Promise<{ result: T; boardVersion: number }> {
  return db.$transaction(async (tx) => {
    const locked = await tx.project.updateMany({
      where: {
        id: projectId,
        boardVersion: expectedBoardVersion,
        members: { some: { userId } },
      },
      data: { boardVersion: { increment: 1 } },
    });
    if (locked.count === 0) {
      const current = await tx.project.findFirst({
        where: { id: projectId, members: { some: { userId } } },
        select: { boardVersion: true },
      });
      if (!current) throw projectNotFound();
      throw new ApiError(409, "BOARD_CONFLICT", "The board changed", {
        currentVersion: current.boardVersion,
      });
    }

    const row = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: { where: { userId }, select: { role: true } },
      },
    });
    const actor: Actor = {
      role: row.members[0]!.role,
      isOwner: row.ownerId === userId,
    };
    if (!can(actor, action)) throw forbidden();

    const result = await work(tx, actor);
    return { result, boardVersion: expectedBoardVersion + 1 };
  });
}
