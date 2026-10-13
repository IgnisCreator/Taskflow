import { expect, test } from "@playwright/test";
import { cleanup, prisma, seedBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;

// Two tasks finished (Alpha in 2 days, Bravo in 6), Charlie waiting in "To do", Delta in progress.
// The dates are fixed and the pages ask for an explicit range, so the numbers do not move.
const RANGE = "from=2026-09-01&to=2026-09-30";

test.beforeEach(async ({ context }) => {
  await cleanup();
  seed = await seedBoard();
  await context.addCookies(seed.owner.cookies);
  const stages = await prisma.boardColumn.findMany({
    where: { listId: seed.listId },
  });
  const stage = (name: string) => stages.find((s) => s.name === name)!;
  const tasks = await prisma.task.findMany({ where: { listId: seed.listId } });
  const id = (title: string) => tasks.find((t) => t.title === title)!.id;
  const history: [string, string, string, string][] = [
    // title, date, type, stage
    ["Alpha", "2026-09-01", "CREATED", "To do"],
    ["Alpha", "2026-09-03", "MOVED", "In progress"],
    ["Alpha", "2026-09-05", "MOVED", "Done"],
    ["Bravo", "2026-09-02", "CREATED", "To do"],
    ["Bravo", "2026-09-04", "MOVED", "In progress"],
    ["Bravo", "2026-09-10", "MOVED", "Done"],
    ["Charlie", "2026-09-02", "CREATED", "To do"],
    ["Delta", "2026-09-01", "CREATED", "To do"],
    ["Delta", "2026-09-06", "MOVED", "In progress"],
  ];
  await prisma.taskEvent.createMany({
    data: history.map(([title, date, type, name]) => ({
      taskId: id(title),
      listId: seed.listId,
      type: type as "CREATED" | "MOVED",
      toStageId: stage(name).id,
      toCategory: stage(name).category,
      actorId: seed.owner.id,
      at: new Date(`${date}T12:00:00Z`),
    })),
  });
  const bug = await prisma.workItemType.findFirstOrThrow({
    where: { workspaceId: seed.workspaceId, name: "Bug" },
  });
  await prisma.task.update({
    where: { id: id("Alpha") },
    data: { typeId: bug.id },
  });
});
test.afterAll(cleanup);

test("the panel states every metric in words, with the data behind it", async ({
  page,
}) => {
  await page.goto(`/lists/${seed.listId}/metrics?${RANGE}`);
  await expect(
    page.getByRole("heading", { name: "Metrics of E2E list" }),
  ).toBeVisible();

  const cycle = page.locator('[data-metric="cycleTime"]');
  await expect(cycle).toContainText(
    "2 tasks finished. Half took 2.0 days or less, 85% took 6.0 days or less",
  );
  await expect(cycle.locator("svg circle")).toHaveCount(2);

  const throughput = page.locator('[data-metric="throughput"]');
  await expect(throughput).toContainText(
    "2 tasks finished between 2026-09-01 and 2026-09-30, 0.4 per week",
  );
  await throughput.getByText("Show the data").click();
  await expect(
    throughput.getByRole("row", { name: "2026-08-31 1" }),
  ).toBeVisible();
  await expect(
    throughput.getByRole("row", { name: "2026-09-07 1" }),
  ).toBeVisible();

  const cfd = page.locator('[data-metric="cfd"]');
  await expect(cfd).toContainText(
    "On 2026-09-30 there were 4 tasks in the flow: 1 in To do, 1 in In progress, 2 in Done.",
  );
  await expect(cfd.locator("svg[role=img] path")).toHaveCount(3);
  await cfd.getByText("Show the data").click();
  await expect(
    cfd.getByRole("row", { name: "2026-09-05 2 1 1" }),
  ).toBeVisible();

  const aging = page.locator('[data-metric="aging"]');
  await expect(aging).toContainText("1 task in progress");
  await expect(aging).toContainText("older than the 85th percentile");

  await expect(page.locator('[data-metric="wip"]')).toContainText(
    "1 task in progress now.",
  );
});

test("each metric explains itself and cites its source", async ({ page }) => {
  await page.goto(`/lists/${seed.listId}/metrics?${RANGE}`);
  const cfd = page.locator('[data-metric="cfd"]');
  await cfd.getByText("What is this and how to read it").click();
  await expect(
    cfd.getByText("Parallel bands mean a steady flow"),
  ).toBeVisible();
  await expect(
    cfd.getByRole("link", { name: "Kanban University glossary" }),
  ).toHaveAttribute("href", /^https:\/\//);
});

test("the filters narrow the numbers, and a bad range says so", async ({
  page,
}) => {
  await page.goto(`/lists/${seed.listId}/metrics?${RANGE}`);
  await page.locator("select[name=type]").selectOption({ label: "Bug" });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator('[data-metric="cycleTime"]')).toContainText(
    "1 task finished. Half took 2.0 days",
  );

  await page.goto(`/lists/${seed.listId}/metrics?from=2026-13-01`);
  await expect(page.locator("p[role=alert]")).toContainText(
    "Use a real date as YYYY-MM-DD. Showing the last 30 days instead.",
  );
  await expect(page.locator('[data-metric="cfd"]')).toBeVisible();

  await page.getByRole("link", { name: "90 days" }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
});

test("the header and the tree lead to the metrics, and the space groups by category", async ({
  page,
}) => {
  await page.goto(`/lists/${seed.listId}`);
  await page.getByRole("link", { name: "Metrics", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lists/${seed.listId}/metrics`));

  await page.getByRole("link", { name: "Metrics of General" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Metrics of the space General" }),
  ).toBeVisible();
  const space = await page.url();
  await page.goto(`${space}?${RANGE}`);
  await expect(page.locator('[data-metric="cfd"]')).toContainText(
    "1 in To do, 1 in Active, 2 in Done",
  );

  await page.goto(`/w/${seed.workspaceId}`);
  await expect(
    page.locator('dl[aria-label="Last 30 days in General"]'),
  ).toBeVisible();
});
