import { expect, test, type Page } from "@playwright/test";
import { E2E_ORIGIN } from "./env";
import { cleanup, prisma, seedBoard } from "./fixtures";

async function wipeSandboxes() {
  await prisma.workspace.deleteMany({
    where: { members: { some: { user: { sandboxUntil: { not: null } } } } },
  });
  await prisma.user.deleteMany({ where: { sandboxUntil: { not: null } } });
  await prisma.apiRateLimit.deleteMany({
    where: { key: { startsWith: "demo:" } },
  });
}

test.beforeEach(async () => {
  await cleanup();
  await wipeSandboxes();
});
test.afterAll(async () => {
  await wipeSandboxes();
  await cleanup();
});

const explore = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page).toHaveURL(/\/w\/[\w-]+$/);
};
const openPlatform = async (page: Page) => {
  await page
    .getByRole("link", { name: "Platform", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\/[\w-]+$/);
};

test("the landing page opens a private sandbox where the visitor can change things", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/deleted after 24 hours/)).toBeVisible();
  await explore(page);

  // The banner says what it is and when it ends.
  await expect(
    page.getByRole("heading", { name: "Acme Product Team" }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("your own demo space");
  await expect(page.getByRole("note")).toContainText("24 hours");
  // The visitor owns it: structure can be created here.
  await expect(
    page.getByRole("button", { name: "Create space" }),
  ).toBeVisible();

  // The board has real work on it, and a task can be moved to another column for good.
  await openPlatform(page);
  await expect(page.getByText(/Over the WIP limit/).first()).toBeVisible();
  const backlog = page
    .locator('section[aria-labelledby^="col-"]', { hasText: "Backlog" })
    .first();
  const first = backlog.locator("ul li button").first();
  const title = (await first.locator("span.font-medium").textContent())!;
  await first.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Column").selectOption({ label: "Ready" });
  const answered = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith("/move"),
  );
  await dialog.getByRole("button", { name: "Move" }).click();
  await answered;
  const moved = await prisma.task.findFirstOrThrow({
    where: { title, list: { name: "Platform" } },
    select: { column: { select: { name: true } } },
  });
  expect(moved.column.name).toBe("Ready");

  // The alert of the bottleneck is in the inbox, and it can be marked as read.
  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(
    page.getByText(/"Code review" has been over its WIP limit/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("Read").first()).toBeVisible();
});

test("the metrics and the forecast of the sandbox are full of data", async ({
  page,
}) => {
  await explore(page);
  await openPlatform(page);
  const url = page.url();

  await page.goto(`${url}/metrics`);
  const cycle = page.locator('[data-metric="cycleTime"]');
  await expect(cycle).toContainText(/\d+ tasks finished\. Half took/);
  await expect(
    page.locator('[data-metric="cfd"] svg[role=img] path').first(),
  ).toBeVisible();
  // Several tasks are old for the stage they are in: the aging chart has dots over the 85% line.
  await expect(page.locator('[data-metric="aging"]')).toContainText(
    /older than the 85th percentile/,
  );

  await page.goto(`${url}/forecast`);
  const forecast = page.locator('[data-metric="forecast"]');
  await expect(forecast).toContainText("probability: within");
  await expect(page.getByText(/^Only \d+ (days|tasks) /)).toHaveCount(0); // enough history: no warning
  await expect(page.getByTestId("forecast-settings")).toContainText("Seed 1.");
});

test("the visitor cannot change the account or keep a preference", async ({
  page,
}) => {
  await explore(page);
  await page.goto("/profile");
  await page.getByLabel(/Email me the open alerts once a day/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("This is not available in the demo"),
  ).toBeVisible();
  const visitor = await prisma.user.findFirstOrThrow({
    where: { sandboxUntil: { not: null } },
  });
  expect(visitor.digestEmail).toBe(false);
});

test("restarting gives fresh data, leaving deletes the sandbox, and an old one is signed out", async ({
  page,
}) => {
  await explore(page);
  const before = page.url();
  await page.getByRole("button", { name: "Restart demo" }).click();
  await expect(page).toHaveURL(/\/w\/[\w-]+$/);
  expect(page.url()).not.toBe(before);
  expect(
    await prisma.workspace.count({ where: { id: before.split("/w/")[1] } }),
  ).toBe(0);

  await page.getByRole("button", { name: "Leave and delete it" }).click();
  await expect(page).toHaveURL(`${E2E_ORIGIN}/`);
  expect(
    await prisma.user.count({ where: { sandboxUntil: { not: null } } }),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "Explore the demo" }),
  ).toBeVisible();

  // Past its 24 hours a sandbox is signed out even though nothing deleted it yet.
  await explore(page);
  await prisma.user.updateMany({
    where: { sandboxUntil: { not: null } },
    data: { sandboxUntil: new Date(Date.now() - 1000) },
  });
  await page.goto("/workspaces");
  await expect(page).toHaveURL(/\/login/);
});

test("two visitors get two separate sandboxes", async ({ page, browser }) => {
  await explore(page);
  const other = await browser.newContext({ baseURL: E2E_ORIGIN });
  const second = await other.newPage();
  await explore(second);
  expect(second.url()).not.toBe(page.url());
  expect(
    await prisma.user.count({ where: { sandboxUntil: { not: null } } }),
  ).toBe(2);
  // The first one cannot open the second's workspace.
  const response = await page.goto(second.url());
  expect(response!.status()).toBe(404);
  await other.close();
});

test("the button is only for people who are not signed in", async ({
  page,
  context,
}) => {
  const seed = await seedBoard();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explore the demo" }),
  ).toBeVisible();
  await context.addCookies(seed.owner.cookies);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explore the demo" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Go to your workspaces" }).first(),
  ).toBeVisible();
});

test("starting the demo does not touch the data of real users", async ({
  page,
}) => {
  const seed = await seedBoard();
  const before = await prisma.task.count({ where: { listId: seed.listId } });
  await explore(page);
  expect(await prisma.task.count({ where: { listId: seed.listId } })).toBe(
    before,
  );
  expect(
    await prisma.workspace.count({ where: { id: seed.workspaceId } }),
  ).toBe(1);
});
