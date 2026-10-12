import type { WorkspaceRole } from "@/generated/prisma/enums";

export type WorkspaceAction =
  | "workspace:edit" // name and role labels
  | "workspace:delete"
  | "member:manage"
  | "structure:manage" // spaces, folders, lists and who sees a private space
  | "task:write";

/** Who is asking, relative to one workspace. */
export type Actor = { role: WorkspaceRole };

const isAdmin = (role: WorkspaceRole) => role === "OWNER" || role === "ADMIN";

// Source of truth for permissions. `task:write` covers create, edit, assign, move and delete.
export function can(actor: Actor, action: WorkspaceAction): boolean {
  switch (action) {
    case "workspace:edit":
    case "member:manage":
    case "structure:manage":
      return isAdmin(actor.role);
    case "workspace:delete":
      return actor.role === "OWNER";
    case "task:write":
      return actor.role !== "GUEST";
  }
}

/**
 * Who sees a space (and everything in it). OWNER and ADMIN see every space; a MEMBER sees public
 * spaces and the private ones they are listed in; a GUEST only the spaces they are listed in.
 */
export function canSeeSpace(
  role: WorkspaceRole,
  space: { isPrivate: boolean },
  listed: boolean,
): boolean {
  if (isAdmin(role)) return true;
  if (role === "GUEST") return listed;
  return !space.isPrivate || listed;
}

/**
 * Adding, changing or removing a member.
 * - `from`: the target's current role (absent when adding); `to`: the new role (absent when removing).
 * - OWNER and ADMIN manage MEMBER and GUEST; only the OWNER may touch an ADMIN (grant, change,
 *   remove, including an ADMIN acting on themselves). Nobody touches the OWNER, and OWNER is never granted.
 */
export function canManageMember(
  actor: Actor,
  change: { from?: WorkspaceRole; to?: WorkspaceRole },
): boolean {
  if (change.from === "OWNER" || change.to === "OWNER") return false;
  if (!can(actor, "member:manage")) return false;
  const touchesAdmin = change.from === "ADMIN" || change.to === "ADMIN";
  return touchesAdmin ? actor.role === "OWNER" : true;
}
