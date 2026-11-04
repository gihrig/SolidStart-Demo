import { expect, type Page } from "@playwright/test";

/**
 * Log in as a seeded User through the Nav login dialog (#128, #129): open the
 * Profile menu, click Log In, type the credentials (the fields open empty),
 * submit, and wait for the name in the Nav. A seeded User's name is its
 * username: `demo1` / `welcome`, or a User from `SEED_USER_PWDS` in `dev_db.rs`.
 * The caller navigates first; the login state lives in the page, so later moves
 * must stay in-app.
 */
export async function loginAs(page: Page, username: string, password: string) {
  // Wait for hydration, so the clicks reach live handlers.
  await page.waitForLoadState("networkidle");
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Profile menu" }).click();
  await header.getByRole("button", { name: "Log In" }).click();
  const dialog = page.getByRole("dialog", { name: "Login" });
  await dialog.getByLabel("Username").fill(username);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: /^login$/i }).click();
  await expect(header.getByText(username, { exact: true })).toBeVisible({ timeout: 10000 });
}
