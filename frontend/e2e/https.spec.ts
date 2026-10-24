import { test, expect } from "@playwright/test";
import { loginAs } from "./login";

// The HTTPS edge (ADR-0034, #233): one origin over https, as in production.
test.describe("HTTPS edge", () => {
  // WebKit drops a `Secure` cookie on http://localhost (#233 findings).
  test("a Secure cookie survives a reload", async ({ page }) => {
    await page.goto("/about");
    await page.evaluate(() => {
      document.cookie = "https-probe=1; Secure; Path=/";
    });

    await page.reload();

    expect(await page.evaluate(() => document.cookie)).toContain("https-probe=1");
  });

  test("login and the live socket use the page's origin", async ({ page }) => {
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    const login = page.waitForRequest((r) => r.url().endsWith("/api/login"));
    const socket = page.waitForEvent("websocket");

    await loginAs(page, "demo1", "welcome");

    expect(new URL((await login).url()).origin).toBe(origin);
    expect((await socket).url()).toBe(`${origin.replace(/^http/, "ws")}/ws`);
  });
});
