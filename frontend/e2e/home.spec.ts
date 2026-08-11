import { test, expect } from "@playwright/test";

// Jedi is the home page now (issue #62): `/` serves the Jedi feed under the
// global Jedi-styled nav. This spec covers the home route's chrome; the Jedi
// feature UI is covered in jedi.spec.ts (also at `/`).
test.describe("Home Page", () => {
  test("loads at / with the Jedi title", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Little Jedi/);
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("displays the Jedi hero heading", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();
  });

  test("renders the global nav brand and links", async ({ page }) => {
    await page.goto("/");

    // The brand is the home affordance (no separate Home link).
    await expect(page.getByRole("link", { name: /awesome/i })).toHaveAttribute("href", "/");

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    await expect(nav.getByRole("link", { name: "Readme" })).toHaveAttribute("href", "/readme");
    await expect(nav.getByRole("link", { name: "FullStack" })).toHaveAttribute(
      "href",
      "/fullstack",
    );
  });

  test("has working external link to solidjs.com in footer", async ({ page }) => {
    await page.goto("/");

    const solidjsLink = page.locator("footer").getByRole("link", { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute("href", "https://solidjs.com");
    await expect(solidjsLink).toHaveAttribute("target", "_blank");
  });

  test("has an About link in the footer that navigates", async ({ page }) => {
    await page.goto("/");

    const aboutLink = page.locator("footer").getByRole("link", { name: /^About$/i });
    await expect(aboutLink).toHaveAttribute("href", "/about");
    await aboutLink.click();

    await expect(page).toHaveURL("http://localhost:3000/about");
    await expect(page.getByRole("heading", { name: /^About$/i })).toBeVisible();
  });

  test("marks the footer Home link active on /", async ({ page }) => {
    await page.goto("/");

    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveClass(/border-sky-600/);
  });

  test("has a footer with two paragraphs", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer.locator("p")).toHaveCount(2);
  });
});
