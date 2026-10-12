import { describe, expect, it } from "vitest";
import {
  can,
  canManageMember,
  canSeeSpace,
  type Actor,
} from "../../src/server/policies";

const roles = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
const callers: Actor[] = roles.map((role) => ({ role }));

describe("workspace permissions", () => {
  it.each([
    ["workspace:edit", [true, true, false, false]],
    ["workspace:delete", [true, false, false, false]],
    ["member:manage", [true, true, false, false]],
    ["structure:manage", [true, true, false, false]],
    ["task:write", [true, true, true, false]],
  ] as const)("%s for owner, admin, member, guest", (action, expected) => {
    expect(callers.map((a) => can(a, action))).toEqual(expected);
  });
});

describe("seeing a space", () => {
  it.each([
    ["public, not listed", false, false, [true, true, true, false]],
    ["public, listed", false, true, [true, true, true, true]],
    ["private, not listed", true, false, [true, true, false, false]],
    ["private, listed", true, true, [true, true, true, true]],
  ] as const)(
    "%s: owner, admin, member, guest",
    (_name, isPrivate, listed, expected) => {
      expect(roles.map((r) => canSeeSpace(r, { isPrivate }, listed))).toEqual(
        expected,
      );
    },
  );
});

describe("managing members", () => {
  it.each([
    ["add a MEMBER", { to: "MEMBER" }, [true, true, false, false]],
    ["add an ADMIN", { to: "ADMIN" }, [true, false, false, false]],
    [
      "change MEMBER to GUEST",
      { from: "MEMBER", to: "GUEST" },
      [true, true, false, false],
    ],
    [
      "demote an ADMIN",
      { from: "ADMIN", to: "MEMBER" },
      [true, false, false, false],
    ],
    ["remove a GUEST", { from: "GUEST" }, [true, true, false, false]],
    ["remove an ADMIN", { from: "ADMIN" }, [true, false, false, false]],
    [
      "touch the OWNER",
      { from: "OWNER", to: "GUEST" },
      [false, false, false, false],
    ],
    [
      "grant OWNER",
      { from: "MEMBER", to: "OWNER" },
      [false, false, false, false],
    ],
  ] as const)("%s: owner, admin, member, guest", (_name, change, expected) => {
    expect(callers.map((a) => canManageMember(a, change))).toEqual(expected);
  });
});
