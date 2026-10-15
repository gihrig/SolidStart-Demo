import { expect, type Page } from "@playwright/test";

/**
 * Log in as the seeded demo User through the Nav login dialog (#128): open the
 * Profile menu, click Log In, submit the prefilled credentials, and wait for the
 * `demo1` name in the Nav. The caller navigates first; the login state lives in
 * the page, so later moves must stay in-app.
 */
export async function loginAsDemo(page: Page) {
  // Wait for hydration, so the clicks reach live handlers.
  await page.waitForLoadState("networkidle");
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Profile menu" }).click();
  await header.getByRole("button", { name: "Log In" }).click();
  const dialog = page.getByRole("dialog", { name: "Login" });
  await dialog.getByRole("button", { name: /^login$/i }).click();
  await expect(header.getByText("demo1", { exact: true })).toBeVisible({ timeout: 10000 });
}
