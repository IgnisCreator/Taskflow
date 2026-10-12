import { z } from "zod";

// Unknown keys are rejected (not stripped): ids, roles of others, versions... never come in by accident.
const name = z.string().trim().min(1).max(80);
// Empty text is stored as null.
const description = z
  .string()
  .trim()
  .max(5000)
  .transform((value) => value || null);
const expectedBoardVersion = z.number().int().min(0);
const id = z.string().min(1).max(100);

export const MAX_MEMBERS = 20;

/** Roles that can be granted. OWNER belongs to the creator and is never granted. */
export const grantableRole = z.enum(["ADMIN", "MEMBER", "GUEST"]);
export const ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
export type Role = (typeof ROLES)[number];

/** A workspace's own name for each role, e.g. { GUEST: "Client" }. Empty means the default. */
export const roleLabelsSchema = z
  .strictObject({
    OWNER: z.string().trim().max(30).optional(),
    ADMIN: z.string().trim().max(30).optional(),
    MEMBER: z.string().trim().max(30).optional(),
    GUEST: z.string().trim().max(30).optional(),
  })
  .transform((labels) =>
    Object.fromEntries(Object.entries(labels).filter(([, value]) => value)),
  );

export const createWorkspaceSchema = z.strictObject({ name });

export const updateWorkspaceSchema = z
  .strictObject({
    name: name.optional(),
    roleLabels: roleLabelsSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.roleLabels !== undefined, {
    message: "Provide a name or role labels",
  });

export const addMemberSchema = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  role: grantableRole,
});

export const changeMemberRoleSchema = z.strictObject({ role: grantableRole });

export const createSpaceSchema = z.strictObject({
  name,
  isPrivate: z.boolean().default(false),
});

/** "system:<key>" or the id of one of the workspace templates; null clears the default. */
const templateRef = z.string().min(1).max(100).nullable();

export const updateSpaceSchema = z
  .strictObject({
    name: name.optional(),
    isPrivate: z.boolean().optional(),
    defaultTemplate: templateRef.optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.isPrivate !== undefined ||
      v.defaultTemplate !== undefined,
    { message: "Provide a name, the privacy or a default template" },
  );

export const spaceMemberSchema = z.strictObject({ userId: id });

export const folderSchema = z.strictObject({ name });

export const updateFolderSchema = z
  .strictObject({
    name: name.optional(),
    defaultTemplate: templateRef.optional(),
  })
  .refine((v) => v.name !== undefined || v.defaultTemplate !== undefined, {
    message: "Provide a name or a default template",
  });

export const createListSchema = z.strictObject({
  spaceId: id,
  folderId: id.nullable().default(null),
  /** Flow of the new list; without it, the folder or space default (else generic). */
  templateId: id.nullable().default(null),
  name,
  description: description.optional().transform((value) => value ?? null),
});

export const updateListSchema = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    expectedBoardVersion,
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: "Provide a name or a description",
  });

/** Body of every list write that only needs the version (deleting a list). */
export const versionedSchema = z.strictObject({ expectedBoardVersion });

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
