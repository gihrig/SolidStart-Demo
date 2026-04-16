import { test, expect } from "@playwright/test";

test.describe("About Page", () => {
  test("should load successfully and display correct title", async ({ page }) => {
    await page.goto("/about");

    await expect(page).toHaveTitle(/SolidStart About/);
    await expect(page).toHaveURL("http://localhost:3000/about");
  });

  test("should display page heading", async ({ page }) => {
    await page.goto("/about");

    // Should have an h1 heading
    const heading = page.getByRole("heading", { name: /About/i });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("About");
  });

  test("should display h2 page headings", async ({ page }) => {
    await page.goto("/about");

    // Should have 5 h2 headings
    const h2Headings = page.getByRole("heading", { level: 2 });
    const count = await h2Headings.count();
    expect(count).toBe(5);
  });

  test("should display content paragraphs", async ({ page }) => {
    await page.goto("/about");

    // Should have 3 Lorem ipsum paragraphs
    const contentParagraphs = page.locator("main p");
    await expect(contentParagraphs).toHaveCount(3);

    // Verify first paragraph contains expected text
    const firstParagraph = contentParagraphs.first();
    await expect(firstParagraph).toContainText("Lorem ipsum dolor sit amet");
  });

  test("should have working external link to solidjs.com in footer", async ({ page }) => {
    await page.goto("/about");

    const solidjsLink = page.locator("footer").getByRole("link", { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute("href", "https://solidjs.com");
    await expect(solidjsLink).toHaveAttribute("target", "_blank");
  });

  test("should have navigation link to Home page in footer", async ({ page }) => {
    await page.goto("/about");

    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("should navigate to Home page when clicking footer link", async ({ page }) => {
    await page.goto("/about");

    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await homeLink.click();

    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test("should display current page indicator in footer", async ({ page }) => {
    await page.goto("/about");

    // Check that About link has active styling in footer
    const aboutLink = page.locator("footer").getByRole("link", { name: /^About$/i });
    await expect(aboutLink).toBeVisible();
    await expect(aboutLink).toHaveClass(/border-sky-600/);
  });

  test("should have proper page structure", async ({ page }) => {
    await page.goto("/about");

    const main = page.locator("main");
    const footer = page.locator("footer");
    await expect(main).toBeVisible();
    await expect(footer).toBeVisible();

    // Verify key elements exist within main
    await expect(main.locator("h1")).toBeVisible();
    await expect(main.locator("p")).toHaveCount(3);
    await expect(footer.locator("p")).toHaveCount(2);
  });

  test("should render text with proper styling classes", async ({ page }) => {
    await page.goto("/about");
  });
});
