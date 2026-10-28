import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { E2E_CLOSED_ORIGIN, E2E_DATABASE_URL } from "./env";
import { cleanup, prisma } from "./fixtures";

// Everything here runs against the closed server: no OPEN_ACCESS, no DEMO_ENABLED, as in production.
test.use({ baseURL: E2E_CLOSED_ORIGIN });

test.beforeEach(cleanup);
test.afterAll(cleanup);

const PASSWORD = "first-long-password";

/** Makes a user the way the owner will in production: with the script, no sign-up involved. */
function createUser(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  execFileSync(
    process.execPath,
    ["scripts/user-create.mjs", "--email", email, "--name", label],
    {
      env: {
        ...process.env,
        DATABASE_URL: E2E_DATABASE_URL,
        USER_PASSWORD: PASSWORD,
      },
    },
  );
  return email;
}

test("the doors are closed: no GitHub, no sign-up, no demo button", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with email" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /GitHub/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Create an account/ }),
  ).toHaveCount(0);

  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore the demo" }),
  ).toHaveCount(0);

  // The server refuses it too, not only the page.
  const email = `intruder-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const res = await request.post("/api/auth/sign-up/email", {
    headers: { origin: E2E_CLOSED_ORIGIN },
    data: { name: "Intruder", email, password: "a-long-password-1" },
  });
  expect(res.ok()).toBe(false);
  expect(await prisma.user.count({ where: { email } })).toBe(0);
  const social = await request.post("/api/auth/sign-in/social", {
    headers: { origin: E2E_CLOSED_ORIGIN },
    data: { provider: "github", callbackURL: "/workspaces" },
  });
  expect(social.ok()).toBe(false);
});

test("a user made with the script signs in, changes the password, and the old one stops working", async ({
  page,
}) => {
  const email = createUser("scripted");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);

  await page.goto("/profile");
  const form = page.locator("form", {
    has: page.getByRole("heading", { name: "Change password" }),
  });
  await form.getByLabel("Current password").fill(PASSWORD);
  await form
    .getByLabel("New password", { exact: true })
    .fill("second-long-password");
  await form.getByLabel("Repeat the new password").fill("different-password-x");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("alert")).toContainText("do not match");

  await form.getByLabel("Repeat the new password").fill("second-long-password");
  await form.getByLabel("Current password").fill("wrong-current-password");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("alert")).toBeVisible();

  await form.getByLabel("Current password").fill(PASSWORD);
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("status")).toContainText("Password changed");

  // Sign out, and only the new password works.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill("second-long-password");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
});

test("the health check and the security headers", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok" });

  for (const path of ["/", "/login", "/api/health"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});

test("the daily job is closed to anyone without the secret", async ({
  request,
}) => {
  expect((await request.get("/api/cron/alerts")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/alerts", {
        headers: { authorization: "Bearer nope" },
      })
    ).status(),
  ).toBe(401);
});
