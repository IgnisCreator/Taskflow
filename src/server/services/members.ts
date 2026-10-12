import "server-only";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { MAX_MEMBERS } from "@/lib/validations/workspaces";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import {
  forbidden,
  notFound,
  withWorkspaceLock,
  type Tx,
} from "@/server/locks";
import { canManageMember } from "@/server/policies";

type GrantableRole = Exclude<WorkspaceRole, "OWNER">;

const memberSelect = {
  userId: true,
  role: true,
  user: { select: { name: true, image: true } },
} as const;

// Never includes email, publicId or tokens.
const toView = ({
  user,
  ...member
}: {
  userId: string;
  role: WorkspaceRole;
  user: { name: string; image: string | null };
}) => ({ ...member, name: user.name, image: user.image });

export async function listMembers(userId: string, workspaceId: string) {
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, members: { some: { userId } } },
    select: {
      members: { select: memberSelect, orderBy: { user: { name: "asc" } } },
    },
  });
  if (!workspace) throw notFound("Workspace");
  return workspace.members.map(toView);
}

/**
 * Adds an existing user, found by exact email (there is no public sign-up and no user directory).
 * An unknown email is reported as such; the email itself is never echoed back.
 */
export async function addMember(
  userId: string,
  workspaceId: string,
  input: { email: string; role: GrantableRole },
) {
  return withWorkspaceLock(
    userId,
    workspaceId,
    "member:manage", // coarse gate; canManageMember below decides per role
    async (tx, actor) => {
      if (!canManageMember(actor, { to: input.role })) throw forbidden();
      const target = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (!target) {
        throw new ApiError(404, "USER_NOT_FOUND", "No user has that email");
      }
      const members = await tx.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true },
      });
      if (members.some((m) => m.userId === target.id)) {
        throw new ApiError(409, "MEMBER_EXISTS", "Already a member");
      }
      if (members.length >= MAX_MEMBERS) {
        throw new ApiError(
          409,
          "LIMIT_REACHED",
          `A workspace has at most ${MAX_MEMBERS} members`,
        );
      }
      return toView(
        await tx.workspaceMember.create({
          data: { workspaceId, userId: target.id, role: input.role },
          select: memberSelect,
        }),
      );
    },
  );
}

export async function changeMemberRole(
  userId: string,
  workspaceId: string,
  targetId: string,
  role: GrantableRole,
) {
  return withWorkspaceLock(
    userId,
    workspaceId,
    "member:manage",
    async (tx, actor) => {
      const from = await findRole(tx, workspaceId, targetId);
      if (!canManageMember(actor, { from, to: role })) throw forbidden();
      return toView(
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId: targetId } },
          data: { role },
          select: memberSelect,
        }),
      );
    },
  );
}

/**
 * Removes the member: un-assigns their tasks in this workspace and, through the foreign key, drops
 * their space memberships, all in one transaction.
 */
export async function removeMember(
  userId: string,
  workspaceId: string,
  targetId: string,
) {
  await withWorkspaceLock(
    userId,
    workspaceId,
    "member:manage",
    async (tx, actor) => {
      const from = await findRole(tx, workspaceId, targetId);
      if (!canManageMember(actor, { from })) throw forbidden();
      await tx.task.updateMany({
        where: { assigneeId: targetId, list: { space: { workspaceId } } },
        data: { assigneeId: null },
      });
      await tx.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId: targetId } },
      });
    },
  );
}

async function findRole(tx: Tx, workspaceId: string, targetId: string) {
  const target = await tx.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetId } },
    select: { role: true },
  });
  // A user who is not in this workspace (even if they exist elsewhere) is simply not found.
  if (!target) throw notFound("Member");
  return target.role;
}
