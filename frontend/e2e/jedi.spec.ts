import { test, expect } from "@playwright/test";
import { loginAs } from "./login";

// Jedi is the home page now (#62): it renders at `/` under the global Jedi nav.
test.describe("Jedi Page", () => {
  test("should load successfully and display correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Little Jedi/);
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("should display hero section with title and CTA", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { name: /awesome photos/i })).toBeVisible();
    await expect(hero.getByRole("link", { name: /get started/i })).toBeVisible();
  });

  test("should display main article with image and caption", async ({ page }) => {
    await page.goto("/");
    const article = page.locator("article").first();
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await expect(article.getByRole("img").first()).toBeVisible();
    await expect(article.getByText(/jedi kitty protects/i)).toBeVisible();
  });

  test("should display sidebar with categories on desktop", async ({ page }) => {
    await page.goto("/");
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    await expect(aside.getByRole("heading", { name: /categories/i })).toBeVisible();
    await expect(aside.getByText("Landscape")).toBeVisible();
    await expect(aside.getByText("Animals")).toBeVisible();
  });

  test("should toggle mobile sidebar when button clicked", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    await expect(toggle).toBeVisible();
    const aside = page.locator("aside");
    await expect(aside).toHaveAttribute("inert");
    await toggle.click();
    await expect(aside).toBeVisible();
  });

  test("should display all three sidebar cards", async ({ page }) => {
    await page.goto("/");
    const aside = page.locator("aside");
    await expect(aside.getByRole("heading", { name: /categories/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top photos/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top captions/i })).toBeVisible();
  });

  test("should have global nav links on the home page", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: /^Main$/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /about/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /readme/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: "FullStack" })).toHaveCount(0);
    // The brand is the home affordance; no Home or Jedi nav link.
    await expect(page.getByRole("link", { name: /awesome/i })).toHaveAttribute("href", "/");
  });

  // A visitor who is not logged in sees the Comments toggle, the fire-heart and
  // the count in the Post actions and the Caption actions: no Like, Add, Edit,
  // or Delete (#123).
  test("should display author, tags, and like counts, with no actions for a visitor", async ({
    page,
  }) => {
    await page.goto("/");
    const article = page.locator("article").first();
    await expect(article.getByRole("link").filter({ hasText: "Lisa" })).toBeVisible();
    await expect(article.getByRole("button", { name: /animals/i })).toBeVisible();
    await expect(article.getByRole("button", { name: /cute/i })).toBeVisible();
    await expect(article.getByRole("button", { name: /^Post Comments, /i })).toBeVisible();
    await expect(article.getByRole("button", { name: /^Caption Comments, /i })).toBeVisible();
    await expect(article.getByText("Likes: 5")).toBeVisible();
    await expect(article.getByText("Caption likes: 8")).toBeVisible();
    for (const name of [/^Like /i, /^Edit /i, /^Delete /i, /^Add Caption$/i]) {
      await expect(article.getByRole("button", { name })).toHaveCount(0);
    }
  });

  // The seeded back-end Likes match the fixture likeCount (#177), so Top Photos
  // ranks Posts [1, 3, 2, 4] and Post 1's Top Captions rank [1, 2].
  test("should rank Top Photos and Top Captions by the seeded like counts", async ({ page }) => {
    await page.goto("/");
    const article = page.locator("article").first();
    await expect(article.getByText("Likes: 5")).toBeVisible();

    const photos = page.getByRole("listbox", { name: "Top Photos" }).getByRole("option");
    await expect(photos).toHaveText([
      /Lisa\s*\(5 Likes\)/,
      /Lisa\s*\(5 Likes\)/,
      /Homer\s*\(4 Likes\)/,
      /Homer\s*\(3 Likes\)/,
    ]);
    // Posts 1 and 3 render the same text, so the photo alt pins the tie-break order.
    const rankedAlts = ["Little Jedi cat", "Camouflaged cat", "Brilliant tree", "Serene Beach"];
    for (const [i, alt] of rankedAlts.entries()) {
      await expect(photos.nth(i).getByRole("img", { name: alt, exact: true })).toBeVisible();
    }

    const captions = page.getByRole("listbox", { name: "Top Captions" }).getByRole("option");
    await expect(captions).toHaveText([/Lisa\s*\(8 Likes\)/, /Bart\s*\(5 Likes\)/]);
  });

  test("should have responsive layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();
    await page.setViewportSize({ width: 375, height: 667 });
    // Gate on toggle button — proves isMobile() signal updated after matchMedia fired
    await expect(page.getByRole("button", { name: /toggle sidebar/i })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toHaveAttribute("inert");
  });
});

test.describe("Home Page - Nav slide transitions (regression #28)", () => {
  test("mobile nav menu slides via `translate` (not just opacity) on close", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const navBtn = page.getByRole("button", { name: /toggle navigation/i });
    const nav = page.getByRole("navigation", { name: /site menu/i });

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
    await page.goto("/");
    // Same v4 fix: scale-90 / -translate-y-5 live in the `scale` / `translate` props.
    const tp = await page
      .locator("#profile-menu")
      .evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(tp).toContain("opacity");
    expect(tp).toContain("translate");
    expect(tp).toContain("scale");
  });
});

test.describe("Home Page - Profile dropdown (popup disclosure, #55 C5)", () => {
  test("opens on click, closes on click-outside, inert while closed", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /profile menu/i });
    const menu = page.locator("#profile-menu");

    // Popup mode: hidden from AT + tab order (inert) whenever closed — on desktop
    // too, unlike the drawers. The trigger's aria-controls points at this menu.
    await expect(trigger).toHaveAttribute("aria-controls", "profile-menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAttribute("inert");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(menu).not.toHaveAttribute("inert");

    // A click outside the wrapping boundary dismisses it (ref click-outside).
    await page.getByRole("heading", { name: /awesome photos/i }).click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAttribute("inert");
  });
});

test.describe("Home Page - Footer (preserved from existing tests)", () => {
  test("should have working external link to solidjs.com in footer", async ({ page }) => {
    await page.goto("/");
    const solidjsLink = page.locator("footer").getByRole("link", { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute("href", "https://solidjs.com");
    await expect(solidjsLink).toHaveAttribute("target", "_blank");
  });

  test("should have navigation link to Home page in footer", async ({ page }) => {
    await page.goto("/");
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("should navigate home when clicking the footer Home link", async ({ page }) => {
    await page.goto("/");
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await homeLink.click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();
  });

  test("marks the footer Home link active on the home page", async ({ page }) => {
    await page.goto("/");
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveClass(/border-sky-600/);
  });
});

test.describe("Home Page - Theme Toggle", () => {
  test("should display theme toggle button", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /theme/i });
    await expect(toggle).toBeVisible();
  });

  test("should cycle through auto → light → dark → auto modes", async ({ page }) => {
    await page.goto("/");
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
    await page.goto("/");
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
    await page.goto("/");

    // In auto mode (default), system dark preference should resolve to colorScheme dark
    const html = page.locator("html");
    expect(await html.evaluate((el) => el.style.colorScheme)).toBe("dark");
    expect(await html.getAttribute("data-theme")).toBeNull();

    // Switch to light system preference
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const htmlLight = page.locator("html");
    expect(await htmlLight.evaluate((el) => el.style.colorScheme)).toBe("light");
    expect(await htmlLight.getAttribute("data-theme")).toBeNull();
  });
});

// An unsaved Comment is guarded (ADR-0030): a move that would drop it asks first.
test.describe("Jedi Page - Draft guard (#124)", () => {
  test("a Top Photo click with a Comment Draft shows the dialog; Keep editing keeps it", async ({
    page,
  }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");

    const article = page.locator("article").first();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await article.getByRole("button", { name: /^Post Comments, /i }).click();
    const compose = article.getByRole("textbox", { name: "Post Comment" });
    await compose.fill("A draft I have not posted");

    const photos = page.getByRole("listbox", { name: "Top Photos" });
    await photos.getByRole("option").filter({ hasText: "Homer" }).first().click();
    const dialog = page.getByRole("dialog", { name: "You have unsaved changes. Discard them?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();

    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await expect(compose).toHaveValue("A draft I have not posted");
  });

  test("a New Post Draft: Escape asks, and the browser's Back asks, then Discard goes back (#214)", async ({
    page,
  }) => {
    await page.goto("/about");
    await loginAs(page, "demo1", "welcome");
    await page
      .getByRole("banner")
      .getByRole("link", { name: /awesome/i })
      .click();
    await expect(page).toHaveURL("http://localhost:3000/");

    await page.getByRole("banner").getByRole("button", { name: "New Post" }).click();
    const newPost = page.getByRole("dialog", { name: "New Post" });
    const title = newPost.getByLabel("Title");
    await title.fill("A Post I have not sent");
    const question = page.getByRole("dialog", { name: "You have unsaved changes. Discard them?" });

    await title.press("Escape");
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "Keep editing" }).click();
    await expect(question).toBeHidden();
    await expect(title).toHaveValue("A Post I have not sent");

    await page.goBack();
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "Discard" }).click();
    await expect(page).toHaveURL("http://localhost:3000/about");
    await expect(newPost).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a Caption Comments click with a Post Comment Draft asks; Discard opens the Caption panel (#210)", async ({
    page,
  }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");

    const article = page.locator("article").first();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await article.getByRole("button", { name: /^Post Comments, /i }).click();
    const compose = article.getByRole("textbox", { name: "Post Comment" });
    await compose.fill("A draft I have not posted");

    const captionToggle = article.getByRole("button", { name: /^Caption Comments, /i });
    const question = page.getByRole("dialog", { name: "You have unsaved changes. Discard them?" });
    await captionToggle.click();
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "Keep editing" }).click();
    await expect(question).toBeHidden();
    await expect(compose).toHaveValue("A draft I have not posted");

    await captionToggle.click();
    await question.getByRole("button", { name: "Discard" }).click();
    const panel = article.getByRole("region", { name: "Caption Comments" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Caption Comment" })).toHaveValue("");
    await expect(article.getByRole("region", { name: "Post Comments" })).toHaveCount(0);
  });
});

// Each Comment row shows its author, its time and its text (#125).
test.describe("Jedi Page - Comment row (#125)", () => {
  test("demo1 posts a Comment, sees the author row, then deletes it", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");

    const article = page.locator("article").first();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await article.getByRole("button", { name: /^Post Comments, /i }).click();
    // A unique text, so a row left by an earlier failed run cannot match.
    const text = `e2e comment ${Date.now()}`;
    await article.getByRole("textbox", { name: "Post Comment" }).fill(text);
    await article.getByRole("button", { name: "Add Comment" }).click();

    const row = article.getByRole("listitem").filter({ hasText: text });
    await expect(row).toBeVisible();
    await expect(row.getByText("demo1", { exact: true })).toBeVisible();
    await expect(row.getByTestId("comment-initials")).toHaveText("DE");
    await expect(row.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);

    // Delete it, so a rerun starts clean.
    await row.getByRole("button", { name: "Delete comment" }).click();
    await expect(row).toHaveCount(0);
  });
});

// A Comment written in markdown renders as sanitized HTML (#126).
test.describe("Jedi Page - Comment markdown (#126)", () => {
  test("demo1 posts **bold**, sees a strong, then deletes it", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");

    const article = page.locator("article").first();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await article.getByRole("button", { name: /^Post Comments, /i }).click();
    // A unique text, so a row left by an earlier failed run cannot match.
    const text = `e2e bold ${Date.now()}`;
    await article.getByRole("textbox", { name: "Post Comment" }).fill(`**${text}**`);
    await article.getByRole("button", { name: "Add Comment" }).click();

    const row = article.getByRole("listitem").filter({ hasText: text });
    await expect(row.locator("strong")).toHaveText(text);
    await expect(row).not.toContainText("**");

    // Delete it, so a rerun starts clean.
    await row.getByRole("button", { name: "Delete comment" }).click();
    await expect(row).toHaveCount(0);
  });
});

// A Caption has its own Comment thread (#127), opened from the Caption actions.
test.describe("Jedi Page - Caption Comments (#127)", () => {
  test("demo1 opens a Caption thread, posts a Comment, sees it, then deletes it", async ({
    page,
  }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");

    const article = page.locator("article").first();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await article.getByRole("button", { name: /^Caption Comments, /i }).click();
    const panel = article.getByRole("region", { name: "Caption Comments" });
    // A unique text, so a row left by an earlier failed run cannot match.
    const text = `e2e caption comment ${Date.now()}`;
    await panel.getByRole("textbox", { name: "Caption Comment" }).fill(text);
    await panel.getByRole("button", { name: "Add Comment" }).click();

    const row = panel.getByRole("listitem").filter({ hasText: text });
    await expect(row).toBeVisible();
    await expect(row.getByText("demo1", { exact: true })).toBeVisible();

    // Delete it, so a rerun starts clean.
    await row.getByRole("button", { name: "Delete comment" }).click();
    await expect(row).toHaveCount(0);
  });
});
