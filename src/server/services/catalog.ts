import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { MAX_CATALOG, type Catalog } from "@/lib/validations/details";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { notFound, withWorkspaceLock, type Tx } from "@/server/locks";

/** The workspace lists of task types and labels share one set of operations. */
type Delegate = {
  count(args: object): Promise<number>;
  create(args: object): Promise<{ id: string; name: string }>;
  update(args: object): Promise<{ id: string; name: string }>;
  delete(args: object): Promise<unknown>;
  findUnique(args: object): Promise<{ workspaceId: string } | null>;
};
const table = (tx: Tx | typeof db, kind: Catalog) =>
  (kind === "types" ? tx.workItemType : tx.label) as unknown as Delegate;

const taken = () =>
  new ApiError(409, "NAME_TAKEN", "That name is already in use");
const isDuplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

export const DEFAULT_TYPES = ["Task", "Bug", "Feature", "Request"];

/** Types and labels of the workspace, for pickers (members only: others get 404). */
export async function listCatalog(userId: string, workspaceId: string) {
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, members: { some: { userId } } },
    select: {
      types: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      labels: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  if (!workspace) throw notFound("Workspace");
  return workspace;
}

export async function createCatalogItem(
  userId: string,
  workspaceId: string,
  kind: Catalog,
  name: string,
) {
  return withWorkspaceLock(
    userId,
    workspaceId,
    "structure:manage",
    async (tx) => {
      if (
        (await table(tx, kind).count({ where: { workspaceId } })) >=
        MAX_CATALOG[kind]
      ) {
        throw new ApiError(
          409,
          "LIMIT_REACHED",
          `A workspace has at most ${MAX_CATALOG[kind]} ${kind}`,
        );
      }
      try {
        return await table(tx, kind).create({
          data: { workspaceId, name },
          select: { id: true, name: true },
        });
      } catch (error) {
        throw isDuplicate(error) ? taken() : error;
      }
    },
  );
}

async function workspaceOf(kind: Catalog, itemId: string) {
  const row = await table(db, kind).findUnique({
    where: { id: itemId },
    select: { workspaceId: true },
  });
  if (!row) throw notFound(kind === "types" ? "Task type" : "Label");
  return row.workspaceId;
}

export async function renameCatalogItem(
  userId: string,
  kind: Catalog,
  itemId: string,
  name: string,
) {
  const workspaceId = await workspaceOf(kind, itemId);
  return withWorkspaceLock(
    userId,
    workspaceId,
    "structure:manage",
    async (tx) => {
      try {
        return await table(tx, kind).update({
          where: { id: itemId },
          data: { name },
          select: { id: true, name: true },
        });
      } catch (error) {
        throw isDuplicate(error) ? taken() : error;
      }
    },
  );
}

/** Deleting a type leaves its tasks without a type; deleting a label takes it off its tasks. */
export async function deleteCatalogItem(
  userId: string,
  kind: Catalog,
  itemId: string,
) {
  const workspaceId = await workspaceOf(kind, itemId);
  await withWorkspaceLock(userId, workspaceId, "structure:manage", (tx) =>
    table(tx, kind).delete({ where: { id: itemId } }),
  );
}
