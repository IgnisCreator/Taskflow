import { expect, test } from "@playwright/test";
import { cleanup, prisma, seedBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;
const DAY = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const TODAY = Math.floor(Date.now() / DAY) * DAY;

// A steady pace: two tasks finished on each of the 14 days before today. The seed fixture's own
// four tasks are the pending ones (three in "To do", one in "In progress").
async function steadyHistory() {
  const stages = await prisma.boardColumn.findMany({
    where: { listId: seed.listId },
  });
  const named = (n: string) => stages.find((s) => s.name === n)!;
  for (let back = 14; back >= 1; back--) {
    for (const n of [1, 2]) {
      const done = named("Done");
      const task = await prisma.task.create({
        data: {
          listId: seed.listId,
          columnId: done.id,
          title: `Done ${back}-${n}`,
          position: 100 + back * 2 + n,
          createdById: seed.owner.id,
        },
      });
      await prisma.taskEvent.createMany({
        data: (
          [
            ["CREATED", "To do", 8],
            ["MOVED", "In progress", 9],
            ["MOVED", "Done", 10],
          ] as const
        ).map(([type, name, hour]) => ({
          taskId: task.id,
          listId: seed.listId,
          type,
          toStageId: named(name).id,
          toCategory: named(name).category,
          actorId: seed.owner.id,
          at: new Date(TODAY - back * DAY + hour * 3_600_000),
        })),
      });
    }
  }
}

test.beforeEach(async ({ context }) => {
  await cleanup();
  seed = await seedBoard();
  await context.addCookies(seed.owner.cookies);
});
test.afterAll(cleanup);

const url = (query = "") => `/lists/${seed.listId}/forecast${query}`;
// The two weeks of the steady history: with only those days as the window the pace is exactly two a day.
const WINDOW = `from=${day(TODAY - 14 * DAY)}&to=${day(TODAY - DAY)}`;

test("the list header leads to the forecast", async ({ page }) => {
  await page.goto(`/lists/${seed.listId}`);
  await page.getByRole("link", { name: "Forecast", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lists/${seed.listId}/forecast`));
  await expect(
    page.getByRole("heading", { name: "Forecast of E2E list" }),
  ).toBeVisible();
});

test("when will it be done: exact answer for a steady pace, with the history and seed shown", async ({
  page,
}) => {
  await steadyHistory();
  await page.goto(url(`?${WINDOW}`));
  const card = page.locator('[data-metric="forecast"]');
  // By default it asks about the four pending tasks: two days at two a day.
  await expect(card).toContainText("Finishing 4 tasks (all the pending ones)");
  await expect(card).toContainText("50% probability: within 2 days");

  const form = page.getByRole("form", { name: "When will it be done?" });
  await form.locator("input[name=items]").fill("10");
  await form.getByRole("button", { name: "Forecast the date" }).click();
  const by = day(TODAY + 5 * DAY); // tomorrow is day 1, so day 5 is today + 5
  await expect(card).toContainText(`85% probability: within 5 days (by ${by})`);
  await expect(card).toContainText(`95% probability: within 5 days (by ${by})`);

  const settings = page.getByTestId("forecast-settings");
  await expect(settings).toContainText(
    `History ${day(TODAY - 14 * DAY)} to ${day(TODAY - DAY)} (14 days, 14 with finished tasks, 28 finished)`,
  );
  await expect(settings).toContainText("Seed 1.");
  await expect(settings).toContainText("All calendar days.");
  await expect(card.locator("svg[role=img] rect")).toHaveCount(1);

  await card.getByText("Show the data").click();
  await expect(
    card.getByRole("row", { name: /^5 10000 100\.0%/ }),
  ).toBeVisible();
});

test("how many by a date, only working days, and the options stay in the URL", async ({
  page,
}) => {
  await steadyHistory();
  await page.goto(url(`?${WINDOW}`));
  const form = page.getByRole("form", { name: "How many by a date?" });
  await form.locator("input[name=date]").fill(day(TODAY + 7 * DAY));
  await form.locator("input[name=seed]").fill("42");
  await form.getByRole("button", { name: "Forecast the count" }).click();
  const card = page.locator('[data-metric="forecast"]');
  await expect(card).toContainText(
    `By ${day(TODAY + 7 * DAY)} (7 days from tomorrow) the team finishes at least 14 tasks with 95% probability, 14 tasks with 85%, and 14 tasks with 50%`,
  );
  await expect(page).toHaveURL(/seed=42/);
  await expect(page.getByTestId("forecast-settings")).toContainText("Seed 42.");

  await form.getByLabel("Only working days").check();
  await form.getByRole("button", { name: "Forecast the count" }).click();
  await expect(page).toHaveURL(/workdays=1/);
  await expect(page).toHaveURL(/seed=42/);
  await expect(page.getByTestId("forecast-settings")).toContainText(
    "Working days only.",
  );
  await expect(card).toContainText(/working days? from tomorrow/);
});

test("a history window preset keeps the question", async ({ page }) => {
  await steadyHistory();
  await page.goto(url("?items=10&seed=7"));
  await page.getByRole("link", { name: "30 days" }).click();
  await expect(page).toHaveURL(/items=10/);
  await expect(page).toHaveURL(/seed=7/);
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByTestId("forecast-settings")).toContainText("30 days");
});

test("a bad value says what is wrong and shows the default instead", async ({
  page,
}) => {
  await steadyHistory();
  await page.goto(url("?items=5000"));
  await expect(page.locator("p[role=alert]")).toContainText(
    "The number of tasks can be at most 1000. Showing the default instead.",
  );
  await expect(page.locator('[data-metric="forecast"]')).toContainText(
    "Finishing 4 tasks (all the pending ones)",
  );
  await page.goto(url("?date=2020-01-01"));
  await expect(page.locator("p[role=alert]")).toContainText(
    "The date must be after today",
  );
});

test("with no history it says so and warns, and does not invent a date", async ({
  page,
}) => {
  await page.goto(url());
  const card = page.locator('[data-metric="forecast"]');
  await expect(card).toContainText("so there is no pace to replay");
  await expect(page.locator("p[role=note]")).toHaveCount(2);
  await expect(card.locator("svg[role=img]")).toHaveCount(0);
});

test("a short history warns but still shows the result", async ({ page }) => {
  // Four tasks finished on one day: the answer exists, and so does the warning.
  const stages = await prisma.boardColumn.findMany({
    where: { listId: seed.listId },
  });
  const done = stages.find((s) => s.name === "Done")!;
  const tasks = await prisma.task.findMany({ where: { listId: seed.listId } });
  await prisma.task.updateMany({
    where: { id: { in: tasks.map((t) => t.id) } },
    data: { columnId: done.id },
  });
  await prisma.taskEvent.createMany({
    data: tasks.map((t) => ({
      taskId: t.id,
      listId: seed.listId,
      type: "MOVED" as const,
      toStageId: done.id,
      toCategory: done.category,
      actorId: seed.owner.id,
      at: new Date(TODAY - 3 * DAY + 10 * 3_600_000),
    })),
  });
  await page.goto(url("?items=4"));
  await expect(page.locator("p[role=note]").first()).toContainText(
    "Only 1 days in this window had finished tasks",
  );
  await expect(page.locator('[data-metric="forecast"]')).toContainText(
    "Finishing 4 tasks takes",
  );
  await expect(page.locator("svg[role=img]")).toBeVisible();
});

test("nothing pending says so instead of showing an empty result", async ({
  page,
}) => {
  await prisma.task.deleteMany({ where: { listId: seed.listId } });
  await page.goto(url());
  await expect(page.locator('[data-metric="forecast"]')).toContainText(
    "There is nothing pending in this list",
  );
});
