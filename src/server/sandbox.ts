import "server-only";
import { ApiError } from "@/server/http";
import type { Tx } from "@/server/locks";

/** What one demo sandbox may hold, so a visitor cannot fill the free database. Real workspaces have no such limit. */
export const SANDBOX_CAPS = {
  tasks: 300,
  comments: 300,
  lists: 10,
  spaces: 5,
} as const;

/** Called before creating one more `kind` in a workspace: refuses (409) when it is a sandbox that is full. */
export async function sandboxRoom(
  tx: Tx,
  workspaceId: string,
  kind: keyof typeof SANDBOX_CAPS,
) {
  const sandbox = await tx.workspaceMember.findFirst({
    where: {
      workspaceId,
      role: "OWNER",
      user: { sandboxUntil: { not: null } },
    },
    select: { userId: true },
  });
  if (!sandbox) return;
  const inWorkspace = { space: { workspaceId } };
  const count = {
    tasks: () => tx.task.count({ where: { list: inWorkspace } }),
    comments: () =>
      tx.comment.count({ where: { task: { list: inWorkspace } } }),
    lists: () => tx.list.count({ where: inWorkspace }),
    spaces: () => tx.space.count({ where: { workspaceId } }),
  }[kind];
  if ((await count()) >= SANDBOX_CAPS[kind]) {
    throw new ApiError(
      409,
      "LIMIT_REACHED",
      `The demo has room for at most ${SANDBOX_CAPS[kind]} ${kind}`,
    );
  }
}
