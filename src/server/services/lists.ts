import "server-only";
import type {
  CreateListInput,
  UpdateListInput,
} from "@/lib/validations/workspaces";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { readListAccess, withListLock, withSpaceLock } from "@/server/locks";

const DEFAULT_COLUMNS = ["To do", "In progress", "In review", "Done"];

const listSelect = {
  id: true,
  name: true,
  description: true,
  boardVersion: true,
  spaceId: true,
  folderId: true,
  createdAt: true,
} as const;

/** The list with its four default columns, in a space (optionally one of its folders). */
export async function createList(userId: string, input: CreateListInput) {
  const { spaceId, folderId, ...data } = input;
  return withSpaceLock(userId, spaceId, "structure:manage", async (tx) => {
    if (folderId) {
      const folder = await tx.folder.findFirst({
        where: { id: folderId, spaceId },
        select: { id: true },
      });
      if (!folder) {
        throw new ApiError(
          400,
          "INVALID_FOLDER",
          "The folder is not part of this space",
        );
      }
    }
    return tx.list.create({
      data: {
        ...data,
        spaceId,
        folderId,
        columns: {
          create: DEFAULT_COLUMNS.map((name, position) => ({ name, position })),
        },
      },
      select: listSelect,
    });
  });
}

/** A list the caller cannot see is reported as missing (null), never as forbidden. */
export async function getList(userId: string, listId: string) {
  return db.$transaction(async (tx) => {
    const access = await readListAccess(tx, userId, listId);
    if (!access) return null;
    const list = await tx.list.findUniqueOrThrow({
      where: { id: listId },
      select: { ...listSelect, space: { select: { workspaceId: true } } },
    });
    const { space, ...rest } = list;
    return { ...rest, workspaceId: space.workspaceId, role: access.role };
  });
}

export async function updateList(
  userId: string,
  listId: string,
  { expectedBoardVersion, ...changes }: UpdateListInput,
) {
  const { result, boardVersion } = await withListLock(
    userId,
    listId,
    expectedBoardVersion,
    "structure:manage",
    (tx) =>
      tx.list.update({
        where: { id: listId },
        data: changes,
        select: listSelect,
      }),
  );
  return { ...result, boardVersion };
}

export async function deleteList(
  userId: string,
  listId: string,
  expectedBoardVersion: number,
) {
  await withListLock(
    userId,
    listId,
    expectedBoardVersion,
    "structure:manage",
    (tx) => tx.list.delete({ where: { id: listId } }),
  );
}
