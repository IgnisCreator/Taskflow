import { describe, expect, it } from "vitest";
import { can, type Actor } from "../../src/server/policies";

const owner: Actor = { role: "ADMIN", isOwner: true };
const admin: Actor = { role: "ADMIN", isOwner: false };
const member: Actor = { role: "MEMBER", isOwner: false };
const viewer: Actor = { role: "VIEWER", isOwner: false };

describe("project permissions", () => {
  it.each([
    ["project:view", [true, true, true, true]],
    ["project:edit", [true, true, false, false]],
    ["project:delete", [true, false, false, false]],
  ] as const)("%s for owner, admin, member, viewer", (action, expected) => {
    expect([owner, admin, member, viewer].map((a) => can(a, action))).toEqual(
      expected,
    );
  });
});
