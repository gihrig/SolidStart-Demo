import { test, expect } from "@playwright/test";

test.describe("Jedi Page", () => {
  test("should load successfully and display correct title", async ({ page }) => {
    await page.goto("/jedi");
    await expect(page).toHaveTitle(/Little Jedi/);
    await expect(page).toHaveURL("http://localhost:3000/jedi");
  });

  test("should display hero section with title and CTA", async ({ page }) => {
    await page.goto("/jedi");
    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { name: /awesome photos/i })).toBeVisible();
    await expect(hero.getByRole("link", { name: /get started/i })).toBeVisible();
  });

  test("should display main article with image and caption", async ({ page }) => {
    await page.goto("/jedi");
    const article = page.locator("article").first();
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await expect(article.getByRole("img").first()).toBeVisible();
    await expect(article.getByText(/jedi kitty protects/i)).toBeVisible();
  });

  test("should display sidebar with categories on desktop", async ({ page }) => {
    await page.goto("/jedi");
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    await expect(aside.getByRole("heading", { name: /categories/i })).toBeVisible();
    await expect(aside.getByText("Landscape")).toBeVisible();
    await expect(aside.getByText("Animals")).toBeVisible();
  });

  test("should toggle mobile sidebar when button clicked", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    await expect(toggle).toBeVisible();
    const aside = page.locator("aside");
    await expect(aside).toHaveAttribute("inert");
    await toggle.click();
    await expect(aside).toBeVisible();
  });

  test("should display all three sidebar cards", async ({ page }) => {
    await page.goto("/jedi");
    const aside = page.locator("aside");
    await expect(aside.getByRole("heading", { name: /categories/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top photos/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top captions/i })).toBeVisible();
  });

  test("should have global nav links on jedi page", async ({ page }) => {
    await page.goto("/jedi");
    const nav = page.getByRole("navigation", { name: /^Main$/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /home/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /about/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /fullstack/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /readme/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /jedi/i })).toBeVisible();
  });

  test("should display author, tags, and post actions", async ({ page }) => {
    await page.goto("/jedi");
    const article = page.locator("article").first();
    await expect(article.getByRole("link").filter({ hasText: "Lisa" })).toBeVisible();
    await expect(article.getByRole("button", { name: /animals/i })).toBeVisible();
    await expect(article.getByRole("button", { name: /cute/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /Comments/i })).toBeVisible();
    await expect(article.getByRole("button", { name: /Like/i })).toBeVisible();
    await expect(article.getByRole("button", { name: /Edit/i })).toBeVisible();
    await expect(article.getByRole("button", { name: /Delete/i })).toBeVisible();
  });

  test("should have responsive layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/jedi");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();
    await page.setViewportSize({ width: 375, height: 667 });
    // Gate on toggle button — proves isMobile() signal updated after matchMedia fired
    await expect(page.getByRole("button", { name: /toggle sidebar/i })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toHaveAttribute("inert");
  });
});

test.describe("Jedi Page - Nav slide transitions (regression #28)", () => {
  test("mobile nav menu slides via `translate` (not just opacity) on close", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/jedi");
    const navBtn = page.getByRole("button", { name: /toggle navigation/i });
    const nav = page.getByRole("navigation", { name: /jedi site navigation/i });

    // Tailwind v4 keeps the menu's motion in the `translate` property; it must be
    // in transition-property or the menu jumps (abrupt) instead of sliding (#28).
    const tp = await nav.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(tp).toContain("opacity");
    expect(tp).toContain("translate");

    // Behavioral guard: closing must animate `translate` to completion, not jump.
    await navBtn.click(); // open
    await expect(nav).toHaveCSS("opacity", "1"); // wait for the open transition to settle
    const translateAnimated = await nav.evaluate(
      (el) =>
        new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 1000);
          el.addEventListener("transitionend", (e) => {
            if ((e as TransitionEvent).propertyName === "translate") {
              clearTimeout(timer);
              resolve(true);
            }
          });
          document
            .querySelector<HTMLButtonElement>('button[aria-label="Toggle navigation"]')!
            .click();
        }),
    );
    expect(translateAnimated).toBe(true);
  });

  test("profile dropdown transitions `translate` and `scale`, not just opacity", async ({
    page,
  }) => {
    await page.goto("/jedi");
    // Same v4 fix: scale-90 / -translate-y-5 live in the `scale` / `translate` props.
    const tp = await page
      .locator("#jedi-profile-menu")
      .evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(tp).toContain("opacity");
    expect(tp).toContain("translate");
    expect(tp).toContain("scale");
  });
});

test.describe("Jedi Page - Profile dropdown (popup disclosure, #55 C5)", () => {
  test("opens on click, closes on click-outside, inert while closed", async ({ page }) => {
    await page.goto("/jedi");
    const trigger = page.getByRole("button", { name: /profile menu/i });
    const menu = page.locator("#jedi-profile-menu");

    // Popup mode: hidden from AT + tab order (inert) whenever closed — on desktop
    // too, unlike the drawers. The trigger's aria-controls points at this menu.
    await expect(trigger).toHaveAttribute("aria-controls", "jedi-profile-menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAttribute("inert");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(menu).not.toHaveAttribute("inert");

    // A click outside the wrapping <li> boundary dismisses it (ref click-outside).
    await page.getByRole("heading", { name: /awesome photos/i }).click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAttribute("inert");
  });
});

test.describe("Jedi Page - Footer (preserved from existing tests)", () => {
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
    const jediLink = page.locator("footer").getByRole("link", { name: /^Jedi$/i });
    await expect(jediLink).toBeVisible();
    await expect(jediLink).toHaveClass(/border-sky-600/);
  });
});

test.describe("Jedi Page - Theme Toggle", () => {
  test("should display theme toggle button", async ({ page }) => {
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /theme/i });
    await expect(toggle).toBeVisible();
  });

  test("should cycle through auto → light → dark → auto modes", async ({ page }) => {
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /theme/i });

    // Start at auto (default), click to light
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /^Theme: light\b/);
    const htmlLight = page.locator("html");
    await expect(htmlLight).toHaveAttribute("data-theme", "light");
    expect(await htmlLight.evaluate((el) => el.style.colorScheme)).toBe("light");

    // Click to dark
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /^Theme: dark\b/);
    const htmlDark = page.locator("html");
    await expect(htmlDark).toHaveAttribute("data-theme", "dark");
    expect(await htmlDark.evaluate((el) => el.style.colorScheme)).toBe("dark");

    // Click to auto (aria-label shows "system" — user-facing term for auto mode)
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /^Theme: system\b/);
    const htmlAuto = page.locator("html");
    expect(await htmlAuto.getAttribute("data-theme")).toBeNull();
  });

  test("should persist theme choice across page reload", async ({ page }) => {
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /theme/i });

    // Set to light explicitly: auto -> light
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /^Theme: light\b/);

    // Verify localStorage was set
    const stored = await page.evaluate(() => window.localStorage.getItem("theme"));
    expect(stored).toBe("light");

    // Reload and verify theme persists
    await page.reload();
    const htmlAfterReload = page.locator("html");
    await expect(htmlAfterReload).toHaveAttribute("data-theme", "light");
    expect(await htmlAfterReload.evaluate((el) => el.style.colorScheme)).toBe("light");
  });

  test("should respect system dark preference in auto mode", async ({ page }) => {
    // Emulate dark system preference
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/jedi");

    // In auto mode (default), system dark preference should resolve to colorScheme dark
    const html = page.locator("html");
    expect(await html.evaluate((el) => el.style.colorScheme)).toBe("dark");
    expect(await html.getAttribute("data-theme")).toBeNull();

    // Switch to light system preference
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/jedi");
    const htmlLight = page.locator("html");
    expect(await htmlLight.evaluate((el) => el.style.colorScheme)).toBe("light");
    expect(await htmlLight.getAttribute("data-theme")).toBeNull();
  });
});
