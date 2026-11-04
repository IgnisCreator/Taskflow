import { expect, test, type Page } from "@playwright/test";
import { cleanup, prisma, seedBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;

test.beforeEach(async ({ context }) => {
  await cleanup();
  seed = await seedBoard();
  await context.addCookies(seed.owner.cookies);
});
test.afterAll(cleanup);

const noSideScroll = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );

test("a board with six stages stays on one row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prisma.boardColumn.createMany({
    data: ["Blocked", "QA"].map((name, i) => ({
      name,
      listId: seed.listId,
      position: 10 + i,
      category: "ACTIVE" as const,
    })),
  });
  await page.goto(`/lists/${seed.listId}`);
  const tops = await page
    .locator('section[aria-labelledby^="col-"]')
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
  expect(tops).toHaveLength(6);
  expect(new Set(tops).size).toBe(1);
});

test("the metrics are one dashboard that fits a full-HD screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/lists/${seed.listId}/metrics`);
  await expect(page.locator("[data-metric]")).toHaveCount(6);
  const bottoms = await page
    .locator("[data-metric]")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  expect(Math.max(...bottoms)).toBeLessThanOrEqual(1080);
  // Expand widens one card to the whole row; the link back returns to the grid.
  await page.getByRole("link", { name: "Expand Cycle time" }).click();
  await expect(page.locator("#card-cycleTime")).toBeInViewport();
  await expect(
    page.getByRole("link", { name: "Back to the dashboard" }),
  ).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the board, a task and the metrics work without sideways page scroll", async ({
    page,
  }) => {
    await page.goto(`/lists/${seed.listId}`);
    await expect(page.getByRole("heading", { name: "To do" })).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.locator("ul li button", { hasText: "Alpha" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.goto(`/lists/${seed.listId}/metrics`);
    await expect(page.locator("[data-metric]")).toHaveCount(6);
    expect(await noSideScroll(page)).toBe(true);
  });
});
