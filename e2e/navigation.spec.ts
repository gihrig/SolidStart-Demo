import { test, expect } from "@playwright/test";

// The global nav (Jedi-styled) renders on every route: brand "Awesome" → / plus
// About / Readme / FullStack. Unlike the footer, it carries no active-link state.
// Jedi is the home page now (#62), so there is no Home or Jedi nav link and /jedi
// 404s.

// 1. Nav structure
test("renders the global nav with brand + links", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();

  await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  await expect(nav.getByRole("link", { name: "Readme" })).toHaveAttribute("href", "/readme");
  await expect(nav.getByRole("link", { name: "FullStack" })).toHaveAttribute("href", "/fullstack");

  // Brand is the home affordance; no separate Home or Jedi link.
  await expect(page.getByRole("link", { name: /awesome/i })).toHaveAttribute("href", "/");
  await expect(nav.getByRole("link", { name: "Home" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Jedi" })).toHaveCount(0);
});

// 2. Nav link navigation
test("navigates via nav links", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("http://localhost:3000/about");
  await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();

  await nav.getByRole("link", { name: "Readme" }).click();
  await expect(page).toHaveURL("http://localhost:3000/readme");
  await expect(page.getByRole("heading", { name: /^Readme$/i })).toBeVisible();

  await nav.getByRole("link", { name: "FullStack" }).click();
  await expect(page).toHaveURL("http://localhost:3000/fullstack");
  await expect(page.getByRole("heading", { name: /Full-Stack Integration Demo/i })).toBeVisible();

  // Brand returns to the Jedi home.
  await page.getByRole("link", { name: /awesome/i }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();
});

// 3. Nav persistence (incl. 404)
test("keeps the nav across pages including 404", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const path of ["/", "/about", "/readme", "/fullstack", "/nonexistent"]) {
    await page.goto(path);
    await expect(nav).toBeVisible();
  }
});

// 4. Direct URL access to each route
test("handles direct URL access to each route", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();

  await page.goto("http://localhost:3000/about");
  await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();

  await page.goto("http://localhost:3000/readme");
  await expect(page.getByRole("heading", { name: /^Readme$/i })).toBeVisible();

  await page.goto("http://localhost:3000/fullstack");
  await expect(page.getByRole("heading", { name: /Full-Stack Integration Demo/i })).toBeVisible();

  // /jedi is retired — Jedi is the home page now.
  await page.goto("http://localhost:3000/jedi");
  await expect(page.getByRole("heading", { name: /^404 - Page Not Found$/i })).toBeVisible();

  await page.goto("http://localhost:3000/xxx");
  await expect(page.getByRole("heading", { name: /^404 - Page Not Found$/i })).toBeVisible();
});

// 5. Browser back/forward
test("handles browser back/forward navigation", async ({ page }) => {
  await page.goto("/");

  await page
    .locator("footer")
    .getByRole("link", { name: /^About$/i })
    .click();
  await expect(page).toHaveURL("http://localhost:3000/about");

  await page.goBack();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL("http://localhost:3000/about");
  await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();
});

// 6. Footer
test.describe("Footer Navigation Integration", () => {
  test("keeps the footer across all pages", async ({ page }) => {
    const footer = page.locator("footer");
    for (const path of ["/", "/about", "/readme", "/fullstack", "/xxx"]) {
      await page.goto(path);
      await expect(footer).toBeVisible();
    }
  });

  test("navigates via footer links (no Jedi link)", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: /^Jedi$/i })).toHaveCount(0);

    await footer.getByRole("link", { name: /^About$/i }).click();
    await expect(page).toHaveURL("http://localhost:3000/about");
    await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();

    await footer.getByRole("link", { name: /^Readme$/i }).click();
    await expect(page).toHaveURL("http://localhost:3000/readme");
    await expect(page.getByRole("heading", { name: /^Readme$/i })).toBeVisible();

    await footer.getByRole("link", { name: /^FullStack$/i }).click();
    await expect(page).toHaveURL("http://localhost:3000/fullstack");
    await expect(page.getByRole("heading", { name: /Full-Stack Integration Demo/i })).toBeVisible();

    await footer.getByRole("link", { name: /^Home$/i }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();
  });

  test("footer active-link state follows the route", async ({ page }) => {
    const footer = page.locator("footer");
    const homeLink = footer.getByRole("link", { name: /^Home$/i });
    const aboutLink = footer.getByRole("link", { name: /^About$/i });
    const readmeLink = footer.getByRole("link", { name: /^Readme$/i });
    const fullstackLink = footer.getByRole("link", { name: /^FullStack$/i });

    await page.goto("/");
    await expect(homeLink).toHaveClass(/border-sky-600/);
    await expect(aboutLink).toHaveClass(/border-transparent/);

    await page.goto("/about");
    await expect(aboutLink).toHaveClass(/border-sky-600/);
    await expect(homeLink).toHaveClass(/border-transparent/);

    await page.goto("/readme");
    await expect(readmeLink).toHaveClass(/border-sky-600/);

    await page.goto("/fullstack");
    await expect(fullstackLink).toHaveClass(/border-sky-600/);

    await page.goto("/xxx");
    await expect(homeLink).toHaveClass(/border-transparent/);
    await expect(aboutLink).toHaveClass(/border-transparent/);
    await expect(readmeLink).toHaveClass(/border-transparent/);
    await expect(fullstackLink).toHaveClass(/border-transparent/);
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

    await page
      .locator("footer")
      .getByRole("link", { name: /^FullStack$/i })
      .click();
    await expect(page).toHaveTitle(/Full-Stack Demo/);

    await page.goto("/notfound");
    await expect(page).toHaveTitle(/SolidStart 404/);
  });
});
