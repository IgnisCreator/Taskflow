import type { Role } from "@/lib/validations/workspaces";

const DEFAULT_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  GUEST: "Guest",
};

/**
 * The workspace's own name for a role, or the default one (in English, or in the language of
 * `defaults`: pass `t.roles`). Labels never change permissions.
 */
export const roleLabel = (
  labels: Record<string, string>,
  role: Role,
  defaults: Record<Role, string> = DEFAULT_LABEL,
) => labels[role] || defaults[role];
