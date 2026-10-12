import { expect, test } from "@playwright/test";
import { cleanup, seedBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;

test.beforeEach(async () => {
  await cleanup();
  seed = await seedBoard();
});
test.afterAll(cleanup);

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Workspace" }).last();

test("an owner builds a private space with a folder and a list, and decides who sees it", async ({
  page,
  browser,
}) => {
  await page.context().addCookies(seed.owner.cookies);
  await page.goto(`/w/${seed.workspaceId}`);

  // A private space.
  await page.getByLabel("Name", { exact: true }).last().fill("Hiring");
  await page.getByLabel(/^Private/).check();
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(
    nav(page).getByRole("link", { name: "Manage Hiring" }),
  ).toBeVisible();

  // A folder in it, then a list inside the folder.
  await nav(page).getByRole("link", { name: "Manage Hiring" }).click();
  await page.getByLabel("New folder").fill("2026");
  await page.getByRole("button", { name: "Add folder" }).click();
  await expect(page.getByLabel("Folder name")).toHaveValue("2026");
  await page.goto(`/w/${seed.workspaceId}`);
  const hiring = page.locator("li.card", { hasText: "Hiring" });
  await hiring.getByLabel("New list").fill("Candidates");
  await hiring.getByLabel("Folder").selectOption({ label: "2026" });
  await hiring.getByRole("button", { name: "Create list" }).click();
  await expect(page).toHaveURL(/\/lists\//);
  await expect(page.getByRole("heading", { name: "Candidates" })).toBeVisible();
  await expect(page.locator("section h2", { hasText: "To do" })).toBeVisible();

  // The member does not see the private space...
  const other = await browser.newContext();
  await other.addCookies(seed.member.cookies);
  const memberPage = await other.newPage();
  await memberPage.goto(`/w/${seed.workspaceId}`);
  await expect(nav(memberPage).getByText("General")).toBeVisible();
  await expect(nav(memberPage).getByText(/Hiring/)).toHaveCount(0);
  const listUrl = page.url();
  await memberPage.goto(listUrl);
  await expect(
    memberPage.getByRole("heading", { name: "Not found" }),
  ).toBeVisible();

  // ...until the owner lists them in it.
  await page.goto(`/w/${seed.workspaceId}`);
  await nav(page).getByRole("link", { name: "Manage Hiring" }).click();
  await page.getByLabel("member", { exact: false }).click();
  await expect(page.getByLabel("member", { exact: false })).toBeChecked();
  await memberPage.goto(listUrl);
  await expect(
    memberPage.getByRole("heading", { name: "Candidates" }),
  ).toBeVisible();
  await other.close();
});

test("an owner adds a member by email and renames a role", async ({ page }) => {
  const { createUser } = await import("./fixtures");
  const newcomer = await createUser("newcomer");
  await page.context().addCookies(seed.owner.cookies);
  await page.goto(`/w/${seed.workspaceId}/settings`);

  await page.getByLabel("Email").fill(newcomer.email.toUpperCase());
  await page.locator('select[name="role"]').selectOption("GUEST");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(
    page.getByRole("button", { name: "Remove newcomer" }),
  ).toBeVisible();

  await page.getByLabel("Guest", { exact: true }).fill("Client");
  await page.getByRole("button", { name: "Save role names" }).click();
  await expect(page.getByLabel("Role of newcomer")).toContainText("Client");

  await page.getByLabel("Email").fill("nobody-at-all@example.test");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(
    "No user has that email",
  );
});
