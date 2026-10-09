import type { ProjectRole } from "@/generated/prisma/enums";

export type ProjectAction = "project:view" | "project:edit" | "project:delete";

/** Who is asking, relative to one project. The owner always holds an ADMIN membership. */
export type Actor = { role: ProjectRole; isOwner: boolean };

// Source of truth for project-level permissions (matrix in the consolidated plan, section 5).
// Member and task actions are added by TF-04/TF-05.
export function can(actor: Actor, action: ProjectAction): boolean {
  switch (action) {
    case "project:view":
      return true;
    case "project:edit":
      return actor.role === "ADMIN";
    case "project:delete":
      return actor.isOwner;
  }
}
