import { test, expect } from "@playwright/test";

test.describe("Jedi Page", () => {
  test("should load successfully and display correct title", async ({ page }) => {
    await page.goto("/jedi");

    await expect(page).toHaveTitle(/SolidStart Jedi Kitty/);
    await expect(page).toHaveURL("http://localhost:3000/jedi");
  });

  test("should display page heading", async ({ page }) => {
    await page.goto("/jedi");

    // Should have an h1 heading
    const heading = page.getByRole("heading", { name: /Jedi Kitty/i });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("Jedi Kitty");
  });

  test("should display h2 page headings", async ({ page }) => {
    await page.goto("/jedi");

    // Should have 2 h2 headings
    const h2Headings = page.getByRole("heading", { level: 2 });
    const count = await h2Headings.count();
    expect(count).toBe(2);
  });

  test("should have working external link to solidjs.com in footer", async ({ page }) => {
    await page.goto("/jedi");

    const solidjsLink = page.locator("footer").getByRole("link", { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute("href", "https://solidjs.com");
    await expect(solidjsLink).toHaveAttribute("target", "_blank");
  });

  test("should have navigation link to Home page in footer", async ({ page }) => {
    await page.goto("/jedi");

    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("should navigate to Home page when clicking footer link", async ({ page }) => {
    await page.goto("/jedi");

    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await homeLink.click();

    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test("should display current page indicator in footer", async ({ page }) => {
    await page.goto("/jedi");

    // Check that Jedi link has active styling in footer
    const jediLink = page.locator("footer").getByRole("link", { name: /^Jedi$/i });
    await expect(jediLink).toBeVisible();
    await expect(jediLink).toHaveClass(/border-sky-600/);
  });

  test("should have proper page structure", async ({ page }) => {
    await page.goto("/jedi");

    const main = page.locator("main");
    const footer = page.locator("footer");
    await expect(main).toBeVisible();
    await expect(footer).toBeVisible();

    // Verify key elements exist within main
    await expect(main.locator("h1")).toBeVisible();
    await expect(footer.locator("p")).toHaveCount(2);
  });
});
