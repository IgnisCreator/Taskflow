import { expect, test } from "@playwright/test";
import { en } from "../../src/lib/i18n/en";
import { es } from "../../src/lib/i18n/es";
import { cleanup, seedBoard } from "./fixtures";

test.beforeEach(cleanup);
test.afterAll(cleanup);

test("the selector switches the language, and it survives a reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { level: 1, name: en.landing.title }),
  ).toBeVisible();

  await page.getByRole("button", { name: "ES" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { level: 1, name: es.landing.title }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("button", { name: "ES" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test.describe("a visitor whose browser asks for Spanish", () => {
  test.use({ locale: "es-ES" });

  test("starts in Spanish, and a choice overrides the browser", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.getByRole("button", { name: "EN" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the pages moved so far show no English that the catalog has", async ({
    page,
    context,
  }) => {
    const seed = await seedBoard();
    await context.addCookies(seed.owner.cookies);
    // Every long enough text of the English catalog that Spanish words differently.
    const leaves = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(leaves)
          : [];
    const spanishAll = new Set(leaves(es));
    const english = leaves(en).filter(
      (text) => text.length >= 14 && !spanishAll.has(text),
    );
    const checkPage = async (label: string) => {
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      const text = (await page.locator("body").innerText()).replace(
        /\s+/g,
        " ",
      );
      for (const sentence of english) {
        expect(text, `${label}: ${sentence}`).not.toContain(sentence);
      }
    };

    for (const path of [
      "/",
      "/workspaces",
      "/notifications",
      "/profile",
      "/does-not-exist",
      `/w/${seed.workspaceId}`,
      `/w/${seed.workspaceId}/settings`,
      `/spaces/${seed.spaceId}`,
      `/lists/${seed.listId}`,
      `/lists/${seed.listId}/flow`,
      `/lists/${seed.listId}/settings`,
      `/lists/${seed.listId}/activity`,
      `/lists/${seed.listId}/metrics`,
      `/spaces/${seed.spaceId}/metrics`,
      `/lists/${seed.listId}/forecast`,
    ]) {
      await page.goto(path);
      await checkPage(path);
    }

    // The task dialog, with its checklist, comments and history.
    await page.goto(`/lists/${seed.listId}`);
    await page.locator("ul li button", { hasText: "Alpha" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: es.details.checklist }),
    ).toBeVisible();
    await checkPage("the task dialog");

    // The signed-out pages too.
    await context.clearCookies();
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: es.login.title }),
    ).toBeVisible();
  });

  test("the demo opens in Spanish, with its data, charts and alerts", async ({
    page,
  }) => {
    const leaves = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(leaves)
          : [];
    const spanishAll = new Set(leaves(es));
    const english = leaves(en).filter(
      (text) => text.length >= 14 && !spanishAll.has(text),
    );
    const noEnglish = async (label: string) => {
      const text = (await page.locator("body").innerText()).replace(
        /\s+/g,
        " ",
      );
      for (const sentence of english) {
        expect(text, `${label}: ${sentence}`).not.toContain(sentence);
      }
    };

    await page.goto("/");
    await page.getByRole("button", { name: es.demo.explore }).click();
    await expect(page).toHaveURL(/\/w\/[\w-]+$/);
    await expect(
      page.getByRole("heading", { name: es.sample.workspace }),
    ).toBeVisible();
    await expect(page.getByRole("note")).toContainText(
      "espacio de demostración",
    );
    await noEnglish("the workspace");

    await page
      .getByRole("link", { name: es.sample.lists.Platform, exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/lists\/[\w-]+$/);
    await expect(page.getByText("Revisión de código").first()).toBeVisible();
    await expect(
      page.getByText(/Por encima del límite de WIP/).first(),
    ).toBeVisible();
    await noEnglish("the board");
    const board = page.url();

    await page.goto(`${board}/metrics`);
    await expect(page.locator('[data-metric="cycleTime"]')).toContainText(
      /\d+ tareas terminadas\. La mitad tardó/,
    );
    await expect(page.locator('[data-metric="aging"]')).toContainText(
      /que el percentil 85 del tiempo de ciclo/,
    );
    await noEnglish("the metrics");

    await page.goto(`${board}/forecast`);
    await expect(page.locator('[data-metric="forecast"]')).toContainText(
      "de probabilidad",
    );
    await noEnglish("the forecast");

    await page.goto("/notifications");
    await expect(
      page.getByText(
        /"Revisión de código" lleva \d+ días por encima de su límite de WIP/,
      ),
    ).toBeVisible();
    await noEnglish("the alerts");
  });
});
