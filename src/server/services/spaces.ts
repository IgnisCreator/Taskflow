import "server-only";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import {
  notFound,
  withSpaceLock,
  withWorkspaceLock,
  type Tx,
} from "@/server/locks";

const spaceSelect = { id: true, name: true, isPrivate: true } as const;

/**
 * What the settings page of a space needs: the space, its folders, who is listed in it and the
 * workspace members who could be. Only for OWNER and ADMIN; anyone else gets null (404).
 */
export async function getSpaceSettings(userId: string, spaceId: string) {
  const space = await db.space.findFirst({
    where: {
      id: spaceId,
      workspace: {
        members: { some: { userId, role: { in: ["OWNER", "ADMIN"] } } },
      },
    },
    select: {
      ...spaceSelect,
      workspaceId: true,
      folders: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
      },
      members: { select: { userId: true } },
      workspace: {
        select: {
          members: {
            orderBy: { user: { name: "asc" } },
            select: {
              userId: true,
              role: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!space) return null;
  const listed = new Set(space.members.map((m) => m.userId));
  return {
    id: space.id,
    name: space.name,
    isPrivate: space.isPrivate,
    workspaceId: space.workspaceId,
    folders: space.folders,
    people: space.workspace.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      role: m.role,
      listed: listed.has(m.userId),
    })),
  };
}

export async function createSpace(
  userId: string,
  workspaceId: string,
  input: { name: string; isPrivate: boolean },
) {
  return withWorkspaceLock(userId, workspaceId, "structure:manage", (tx) =>
    tx.space.create({
      data: { ...input, workspaceId },
      select: spaceSelect,
    }),
  );
}

export async function updateSpace(
  userId: string,
  spaceId: string,
  changes: { name?: string; isPrivate?: boolean },
) {
  return withSpaceLock(userId, spaceId, "structure:manage", (tx) =>
    tx.space.update({
      where: { id: spaceId },
      data: changes,
      select: spaceSelect,
    }),
  );
}

/** Deletes the space with its folders, lists and tasks (cascade). */
export async function deleteSpace(userId: string, spaceId: string) {
  await withSpaceLock(userId, spaceId, "structure:manage", (tx) =>
    tx.space.delete({ where: { id: spaceId } }),
  );
}

/** Who is listed in a space (what makes a private space visible to MEMBERs and any space to GUESTs). */
export async function listSpaceMembers(userId: string, spaceId: string) {
  return withSpaceLock(userId, spaceId, "structure:manage", async (tx) => {
    const rows = await tx.spaceMember.findMany({
      where: { spaceId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  });
}

export async function addSpaceMember(
  userId: string,
  spaceId: string,
  targetId: string,
) {
  await withSpaceLock(
    userId,
    spaceId,
    "structure:manage",
    async (tx, { workspaceId }) => {
      const member = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetId } },
        select: { userId: true },
      });
      // Only people already in the workspace can be listed in one of its spaces.
      if (!member) throw notFound("Member");
      await tx.spaceMember.upsert({
        where: { spaceId_userId: { spaceId, userId: targetId } },
        create: { spaceId, workspaceId, userId: targetId },
        update: {},
      });
    },
  );
}

export async function removeSpaceMember(
  userId: string,
  spaceId: string,
  targetId: string,
) {
  await withSpaceLock(userId, spaceId, "structure:manage", (tx) =>
    tx.spaceMember.deleteMany({ where: { spaceId, userId: targetId } }),
  );
}

export async function createFolder(
  userId: string,
  spaceId: string,
  name: string,
) {
  return withSpaceLock(userId, spaceId, "structure:manage", (tx) =>
    tx.folder.create({
      data: { spaceId, name },
      select: { id: true, name: true },
    }),
  );
}

export async function renameFolder(
  userId: string,
  folderId: string,
  name: string,
) {
  return withFolder(userId, folderId, (tx) =>
    tx.folder.update({
      where: { id: folderId },
      data: { name },
      select: { id: true, name: true },
    }),
  );
}

/** Deletes the folder with its lists and their tasks (cascade). */
export async function deleteFolder(userId: string, folderId: string) {
  await withFolder(userId, folderId, (tx) =>
    tx.folder.delete({ where: { id: folderId } }),
  );
}

/** A folder of a space the caller cannot see is reported as missing, like the space itself. */
async function withFolder<T>(
  userId: string,
  folderId: string,
  work: (tx: Tx) => Promise<T>,
) {
  const folder = await db.folder.findUnique({
    where: { id: folderId },
    select: { spaceId: true },
  });
  if (!folder) throw notFound("Folder");
  try {
    return await withSpaceLock(
      userId,
      folder.spaceId,
      "structure:manage",
      work,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      throw notFound("Folder");
    throw error;
  }
}
