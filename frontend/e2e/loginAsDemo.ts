import { expect, type Page } from "@playwright/test";

/** Wait for hydration, then open the Nav login dialog (#128). */
async function openLoginDialog(page: Page) {
  // Wait for hydration, so the clicks reach live handlers.
  await page.waitForLoadState("networkidle");
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Profile menu" }).click();
  await header.getByRole("button", { name: "Log In" }).click();
  return page.getByRole("dialog", { name: "Login" });
}

/**
 * Log in as the seeded demo User through the Nav login dialog (#128): open the
 * Profile menu, click Log In, submit the prefilled credentials, and wait for the
 * `demo1` name in the Nav. The caller navigates first; the login state lives in
 * the page, so later moves must stay in-app.
 */
export async function loginAsDemo(page: Page) {
  const dialog = await openLoginDialog(page);
  await dialog.getByRole("button", { name: /^login$/i }).click();
  await expect(page.getByRole("banner").getByText("demo1", { exact: true })).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Log in as another seeded User (#129), e.g. an Author from `AUTHOR_PWDS` in
 * `dev_db.rs`: type the credentials into the Nav login dialog, submit, and wait
 * for the name in the Nav. A seeded Author's name is its username. The caller
 * navigates first, as for {@link loginAsDemo}.
 */
export async function loginAs(page: Page, username: string, password: string) {
  const dialog = await openLoginDialog(page);
  await dialog.getByLabel("Username").fill(username);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: /^login$/i }).click();
  await expect(page.getByRole("banner").getByText(username, { exact: true })).toBeVisible({
    timeout: 10000,
  });
}
