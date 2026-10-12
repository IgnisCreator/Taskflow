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

const headings = (page: Page) =>
  page
    .locator('section[aria-labelledby^="col-"] h2')
    .evaluateAll((hs) =>
      hs.map((h) => (h.firstChild as Text).textContent!.trim()),
    );

/** Creates a list from the workspace page, choosing a workflow, and returns its id. */
async function createList(page: Page, name: string, workflow?: string) {
  await page.goto(`/w/${seed.workspaceId}`);
  await page.getByLabel("New list").fill(name);
  if (workflow)
    await page.getByLabel("Workflow").selectOption({ label: workflow });
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}

test("a list starts from the chosen template, and an admin adds a stage to it", async ({
  page,
}) => {
  const listId = await createList(page, "Dev", "Software development");
  expect(await headings(page)).toEqual([
    "Backlog",
    "Ready",
    "In progress",
    "Code review",
    "Testing",
    "Done",
    "Discarded",
  ]);
  // A stage policy is shown under the column name.
  await expect(
    page.getByText("At least one approval before merging."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Workflow" }).click();
  await page.getByRole("button", { name: "Add a stage" }).click();
  // The new stage is inserted just before the first done stage.
  const names = page.getByLabel("Name", { exact: true });
  await expect(names).toHaveCount(8);
  await names.nth(5).fill("QA sign-off");
  await page.getByLabel("WIP limit").nth(5).fill("2");
  await page.getByRole("button", { name: "Save flow" }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("Flow saved.");

  await page.goto(`/lists/${listId}`);
  await expect(
    page.getByRole("heading", { name: "QA sign-off" }),
  ).toBeVisible();
  expect(await headings(page)).toContain("QA sign-off");
});

test("a stage over its WIP limit shows an alert that explains why", async ({
  page,
}) => {
  const listId = await createList(page, "Dev", "Software development");
  const inProgress = await prisma.boardColumn.findFirstOrThrow({
    where: { listId, name: "In progress" },
  });
  await prisma.task.createMany({
    data: ["A", "B", "C", "D"].map((title, position) => ({
      listId,
      columnId: inProgress.id,
      title,
      position,
      createdById: seed.owner.id,
    })),
  });

  await page.reload();
  await expect(page.getByText("Over the WIP limit (4 of 3)")).toBeVisible();
  await expect(
    page.getByText("finish something before pulling more in", { exact: false }),
  ).toBeVisible();
  // It is only a warning: the card can still be opened and the board still works.
  await expect(page.getByRole("button", { name: /^A medium/ })).toBeEnabled();
});

test("removing a stage that holds tasks asks where they go", async ({
  page,
}) => {
  const listId = await createList(page, "Dev", "Software development");
  const testing = await prisma.boardColumn.findFirstOrThrow({
    where: { listId, name: "Testing" },
  });
  await prisma.task.create({
    data: {
      listId,
      columnId: testing.id,
      title: "Needs testing",
      position: 0,
      createdById: seed.owner.id,
    },
  });

  await page.goto(`/lists/${listId}/flow`);
  await page.getByRole("button", { name: "Remove Testing" }).click();
  await expect(page.getByText("Testing: 1 task move to")).toBeVisible();
  // The default is the first active stage; the admin picks another one.
  await page
    .getByLabel("Testing: 1 task move to")
    .selectOption({ label: "Code review" });
  await page.getByRole("button", { name: "Save flow" }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("Flow saved.");

  await page.goto(`/lists/${listId}`);
  expect(await headings(page)).not.toContain("Testing");
  const column = page.locator('section[aria-labelledby^="col-"]', {
    hasText: "Code review",
  });
  await expect(column.getByText("Needs testing")).toBeVisible();
});

test("the editor refuses an invalid flow before saving", async ({ page }) => {
  const listId = await createList(page, "Dev");
  await page.goto(`/lists/${listId}/flow`);
  await page.getByRole("button", { name: "Remove Discarded" }).click();
  await expect(
    page.getByText("The flow needs at least one discarded stage"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save flow" })).toBeDisabled();
  await page.getByRole("button", { name: "Undo my changes" }).click();
  await expect(page.getByRole("button", { name: "Save flow" })).toBeEnabled();
});

test("a template loaded in the editor replaces the flow and moves the tasks", async ({
  page,
}) => {
  const listId = await createList(page, "Dev");
  const todo = await prisma.boardColumn.findFirstOrThrow({
    where: { listId, name: "To do" },
  });
  await prisma.task.create({
    data: {
      listId,
      columnId: todo.id,
      title: "First",
      position: 0,
      createdById: seed.owner.id,
    },
  });

  await page.goto(`/lists/${listId}/flow`);
  await page
    .locator('label:has-text("Template") select')
    .first()
    .selectOption({ label: "Support desk" });
  await page.getByRole("button", { name: "Load template" }).click();
  await page.getByRole("button", { name: "Save flow" }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("Flow saved.");

  await page.goto(`/lists/${listId}`);
  expect(await headings(page)).toEqual([
    "New",
    "Triage",
    "In progress",
    "Waiting for customer",
    "Resolved",
    "Discarded",
  ]);
  const column = page
    .locator('section[aria-labelledby^="col-"]', { hasText: "New" })
    .first();
  await expect(column.getByText("First")).toBeVisible();
});

test("a space default workflow applies to lists created in it, and a saved template can be reused", async ({
  page,
}) => {
  const space = await prisma.space.findFirstOrThrow({
    where: { workspaceId: seed.workspaceId },
  });
  await page.goto(`/spaces/${space.id}`);
  await page
    .locator('label:has-text("Workflow") select')
    .first()
    .selectOption({ label: "Support desk" });
  await page.getByRole("button", { name: "Save default workflow" }).click();
  await expect
    .poll(
      async () =>
        (await prisma.space.findUniqueOrThrow({ where: { id: space.id } }))
          .defaultTemplate,
    )
    .toBe("system:support");

  const listId = await createList(page, "Help desk");
  expect((await headings(page))[0]).toBe("New");

  // Save that list as a template and use it for another list.
  await page.goto(`/lists/${listId}/flow`);
  await page.getByLabel("Template name").fill("Our support");
  await page.getByRole("button", { name: "Save as template" }).click();
  await expect
    .poll(() =>
      prisma.workflowTemplate.count({
        where: { workspaceId: seed.workspaceId, name: "Our support" },
      }),
    )
    .toBe(1);
  await createList(page, "Second desk", "Our support");
  expect((await headings(page))[1]).toBe("Triage");
});
