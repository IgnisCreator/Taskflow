import { expect, test, type Page } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_ORIGIN } from "./env";
import { cleanup, prisma, seedBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;
const DAY = 86_400_000;

test.beforeEach(async ({ context }) => {
  await cleanup();
  seed = await seedBoard();
  await context.addCookies(seed.owner.cookies);
  // "In progress" holds two tasks that entered it five days ago, and its limit is one.
  const stages = await prisma.boardColumn.findMany({
    where: { listId: seed.listId },
  });
  const doing = stages.find((s) => s.name === "In progress")!;
  const todo = stages.find((s) => s.name === "To do")!;
  await prisma.boardColumn.update({
    where: { id: doing.id },
    data: { wipLimit: 1 },
  });
  const tasks = await prisma.task.findMany({ where: { listId: seed.listId } });
  const alpha = tasks.find((t) => t.title === "Alpha")!;
  const delta = tasks.find((t) => t.title === "Delta")!;
  await prisma.task.update({
    where: { id: alpha.id },
    data: { columnId: doing.id, position: 1 },
  });
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  await prisma.taskEvent.createMany({
    data: [alpha, delta].flatMap((task) =>
      (
        [
          ["CREATED", todo, 6],
          ["MOVED", doing, 5],
        ] as const
      ).map(([type, stage, days]) => ({
        taskId: task.id,
        listId: seed.listId,
        type,
        toStageId: stage.id,
        toCategory: stage.category,
        actorId: seed.owner.id,
        at: ago(days),
      })),
    ),
  });
});
test.afterAll(cleanup);

const runJob = (secret = E2E_CRON_SECRET) =>
  fetch(`${E2E_ORIGIN}/api/cron/alerts`, {
    headers: { authorization: `Bearer ${secret}` },
  });
const bell = (page: Page) => page.getByRole("link", { name: /^Notifications/ });

test("the daily job raises an alert, the header counts it and the page explains it", async ({
  page,
}) => {
  expect((await runJob("wrong")).status).toBe(401);
  const res = await runJob();
  expect(res.status).toBe(200);

  await page.goto(`/w/${seed.workspaceId}`);
  await expect(bell(page)).toContainText("1");
  await bell(page).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(
    // Entered five days ago, so today is the sixth day of the run (the day itself counts).
    page.getByText(/"In progress" has been over its WIP limit for 6 days/),
  ).toBeVisible();
  // The alert leads to the chart that explains it.
  await page.getByRole("link", { name: /E2E list: see the metrics/ }).click();
  await expect(page).toHaveURL(new RegExp(`/lists/${seed.listId}/metrics`));
});

test("an alert is marked as read, and goes to Resolved when the problem is gone", async ({
  page,
}) => {
  await runJob();
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark as read" }).first().click();
  await expect(page.getByText("Read", { exact: true })).toBeVisible();
  await expect(bell(page)).not.toContainText("1");

  // Raise the limit: the next run no longer finds the problem.
  await prisma.boardColumn.updateMany({
    where: { listId: seed.listId, name: "In progress" },
    data: { wipLimit: 5 },
  });
  await runJob();
  await page.reload();
  await expect(page.getByText("No open alerts")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resolved" })).toBeVisible();
});

test("an admin changes the thresholds of a list, and a bad value is refused", async ({
  page,
}) => {
  await page.goto(`/lists/${seed.listId}/settings`);
  await page.locator("input[name=alertWipDays]").fill("7");
  await page.locator("input[name=alertDropPercent]").fill("40");
  await page.getByRole("button", { name: "Save alert thresholds" }).click();
  await expect
    .poll(() =>
      prisma.list
        .findUniqueOrThrow({ where: { id: seed.listId } })
        .then((l) => [l.alertWipDays, l.alertDropPercent]),
    )
    .toEqual([7, 40]);
  // The browser itself refuses a value out of range before anything is sent.
  await page.locator("input[name=alertWipDays]").fill("99");
  const valid = await page
    .locator("input[name=alertWipDays]")
    .evaluate((el: HTMLInputElement) => el.checkValidity());
  expect(valid).toBe(false);
});

test("the daily email is off until the user asks for it in the profile", async ({
  page,
}) => {
  const digest = () =>
    prisma.user
      .findUniqueOrThrow({ where: { id: seed.owner.id } })
      .then((u) => u.digestEmail);
  expect(await digest()).toBe(false);
  await page.goto("/profile");
  await page.getByLabel(/Email me the open alerts once a day/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(digest).toBe(true);
  await page.reload();
  await expect(
    page.getByLabel(/Email me the open alerts once a day/),
  ).toBeChecked();
});
