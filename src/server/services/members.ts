import "server-only";
import type { ProjectRole } from "@/generated/prisma/enums";
import { MAX_MEMBERS } from "@/lib/validations/members";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { canManageMember } from "@/server/policies";
import {
  forbidden,
  projectNotFound,
  withProjectLock,
} from "@/server/project-lock";

const memberSelect = {
  userId: true,
  role: true,
  user: { select: { name: true, image: true } },
} as const;

type MemberRow = {
  userId: string;
  role: ProjectRole;
  user: { name: string; image: string | null };
};

// Never includes email, publicId or tokens.
const toView = (row: MemberRow, ownerId: string) => ({
  userId: row.userId,
  name: row.user.name,
  image: row.user.image,
  role: row.role,
  isOwner: row.userId === ownerId,
});

export async function listMembers(userId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    select: {
      ownerId: true,
      members: { select: memberSelect, orderBy: { user: { name: "asc" } } },
    },
  });
  if (!project) throw projectNotFound();
  return project.members.map((row) => toView(row, project.ownerId));
}

export async function addMember(
  userId: string,
  projectId: string,
  input: { publicId: string; role: ProjectRole; expectedBoardVersion: number },
) {
  const { result, boardVersion } = await withProjectLock(
    userId,
    projectId,
    input.expectedBoardVersion,
    "member:manage", // coarse gate; canManageMember below decides per role
    async (tx, actor) => {
      if (!canManageMember(actor, { to: input.role, targetIsOwner: false })) {
        throw forbidden();
      }
      const target = await tx.user.findUnique({
        where: { publicId: input.publicId },
        select: { id: true },
      });
      if (!target) {
        throw new ApiError(404, "USER_NOT_FOUND", "No user has that public ID");
      }
      const members = await tx.projectMember.findMany({
        where: { projectId },
        select: { userId: true },
      });
      if (members.some((m) => m.userId === target.id)) {
        throw new ApiError(409, "MEMBER_EXISTS", "Already a member");
      }
      if (members.length >= MAX_MEMBERS) {
        throw new ApiError(
          409,
          "LIMIT_REACHED",
          `A project has at most ${MAX_MEMBERS} members`,
        );
      }
      return tx.projectMember.create({
        data: { projectId, userId: target.id, role: input.role },
        select: memberSelect,
      });
    },
  );
  const owner = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { ownerId: true },
  });
  return { ...toView(result, owner.ownerId), boardVersion };
}

export async function changeMemberRole(
  userId: string,
  projectId: string,
  targetId: string,
  input: { role: ProjectRole; expectedBoardVersion: number },
) {
  const { result, boardVersion } = await withProjectLock(
    userId,
    projectId,
    input.expectedBoardVersion,
    "member:manage",
    async (tx, actor) => {
      const { target, ownerId } = await findTarget(tx, projectId, targetId);
      if (
        !canManageMember(actor, {
          from: target.role,
          to: input.role,
          targetIsOwner: targetId === ownerId,
        })
      ) {
        throw forbidden();
      }
      return tx.projectMember.update({
        where: { projectId_userId: { projectId, userId: targetId } },
        data: { role: input.role },
        select: memberSelect,
      });
    },
  );
  const owner = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { ownerId: true },
  });
  return { ...toView(result, owner.ownerId), boardVersion };
}

/** Un-assigns the member's tasks and removes the membership in the same transaction. */
export async function removeMember(
  userId: string,
  projectId: string,
  targetId: string,
  expectedBoardVersion: number,
) {
  await withProjectLock(
    userId,
    projectId,
    expectedBoardVersion,
    "member:manage",
    async (tx, actor) => {
      const { target, ownerId } = await findTarget(tx, projectId, targetId);
      if (
        !canManageMember(actor, {
          from: target.role,
          targetIsOwner: targetId === ownerId,
        })
      ) {
        throw forbidden();
      }
      await tx.task.updateMany({
        where: { projectId, assigneeId: targetId },
        data: { assigneeId: null },
      });
      await tx.projectMember.delete({
        where: { projectId_userId: { projectId, userId: targetId } },
      });
    },
  );
}

async function findTarget(
  tx: Parameters<Parameters<typeof withProjectLock>[4]>[0],
  projectId: string,
  targetId: string,
) {
  const [target, project] = await Promise.all([
    tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetId } },
      select: { role: true },
    }),
    tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { ownerId: true },
    }),
  ]);
  // A user who is not in this project (even if they exist elsewhere) is simply not found.
  if (!target) throw new ApiError(404, "NOT_FOUND", "Member not found");
  return { target, ownerId: project.ownerId };
}
