import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing shows plans and legal links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("$39", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /privacy|privacidad/i }).first().click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("terms page is public", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("private areas send visitors to log in", async ({ page }) => {
    for (const path of ["/dashboard", "/customers", "/settings/team", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("wrong password shows an error and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name=email]").fill("nobody@example.com");
    await page.locator("input[name=password]").fill("not-the-password");
    await page.getByRole("button", { name: /sign in|iniciar/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("an unknown request link is not found", async ({ page }) => {
    const res = await page.goto("/request/this-company-does-not-exist");
    expect([200, 404]).toContain(res?.status());
    await expect(page.locator("form")).toHaveCount(0);
  });

  test("an invitation link without a valid token explains itself", async ({ page }) => {
    await page.goto("/invite/not-a-token");
    await expect(page).toHaveURL(/\/invite\/accept/);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
