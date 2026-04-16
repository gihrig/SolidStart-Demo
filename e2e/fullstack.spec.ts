import { test, expect } from "@playwright/test";

test.describe("Fullstack Integration Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fullstack");
    // Wait for JS hydration to complete before any test interacts with the page.
    // Under full-suite load the dev server transpiles modules on demand; the HTML
    // arrives (SSR) before the bundle is ready. Clicking before onSubmit is attached
    // triggers a default browser form GET, reloading the page to the unauthenticated
    // state with no error — matching the failure snapshot. networkidle ensures all
    // JS modules have been fetched and executed before proceeding.
    await page.waitForLoadState("networkidle");
  });

  test("should display page title and heading", async ({ page }) => {
    await expect(page).toHaveTitle(/Full-Stack Demo/);
    await expect(page.getByRole("heading", { name: /Full-Stack Integration Demo/i })).toBeVisible();
  });

  test("should show login form when not authenticated", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("should have demo credentials pre-filled", async ({ page }) => {
    const usernameInput = page.getByLabel(/username/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(usernameInput).toHaveValue("demo1");
    await expect(passwordInput).toHaveValue("welcome");
  });

  // Integration tests (require running backend)
  test.describe("with backend", () => {
    test("should login successfully with demo credentials", async ({ page }) => {
      await page.getByRole("button", { name: /login/i }).click();

      // Wait for login to complete
      await expect(page.getByText(/logged in as: demo1/i)).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByRole("button", { name: /logout/i })).toBeVisible();
    });

    test("should show agents panel after login", async ({ page }) => {
      await page.getByRole("button", { name: /login/i }).click();
      await expect(page.getByText(/logged in as/i)).toBeVisible({
        timeout: 10000,
      });

      await expect(page.getByRole("heading", { name: /agents/i })).toBeVisible();
      await expect(page.getByPlaceholder(/agent name/i)).toBeVisible();
    });

    test("should show real-time indicator", async ({ page }) => {
      await page.getByRole("button", { name: /login/i }).click();
      await expect(page.getByText(/logged in as/i)).toBeVisible({
        timeout: 5000,
      });

      // Create agent and conversation to see message panel
      await page.getByPlaceholder(/agent name/i).fill("E2E Test Agent");
      await page.getByRole("button", { name: /create agent/i }).click();
      await expect(page.getByText("E2E Test Agent").first()).toBeVisible({
        timeout: 5000,
      });

      await page.getByPlaceholder(/conversation title/i).fill("E2E Test Conv");
      await page.getByRole("button", { name: /create conv/i }).click();
      await expect(page.getByText("E2E Test Conv").first()).toBeVisible({
        timeout: 5000,
      });

      // Should show Live/Offline indicator
      await expect(page.getByText(/live|offline/i)).toBeVisible();
    });

    test("should create agent, conversation, and send message", async ({ page }) => {
      // Login
      await page.getByRole("button", { name: /login/i }).click();
      await expect(page.getByText(/logged in as/i)).toBeVisible({
        timeout: 5000,
      });

      // Create agent
      await page.getByPlaceholder(/agent name/i).fill("E2E Test Agent");
      await page.getByRole("button", { name: /create agent/i }).click();
      await expect(page.getByText("E2E Test Agent").first()).toBeVisible({
        timeout: 5000,
      });

      // Create conversation
      await page.getByPlaceholder(/conversation title/i).fill("E2E Test Conv");
      await page.getByRole("button", { name: /create conv/i }).click();
      await expect(page.getByText("E2E Test Conv").first()).toBeVisible({
        timeout: 5000,
      });

      // Wait for message panel to finish loading before sending
      await expect(page.getByText(/no messages yet/i)).toBeVisible({
        timeout: 5000,
      });

      // Send message
      await page.getByPlaceholder(/type a message/i).fill("Hello from E2E test!");
      await page.getByRole("button", { name: /send/i }).click();
      await expect(page.getByText("Hello from E2E test!")).toBeVisible({
        timeout: 5000,
      });
    });

    test("should logout successfully", async ({ page }) => {
      await page.getByRole("button", { name: /login/i }).click();
      await expect(page.getByText(/logged in as/i)).toBeVisible({
        timeout: 5000,
      });

      await page.getByRole("button", { name: /logout/i }).click();

      await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    });
  });

  test("should have working external link to solidjs.com in footer", async ({ page }) => {
    const solidjsLink = page.locator("footer").getByRole("link", { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute("href", "https://solidjs.com");
    await expect(solidjsLink).toHaveAttribute("target", "_blank");
  });

  test("should have navigation link to Home page in footer", async ({ page }) => {
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("should navigate to Home page when clicking footer link", async ({ page }) => {
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await homeLink.click();

    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test("should display current page indicator in footer", async ({ page }) => {
    const fullstackLink = page.locator("footer").getByRole("link", { name: /^FullStack$/i });
    await expect(fullstackLink).toBeVisible();
    await expect(fullstackLink).toHaveClass(/border-sky-600/);
  });

  test("should have proper page structure", async ({ page }) => {
    const main = page.locator("main");
    const footer = page.locator("footer");
    await expect(main).toBeVisible();
    await expect(footer).toBeVisible();
  });
});
