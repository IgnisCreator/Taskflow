import { expect, test, type Page } from "@playwright/test";
import { cleanup, prisma, seedBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;

test.beforeEach(async ({ context }) => {
  await cleanup();
  seed = await seedBoard();
  await context.addCookies(seed.owner.cookies);
  // Alpha: high, due in March. Bravo: low, blocked, a bug. Charlie: medium, due in January. Delta: high.
  const bug = await prisma.workItemType.findFirstOrThrow({
    where: { workspaceId: seed.workspaceId, name: "Bug" },
  });
  const set = (title: string, data: object) =>
    prisma.task.updateMany({ where: { listId: seed.listId, title }, data });
  await set("Alpha", { priority: "HIGH", dueDate: new Date("2026-03-01") });
  await set("Bravo", {
    priority: "LOW",
    blockedReason: "Waiting",
    typeId: bug.id,
  });
  await set("Charlie", { dueDate: new Date("2026-01-01") });
  await set("Delta", { priority: "HIGH" });
});
test.afterAll(cleanup);

const list = (page: Page, query = "") =>
  page.goto(`/lists/${seed.listId}?view=list${query}`);
/** The titles in the table, top to bottom. */
const titles = (page: Page) =>
  page.locator("tbody tr th button").allTextContents();

test("the list view shows every task, with its stage and details", async ({
  page,
}) => {
  await list(page);
  await expect
    .poll(() => titles(page))
    .toEqual(["Alpha", "Bravo", "Charlie", "Delta"]); // board order
  const bravo = page.locator("tbody tr", { hasText: "Bravo" });
  await expect(bravo.getByText("To do")).toBeVisible();
  await expect(bravo.getByText("Bug", { exact: true })).toBeVisible();
  await expect(bravo.getByText("blocked")).toBeVisible();
  await expect(
    page.locator("tbody tr", { hasText: "Delta" }).getByText("In progress"),
  ).toBeVisible();
});

test("a header sorts, a second click reverses it, and the sort is announced", async ({
  page,
}) => {
  await list(page);
  await page.getByRole("link", { name: "Priority" }).click();
  await expect
    .poll(() => titles(page))
    .toEqual(["Bravo", "Charlie", "Alpha", "Delta"]); // low to high
  await expect(
    page.getByRole("columnheader", { name: /Priority/ }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("link", { name: /Priority/ }).click();
  await expect
    .poll(() => titles(page))
    .toEqual(["Alpha", "Delta", "Charlie", "Bravo"]); // high to low

  await page.getByRole("link", { name: "Due" }).click();
  // Soonest first; the tasks without a date go last.
  await expect
    .poll(() => titles(page))
    .toEqual(["Charlie", "Alpha", "Bravo", "Delta"]);
  await page.getByRole("link", { name: /Due/ }).click();
  await expect
    .poll(() => titles(page))
    .toEqual(["Alpha", "Charlie", "Bravo", "Delta"]);
});

test("filters apply in the list view and keep the view and the sort", async ({
  page,
}) => {
  await list(page, "&sort=title&dir=desc");
  await page.locator('select[name="blocked"]').selectOption("yes");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page).toHaveURL(/sort=title/);
  await expect.poll(() => titles(page)).toEqual(["Bravo"]);

  await page.locator('select[name="blocked"]').selectOption("no");
  await page.locator('select[name="type"]').selectOption({ label: "No type" });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => titles(page)).toEqual(["Delta", "Charlie", "Alpha"]); // title, descending

  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect.poll(() => titles(page).then((t) => t.length)).toBe(4);
});

test("an empty result says so, and an invalid sort in the URL is ignored", async ({
  page,
}) => {
  await list(page, "&q=nothing-matches&sort=bogus&dir=sideways");
  await expect(page.getByText("No tasks match these filters.")).toBeVisible();
  await list(page, "&sort=bogus");
  await expect
    .poll(() => titles(page))
    .toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
});

test("the view tabs keep the filters, and the board filters by type and label too", async ({
  page,
}) => {
  await prisma.label.create({
    data: { workspaceId: seed.workspaceId, name: "later" },
  });
  await page.goto(`/lists/${seed.listId}?q=alpha`);
  await page.getByRole("link", { name: "List", exact: true }).click();
  await expect(page).toHaveURL(/q=alpha/);
  await expect(page).toHaveURL(/view=list/);
  await expect.poll(() => titles(page)).toEqual(["Alpha"]);

  await page.getByRole("link", { name: "Board", exact: true }).click();
  await expect(page).toHaveURL(/q=alpha/);
  await expect(
    page.locator("ul li button", { hasText: "Alpha" }),
  ).toBeVisible();
  await expect(page.locator('select[name="label"]')).toBeVisible(); // there is a label to filter by
});

test("a task opens from the table, and moving it there updates its stage", async ({
  page,
}) => {
  await list(page);
  await page.locator("tbody tr th button", { hasText: "Alpha" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator('label:has-text("Column") select')
    .selectOption({ label: "In progress" });
  const answered = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith("/move"),
  );
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await answered;
  await expect(
    page.locator("tbody tr", { hasText: "Alpha" }).getByText("In progress"),
  ).toBeVisible();
});

test("a task is created from the list view", async ({ page }) => {
  await list(page);
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("From the table");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator("tbody tr", { hasText: "From the table" }).getByText("To do"),
  ).toBeVisible();
});

test("on a phone the table scrolls inside its box, not the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await list(page);
  await expect.poll(() => titles(page).then((t) => t.length)).toBe(4);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
