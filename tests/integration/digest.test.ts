import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanupTestData } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

// The provider is replaced: the test decides whether a send works and sees what was sent.
const sent: { to: string; subject: string; text: string }[] = [];
let failWith: Error | null = null;
vi.mock("@/server/email", () => ({
  sendEmail: async (message: { to: string; subject: string; text: string }) => {
    if (failWith) throw failWith;
    sent.push(message);
  },
}));

const { db } = await import("@/server/db");
const { sendDigests } = await import("@/server/services/digest");

let world: World;
let listId: string;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
  ({ listId } = await createListFor(world));
});
afterAll(cleanupTestData);
beforeEach(async () => {
  sent.length = 0;
  failWith = null;
  await db.emailLog.deleteMany({ where: { userId: world.member.id } });
});

const alertFor = (
  userId: string,
  key: string,
  resolvedAt: Date | null = null,
) =>
  db.notification.create({
    data: {
      userId,
      listId,
      kind: "TASK_AGING",
      key,
      message: `Message ${key}`,
      resolvedAt,
    },
  });
const now = () => Date.now();
const mine = () => sent.filter((m) => m.to === world.member.email);
const guests = () => sent.filter((m) => m.to === world.guest.email);

describe("the daily digest", () => {
  it("only goes to people who asked for it, and only when they have open alerts", async () => {
    await alertFor(world.member.id, "age:a");
    await alertFor(world.member.id, "age:old", new Date()); // resolved: not listed
    await sendDigests(now());
    expect(mine()).toHaveLength(0); // nobody asked yet

    await db.user.update({
      where: { id: world.member.id },
      data: { digestEmail: true },
    });
    await db.user.update({
      where: { id: world.guest.id },
      data: { digestEmail: true },
    });
    await sendDigests(now());
    // The member has one open alert; the guest asked but has none.
    expect(mine()).toHaveLength(1);
    expect(guests()).toHaveLength(0);
    expect(mine()[0]!.subject).toBe("TaskFlow: 1 open alert");
    expect(mine()[0]!.text).toContain("Fixture list: Message age:a");
    expect(mine()[0]!.text).not.toContain("age:old");
  });

  it("sends at most one a day, and logs it", async () => {
    await db.user.update({
      where: { id: world.member.id },
      data: { digestEmail: true },
    });
    await sendDigests(now());
    await sendDigests(now());
    expect(mine()).toHaveLength(1);
    const logs = await db.emailLog.findMany({
      where: { userId: world.member.id },
    });
    expect(logs.map((l) => l.status)).toEqual(["SENT"]);
    // A day later it goes again.
    await sendDigests(now() + 21 * 3_600_000);
    expect(mine()).toHaveLength(2);
  });

  it("logs a failure with its reason, and tries again on the next run", async () => {
    await db.user.update({
      where: { id: world.member.id },
      data: { digestEmail: true },
    });
    failWith = new Error("Email provider answered 429");
    await sendDigests(now());
    expect(mine()).toHaveLength(0);
    const [log] = await db.emailLog.findMany({
      where: { userId: world.member.id },
    });
    expect(log).toMatchObject({
      status: "FAILED",
      error: "Email provider answered 429",
    });
    expect(log!.subject).not.toContain("Message"); // the body is never stored

    failWith = null;
    await sendDigests(now());
    expect(mine()).toHaveLength(1);
  });

  it("does not email an unverified address", async () => {
    await db.user.update({
      where: { id: world.member.id },
      data: { digestEmail: true, emailVerified: false },
    });
    await sendDigests(now());
    expect(mine()).toHaveLength(0);
    await db.user.update({
      where: { id: world.member.id },
      data: { emailVerified: true },
    });
  });
});
