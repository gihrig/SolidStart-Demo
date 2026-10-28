import { test, expect } from "@playwright/test";

// The Top Nav renders on every route: the Brand link "Awesome" → / plus the Nav
// links Home / About / Readme (#247). Jedi is the home page (#62), so there is no
// Jedi nav link and /jedi 404s.

// 1. Nav structure
test("renders the global nav with brand + links", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();

  await expect(nav.getByRole("link")).toHaveText(["Home", "About", "Readme"]);
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  await expect(nav.getByRole("link", { name: "Readme" })).toHaveAttribute("href", "/readme");

  // The Brand link also goes home (#247 adds the Home Nav link beside it). There
  // is no Jedi link, and the FullStack link is gone (#128).
  await expect(page.getByRole("link", { name: /awesome/i })).toHaveAttribute("href", "/");
  await expect(nav.getByRole("link", { name: "Jedi" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "FullStack" })).toHaveCount(0);
});

// 2. Nav link navigation
test("navigates via nav links", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("/about");
  await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();

  await nav.getByRole("link", { name: "Readme" }).click();
  await expect(page).toHaveURL("/readme");
  await expect(page.getByRole("heading", { name: /^Readme$/i })).toBeVisible();

  // Home returns to the Jedi home.
  await nav.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();

  // So does the Brand link.
  await nav.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("/about");
  await page.getByRole("link", { name: /awesome/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();
});

// 3. Nav persistence (incl. 404)
test("keeps the nav across pages including 404", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const path of ["/", "/about", "/readme", "/nonexistent"]) {
    await page.goto(path);
    await expect(nav).toBeVisible();
  }
});

// 4. Direct URL access to each route
test("handles direct URL access to each route", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();

  await page.goto("/about");
  await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();

  await page.goto("/readme");
  await expect(page.getByRole("heading", { name: /^Readme$/i })).toBeVisible();

  // /jedi is retired — Jedi is the home page now.
  await page.goto("/jedi");
  await expect(page.getByRole("heading", { name: /^404 - Page Not Found$/i })).toBeVisible();

  await page.goto("/xxx");
  await expect(page.getByRole("heading", { name: /^404 - Page Not Found$/i })).toBeVisible();
});

// 5. Browser back/forward
test("handles browser back/forward navigation", async ({ page }) => {
  await page.goto("/");

  await page
    .locator("footer")
    .getByRole("link", { name: /^About$/i })
    .click();
  await expect(page).toHaveURL("/about");

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL("/about");
  await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();
});

// 6. Footer
test.describe("Footer Navigation Integration", () => {
  test("keeps the footer across all pages", async ({ page }) => {
    const footer = page.locator("footer");
    for (const path of ["/", "/about", "/readme", "/xxx"]) {
      await page.goto(path);
      await expect(footer).toBeVisible();
    }
  });

  test("navigates via footer links (no Jedi link)", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: /^Jedi$/i })).toHaveCount(0);

    await footer.getByRole("link", { name: /^About$/i }).click();
    await expect(page).toHaveURL("/about");
    await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();

    await footer.getByRole("link", { name: /^Readme$/i }).click();
    await expect(page).toHaveURL("/readme");
    await expect(page.getByRole("heading", { name: /^Readme$/i })).toBeVisible();

    await footer.getByRole("link", { name: /^Home$/i }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();
  });

  test("footer active-link state follows the route", async ({ page }) => {
    const footer = page.locator("footer");
    const homeLink = footer.getByRole("link", { name: /^Home$/i });
    const aboutLink = footer.getByRole("link", { name: /^About$/i });
    const readmeLink = footer.getByRole("link", { name: /^Readme$/i });

    await page.goto("/");
    await expect(homeLink).toHaveClass(/border-sky-600/);
    await expect(aboutLink).toHaveClass(/border-transparent/);

    await page.goto("/about");
    await expect(aboutLink).toHaveClass(/border-sky-600/);
    await expect(homeLink).toHaveClass(/border-transparent/);

    await page.goto("/readme");
    await expect(readmeLink).toHaveClass(/border-sky-600/);

    await page.goto("/xxx");
    await expect(homeLink).toHaveClass(/border-transparent/);
    await expect(aboutLink).toHaveClass(/border-transparent/);
    await expect(readmeLink).toHaveClass(/border-transparent/);
  });

  test("preserves page titles across footer navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Little Jedi/);

    await page
      .locator("footer")
      .getByRole("link", { name: /^About$/i })
      .click();
    await expect(page).toHaveTitle(/SolidStart About/);

    await page
      .locator("footer")
      .getByRole("link", { name: /^Readme$/i })
      .click();
    await expect(page).toHaveTitle(/SolidStart Readme/);

    await page.goto("/notfound");
    await expect(page).toHaveTitle(/SolidStart 404/);
  });
});

// 7. Nav login dialog (#128)
test("logs in through the Nav login dialog", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const header = page.getByRole("banner");
  const profileMenu = header.getByRole("button", { name: "Profile menu" });

  await profileMenu.click();
  await header.getByRole("button", { name: "Log In" }).click();
  const dialog = page.getByRole("dialog", { name: "Login" });
  await expect(dialog).toBeVisible();
  // The fields open empty, so type the demo credentials.
  await expect(dialog.getByLabel("Username")).toHaveValue("");
  await expect(dialog.getByLabel("Password")).toHaveValue("");
  await dialog.getByLabel("Username").fill("demo1");
  await dialog.getByLabel("Password").fill("welcome");

  await dialog.getByRole("button", { name: /^login$/i }).click();

  await expect(dialog).toBeHidden({ timeout: 10000 });
  await expect(header.getByText("demo1", { exact: true })).toBeVisible();
  await expect(profileMenu).toBeFocused();
});
