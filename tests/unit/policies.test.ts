import { describe, expect, it } from "vitest";
import { can, canManageMember, type Actor } from "../../src/server/policies";

const owner: Actor = { role: "ADMIN", isOwner: true };
const admin: Actor = { role: "ADMIN", isOwner: false };
const member: Actor = { role: "MEMBER", isOwner: false };
const viewer: Actor = { role: "VIEWER", isOwner: false };
const callers = [owner, admin, member, viewer];

describe("project permissions", () => {
  it.each([
    ["project:view", [true, true, true, true]],
    ["project:edit", [true, true, false, false]],
    ["project:delete", [true, false, false, false]],
    ["member:manage", [true, true, false, false]],
  ] as const)("%s for owner, admin, member, viewer", (action, expected) => {
    expect(callers.map((a) => can(a, action))).toEqual(expected);
  });
});

describe("managing members", () => {
  const cases = [
    ["add a MEMBER", { to: "MEMBER" }, [true, true, false, false]],
    ["add an ADMIN", { to: "ADMIN" }, [true, false, false, false]],
    [
      "change MEMBER to VIEWER",
      { from: "MEMBER", to: "VIEWER" },
      [true, true, false, false],
    ],
    [
      "demote an ADMIN",
      { from: "ADMIN", to: "MEMBER" },
      [true, false, false, false],
    ],
    ["remove a VIEWER", { from: "VIEWER" }, [true, true, false, false]],
    ["remove an ADMIN", { from: "ADMIN" }, [true, false, false, false]],
  ] as const;

  it.each(cases)(
    "%s: owner, admin, member, viewer",
    (_name, change, expected) => {
      expect(
        callers.map((a) =>
          canManageMember(a, { ...change, targetIsOwner: false }),
        ),
      ).toEqual(expected);
    },
  );

  it("nobody can touch the owner", () => {
    expect(
      callers.map((a) =>
        canManageMember(a, {
          from: "ADMIN",
          to: "VIEWER",
          targetIsOwner: true,
        }),
      ),
    ).toEqual([false, false, false, false]);
  });
});
