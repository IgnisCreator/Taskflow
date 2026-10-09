import type { ProjectRole } from "@/generated/prisma/enums";

export type ProjectAction =
  | "project:view"
  | "project:edit"
  | "project:delete"
  | "member:manage"
  | "task:write";

/** Who is asking, relative to one project. The owner always holds an ADMIN membership. */
export type Actor = { role: ProjectRole; isOwner: boolean };

// Source of truth for permissions (matrix in the consolidated plan, section 5).
// `task:write` covers create, edit, assign and delete (and, in TF-06, move).
export function can(actor: Actor, action: ProjectAction): boolean {
  switch (action) {
    case "project:view":
      return true;
    case "project:edit":
    case "member:manage":
      return actor.role === "ADMIN";
    case "task:write":
      return actor.role !== "VIEWER";
    case "project:delete":
      return actor.isOwner;
  }
}

/**
 * Adding, changing or removing a member.
 * - `from`: the target's current role (absent when adding); `to`: the new role (absent when removing).
 * - Owner and ADMIN manage MEMBER and VIEWER; only the owner may touch an ADMIN (grant, change,
 *   remove, including an ADMIN acting on themselves). Nobody can touch the owner.
 */
export function canManageMember(
  actor: Actor,
  change: { from?: ProjectRole; to?: ProjectRole; targetIsOwner: boolean },
): boolean {
  if (change.targetIsOwner) return false;
  if (actor.role !== "ADMIN") return false;
  const touchesAdmin = change.from === "ADMIN" || change.to === "ADMIN";
  return touchesAdmin ? actor.isOwner : true;
}
