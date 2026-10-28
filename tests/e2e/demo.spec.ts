import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_ORIGIN } from "./env";
import { cleanup, prisma, seedBoard } from "./fixtures";

async function wipeDemo() {
  await prisma.workspace.deleteMany({ where: { isDemo: true } });
  await prisma.user.deleteMany({ where: { isDemo: true } });
}
// The daily job: renews the demo and raises its alerts.
const runJob = () =>
  fetch(`${E2E_ORIGIN}/api/cron/alerts`, {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });

test.beforeEach(async () => {
  await cleanup();
  await wipeDemo();
});
test.afterAll(async () => {
  await wipeDemo();
  await cleanup();
});

test("the landing page opens the demo without an account, read-only, with the story in it", async ({
  page,
}) => {
  expect((await runJob()).status).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();

  // Signed in as the visitor, in the sample workspace, with a banner that says what it is.
  await expect(page).toHaveURL(/\/w\/[\w-]+$/);
  await expect(
    page.getByRole("heading", { name: "Acme Product Team" }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("read-only demo");
  await expect(page.getByRole("heading", { name: "Software" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
  // A guest cannot create anything here.
  await expect(page.getByRole("button", { name: "Create list" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Create space" })).toHaveCount(
    0,
  );

  // The board has real work on it and no way to add more.
  await page
    .getByRole("link", { name: "Platform", exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Platform" })).toBeVisible();
  await expect(page.getByText("Code review").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Add task/ })).toHaveCount(0);

  // Code review is the bottleneck: over its limit, with the alert in the inbox.
  await expect(page.getByText(/Over the WIP limit/).first()).toBeVisible();
  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(
    page.getByText(/"Code review" has been over its WIP limit/),
  ).toBeVisible();
});

test("the metrics and the forecast of the demo are full of data", async ({
  page,
}) => {
  await runJob();
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page
    .getByRole("link", { name: "Platform", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\/[\w-]+$/);
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
  await runJob();
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.goto("/profile");
  await page.getByLabel(/Email me the open alerts once a day/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("The demo is read-only")).toBeVisible();
  const visitor = await prisma.user.findUniqueOrThrow({
    where: { email: "visitor@demo.taskflow.test" },
  });
  expect(visitor.digestEmail).toBe(false);
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
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page).toHaveURL(/\/w\//);
  expect(await prisma.task.count({ where: { listId: seed.listId } })).toBe(
    before,
  );
  expect(
    await prisma.workspace.count({ where: { id: seed.workspaceId } }),
  ).toBe(1);
});
