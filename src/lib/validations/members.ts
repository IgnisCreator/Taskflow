import { z } from "zod";

// OWNER is not a role: ownership comes from Project.ownerId.
const role = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
const expectedBoardVersion = z.number().int().min(0);

export const addMemberSchema = z.strictObject({
  publicId: z.uuid(),
  role,
  expectedBoardVersion,
});

export const changeMemberRoleSchema = z.strictObject({
  role,
  expectedBoardVersion,
});

export const MAX_MEMBERS = 5;
