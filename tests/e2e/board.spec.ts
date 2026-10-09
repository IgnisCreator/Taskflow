import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanup, moveAs, seedBoard, serverBoard } from "./fixtures";

type Seed = Awaited<ReturnType<typeof seedBoard>>;
let seed: Seed;

test.beforeEach(async ({ context }) => {
  await cleanup();
  seed = await seedBoard();
  await context.addCookies(seed.owner.cookies);
});
test.afterAll(cleanup);

const card = (page: Page, title: string) =>
  page.locator("ul li button", { hasText: title });
const column = (page: Page, name: string) =>
  page.locator('section[aria-labelledby^="col-"]', { hasText: name });

/** What the page shows: column name -> task titles, top to bottom. */
const domBoard = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('section[aria-labelledby^="col-"]')].map(
        (section) => [
          (section.querySelector("h2")!.firstChild as Text).textContent!.trim(),
          [...section.querySelectorAll("ul li button")].map(
            (b) => b.querySelector("span.font-medium")!.textContent!,
          ),
        ],
      ),
    ),
  );

/** A real pointer drag: press on the card, move in steps, release on the target. */
async function drag(page: Page, title: string, target: Locator) {
  const from = (await card(page, title).boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
}

/** The page shows a move at once; this resolves when the server has answered it. */
const moveAnswered = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith("/move"),
  );

// The app's own messages, not Next's route announcer or dnd-kit's live region.
const alert = (page: Page) => page.locator('p[role="alert"]');
const status = (page: Page) => page.locator('p[role="status"]');

const open = (page: Page) => page.goto(`/projects/${seed.projectId}`);

test("dragging a task onto another one puts it in that place and survives a reload", async ({
  page,
}) => {
  await open(page);
  const answered = moveAnswered(page);
  await drag(page, "Alpha", card(page, "Delta"));
  await answered;

  const expected = {
    "To do": ["Bravo", "Charlie"],
    "In progress": ["Alpha", "Delta"],
    "In review": [],
    Done: [],
  };
  await expect.poll(() => domBoard(page)).toEqual(expected);
  await page.reload();
  expect(await domBoard(page)).toEqual(expected);
  expect(await serverBoard(seed.projectId, seed.owner)).toEqual(expected);
});

test("dropping on an empty column moves the task there", async ({ page }) => {
  await open(page);
  await drag(page, "Bravo", column(page, "In review"));

  await expect
    .poll(() => domBoard(page))
    .toEqual({
      "To do": ["Alpha", "Charlie"],
      "In progress": ["Delta"],
      "In review": ["Bravo"],
      Done: [],
    });
});

test("a task can be moved from its dialog, without dragging", async ({
  page,
}) => {
  await open(page);
  await card(page, "Charlie").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Column").selectOption({ label: "Done" });
  const answered = moveAnswered(page);
  await dialog.getByRole("button", { name: "Move" }).click();
  await answered;

  await expect
    .poll(() => domBoard(page))
    .toEqual({
      "To do": ["Alpha", "Bravo"],
      "In progress": ["Delta"],
      "In review": [],
      Done: ["Charlie"],
    });
  expect(await serverBoard(seed.projectId, seed.owner)).toEqual(
    await domBoard(page),
  );
});

const failures = {
  "a lost connection": (route: import("@playwright/test").Route) =>
    route.abort(),
  "a server error": (route: import("@playwright/test").Route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "INTERNAL",
          message: "Unexpected error",
          requestId: "e2e",
        },
      }),
    }),
};

for (const [name, fail] of Object.entries(failures)) {
  test(`after ${name} the board is back to the server's order and the next move works`, async ({
    page,
  }) => {
    await open(page);
    const before = await domBoard(page);

    await page.route("**/tasks/*/move", fail);
    await drag(page, "Alpha", card(page, "Delta"));

    await expect(alert(page)).toBeVisible();
    await expect
      .poll(async () => domBoard(page))
      .toEqual(await serverBoard(seed.projectId, seed.owner));
    expect(await domBoard(page)).toEqual(before); // the failed move changed nothing

    await page.unroute("**/tasks/*/move");
    await drag(page, "Alpha", card(page, "Delta"));
    await expect
      .poll(() => domBoard(page))
      .toMatchObject({
        "In progress": ["Alpha", "Delta"],
      });
  });
}

test("a conflict reloads the board to what the server has and says so", async ({
  page,
}) => {
  await open(page);
  // Someone else moves a task behind this page's back, so the page's version is now stale.
  await moveAs(seed.member, seed.projectId, "Delta", "To do", 0);

  await drag(page, "Alpha", card(page, "Delta"));

  await expect(alert(page)).toContainText("changed");
  await expect
    .poll(async () => domBoard(page))
    .toEqual(await serverBoard(seed.projectId, seed.owner));
  expect((await domBoard(page))["To do"]?.[0]).toBe("Delta");
});

test("the board picks up another user's change without a reload", async ({
  page,
}) => {
  await page.clock.install();
  await open(page);

  await moveAs(seed.member, seed.projectId, "Charlie", "Done", 0);
  await page.clock.fastForward(11_000); // past one 10-second check

  await expect
    .poll(async () => domBoard(page))
    .toEqual(await serverBoard(seed.projectId, seed.owner));
  expect((await domBoard(page)).Done).toEqual(["Charlie"]);
  await expect(status(page)).toContainText("updated");
});

test("with no connection at all the card goes straight back to its place", async ({
  page,
  context,
}) => {
  await open(page);
  const before = await domBoard(page);

  await context.setOffline(true); // the move AND the reload that follows both fail
  await drag(page, "Alpha", card(page, "Delta"));

  await expect(alert(page)).toBeVisible();
  // Not after the 8-second fallback: the failed move is reverted immediately.
  await expect.poll(() => domBoard(page), { timeout: 3_000 }).toEqual(before);

  await context.setOffline(false);
});

test("an edit made while someone else changed the board is kept, flagged, and saves on the second try", async ({
  page,
}) => {
  await open(page);
  await card(page, "Alpha").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Alpha renamed");

  // Someone else changes the board while this dialog is open.
  await moveAs(seed.member, seed.projectId, "Delta", "To do", 0);

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changed while this was open",
  );
  await expect(dialog.getByLabel("Title")).toHaveValue("Alpha renamed"); // typed text is kept

  await dialog.getByRole("button", { name: "Save" }).click(); // the intent, repeated knowingly
  await expect(dialog).toBeHidden();
  await expect(card(page, "Alpha renamed")).toBeVisible();
  expect((await serverBoard(seed.projectId, seed.owner))["To do"]).toContain(
    "Alpha renamed",
  );
});
