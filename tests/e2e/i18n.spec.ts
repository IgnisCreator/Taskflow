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
    // Texts of the English catalog for the screens in this step, long enough to be unambiguous.
    const sections = [
      en.landing,
      en.login,
      en.profile,
      en.notifications,
      en.workspaces,
      en.errors,
      en.nav,
    ];
    const leaves = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(leaves)
          : [];
    const english = sections
      .flatMap(leaves)
      .filter((text) => text.length >= 14);
    const spanishAll = new Set(
      [
        es.landing,
        es.login,
        es.profile,
        es.notifications,
        es.workspaces,
        es.errors,
        es.nav,
      ].flatMap(leaves),
    );

    for (const path of [
      "/",
      "/workspaces",
      "/notifications",
      "/profile",
      "/does-not-exist",
    ]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      const text = (await page.locator("body").innerText()).replace(
        /\s+/g,
        " ",
      );
      for (const sentence of english) {
        // A text that is the same in both languages (a name) is allowed.
        if (spanishAll.has(sentence)) continue;
        expect(text, `${path}: ${sentence}`).not.toContain(sentence);
      }
    }
    // The signed-out pages too.
    await context.clearCookies();
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: es.login.title }),
    ).toBeVisible();
  });
});
