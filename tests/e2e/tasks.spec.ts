import { expect, test } from "@playwright/test";
import { cleanup, prisma, seedBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;

test.beforeEach(async ({ context }) => {
  await cleanup();
  seed = await seedBoard();
  await context.addCookies(seed.owner.cookies);
});
test.afterAll(cleanup);

const card = (page: import("@playwright/test").Page, title: string) =>
  page.locator("ul li button", { hasText: title });

test("a task gets several assignees, a type and a label from its dialog, and its card shows them", async ({
  page,
}) => {
  await prisma.label.create({
    data: { workspaceId: seed.workspaceId, name: "urgent" },
  });
  await page.goto(`/lists/${seed.listId}`);
  await card(page, "Alpha").click();
  const dialog = page.getByRole("dialog");

  await dialog.locator('select[name="typeId"]').selectOption({ label: "Bug" });
  await dialog.getByLabel("owner", { exact: true }).check();
  await dialog.getByLabel("member", { exact: true }).check();
  await dialog.getByLabel("urgent").check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const alpha = card(page, "Alpha");
  await expect(alpha.getByText("Bug", { exact: true })).toBeVisible();
  await expect(alpha.getByText("urgent")).toBeVisible();
  await expect(alpha.getByText("member, owner")).toBeVisible();
});

test("a task can be blocked with a reason, which shows on the card and in its history", async ({
  page,
}) => {
  await page.goto(`/lists/${seed.listId}`);
  await card(page, "Alpha").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="blocked"]').check();
  await dialog.getByLabel(/^Reason/).fill("Waiting for the API");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Alpha").getByText("blocked")).toBeVisible();

  await card(page, "Alpha").click();
  await expect(dialog.getByText("owner blocked it in To do")).toBeVisible();
  await dialog.locator('input[name="blocked"]').uncheck();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Alpha").getByText("blocked")).toHaveCount(0);
});

test("the checklist and the comments live in the dialog and do not cause a conflict", async ({
  page,
}) => {
  await page.goto(`/lists/${seed.listId}`);
  await card(page, "Alpha").click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("New checklist item").fill("Write the test");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(
    dialog.getByText("Write the test", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Write the test" }).check();
  await expect(
    dialog.getByRole("heading", { name: "Checklist (1/1)" }),
  ).toBeVisible();

  await dialog.getByLabel("New comment").fill("Almost there");
  await dialog.getByRole("button", { name: "Add comment" }).click();
  await expect(dialog.getByText("Almost there")).toBeVisible();

  // The card shows the progress, and the dialog can still save: nothing moved the board version.
  await expect(card(page, "Alpha").getByText("1/1 done")).toBeVisible();
  await dialog.getByLabel("Title").fill("Alpha, renamed");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Alpha, renamed")).toBeVisible();

  await card(page, "Alpha, renamed").click();
  await dialog.getByRole("button", { name: "Delete comment by owner" }).click();
  await expect(dialog.getByText("Almost there")).toHaveCount(0);
});

test("moving a task writes the history, and the activity page lists it", async ({
  page,
}) => {
  await page.goto(`/lists/${seed.listId}`);
  await card(page, "Alpha").click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator('label:has-text("Column") select')
    .selectOption({ label: "In progress" });
  const answered = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith("/move"),
  );
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await answered;

  await page.getByRole("link", { name: "Activity" }).click();
  await expect(
    page.getByRole("heading", { name: /^Activity of/ }),
  ).toBeVisible();
  await expect(
    page.getByText("owner moved it from To do to In progress"),
  ).toBeVisible();
});

test("an admin manages task types and labels in the workspace settings", async ({
  page,
}) => {
  await page.goto(`/w/${seed.workspaceId}/settings`);
  await page.getByLabel("New task type").fill("Spike");
  await page.getByRole("button", { name: "Add task type" }).click();
  await expect(
    page.getByRole("button", { name: "Delete Spike" }),
  ).toBeVisible();

  await page.getByLabel("New label").fill("blocked-by-legal");
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(
    page.getByRole("button", { name: "Delete blocked-by-legal" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete Spike" }).click();
  await expect(page.getByRole("button", { name: "Delete Spike" })).toHaveCount(
    0,
  );
});
