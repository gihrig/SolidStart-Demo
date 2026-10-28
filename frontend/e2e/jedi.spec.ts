import { test, expect, type Locator, type Page, type Response } from "@playwright/test";
import { loginAs } from "./login";

// Jedi is the home page now (#62): it renders at `/` under the global Jedi nav.
test.describe("Jedi Page", () => {
  test("should load successfully and display correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Little Jedi/);
    await expect(page).toHaveURL("/");
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
    // The Brand link goes home; there is no Jedi nav link.
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

  // A visitor's fire-heart and count sit right after each Comments toggle, not
  // at the far end of the line (#210).
  test("a visitor's fire-heart and count sit right after each Comments toggle", async ({
    page,
  }) => {
    await page.goto("/");
    const article = page.locator("article").first();
    for (const [toggleName, count] of [
      [/^Post Comments, /i, "Likes: 5"],
      [/^Caption Comments, /i, "Caption likes: 8"],
    ] as const) {
      const toggle = (await article.getByRole("button", { name: toggleName }).boundingBox())!;
      const likes = (await article.getByText(count).boundingBox())!;
      expect(likes.x - (toggle.x + toggle.width), count).toBeLessThan(64);
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

  // An action row's click area is its highlighted area (#241). jsdom has no
  // layout, so only a browser can prove it.
  async function openProfileMenu(page: Page) {
    await page.waitForLoadState("networkidle");
    await page.getByRole("banner").getByRole("button", { name: "Profile menu" }).click();
    const menu = page.locator("#profile-menu");
    // The panel opens with a scale transition; measure it at full size.
    await menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    return menu;
  }

  function actionRow(menu: Locator, name: string) {
    return menu
      .getByRole("listitem")
      .filter({ has: menu.page().getByRole("button", { name, exact: true }) });
  }

  // The button fills its row: the same width, in each browser.
  async function expectFillsRow(row: Locator) {
    const rowBox = await row.boundingBox();
    const buttonBox = await row.getByRole("button").boundingBox();
    expect(Math.abs(buttonBox!.width - rowBox!.width)).toBeLessThan(0.5);
  }

  // A click 4 px from the row's right edge, right of the button's text.
  async function clickRowEdge(row: Locator) {
    const box = await row.boundingBox();
    await row.click({ position: { x: box!.width - 4, y: box!.height / 2 } });
  }

  test("logged out, a click near the right edge of My Profile or Log In runs it", async ({
    page,
  }) => {
    await page.goto("/");
    const menu = await openProfileMenu(page);
    const myProfile = actionRow(menu, "My Profile");
    const logIn = actionRow(menu, "Log In");
    await expectFillsRow(myProfile);
    await expectFillsRow(logIn);

    let alertText = "";
    page.once("dialog", async (dialog) => {
      alertText = dialog.message();
      await dialog.dismiss();
    });
    await clickRowEdge(myProfile);
    await expect.poll(() => alertText).toBe("Not implemented");

    await clickRowEdge(logIn);
    await expect(page.getByRole("dialog", { name: "Login" })).toBeVisible();
  });

  test("logged in, a click near the right edge of Log Out logs the User off", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");
    const header = page.getByRole("banner");
    const menu = await openProfileMenu(page);
    const logOut = actionRow(menu, "Log Out");
    await expectFillsRow(logOut);

    await clickRowEdge(logOut);
    await expect(header.getByText("demo1", { exact: true })).toBeHidden();
    await expect(actionRow(menu, "Log In")).toHaveCount(1);
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
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /awesome photos & captions/i })).toBeVisible();
  });

  test("marks the footer Home link active on the home page", async ({ page }) => {
    await page.goto("/");
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveClass(/border-sky-600/);
  });
});

// The Theme items in the Profile menu, and the saved theme in an HttpOnly cookie
// that the server renders (#200, ADR-0033).
test.describe("Home Page - Theme", () => {
  // Open the Profile menu after hydration, so the clicks reach live handlers.
  async function openThemeGroup(page: Page) {
    await page.waitForLoadState("networkidle");
    const header = page.getByRole("banner");
    await header.getByRole("button", { name: "Profile menu" }).click();
    const group = header.getByRole("group", { name: "Theme" });
    await expect(group).toBeVisible();
    return group;
  }

  // The check mark is the first icon of a Theme item.
  function checkMark(group: Locator, name: string) {
    return group.locator("label", { hasText: name }).locator("svg").first();
  }

  async function themeCookie(page: Page) {
    return (await page.context().cookies()).find((cookie) => cookie.name === "theme");
  }

  // A choice saves through the server function; wait until the cookie holds it.
  async function expectSaved(page: Page, value: string) {
    await expect.poll(async () => (await themeCookie(page))?.value).toBe(value);
  }

  test("with no cookie, System Theme is checked and no data-theme renders", async ({ page }) => {
    await page.goto("/");
    const group = await openThemeGroup(page);
    expect(await page.locator("html").getAttribute("data-theme")).toBeNull();
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(group.getByRole("radio", { name: "System Theme" })).toBeChecked();
    await expect(checkMark(group, "System Theme")).toBeVisible();
    await expect(checkMark(group, "Light Theme")).toBeHidden();
    await expect(checkMark(group, "Dark Theme")).toBeHidden();
    expect(await themeCookie(page)).toBeUndefined();
  });

  test("a logged-out visitor chooses Dark Theme; the page changes and the menu stays open", async ({
    page,
  }) => {
    await page.goto("/");
    const group = await openThemeGroup(page);
    await group.getByText("Dark Theme").click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
      "dark",
    );
    await expect(group.getByRole("radio", { name: "Dark Theme" })).toBeChecked();
    await expect(checkMark(group, "Dark Theme")).toBeVisible();
    await expect(checkMark(group, "System Theme")).toBeHidden();
    await expect(page.getByRole("button", { name: "Profile menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.locator("#profile-menu")).not.toHaveAttribute("inert");
  });

  test("after a reload, the server HTML already has the saved theme", async ({ page }) => {
    await page.goto("/");
    const group = await openThemeGroup(page);
    await group.getByText("Dark Theme").click();
    await expectSaved(page, "dark");

    // The response text is the server HTML, before any script runs.
    const response = await page.reload();
    expect(await response!.text()).toMatch(/<html[^>]*\sdata-theme="dark"/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const reloaded = await openThemeGroup(page);
    await expect(reloaded.getByRole("radio", { name: "Dark Theme" })).toBeChecked();
  });

  test("the cookie is HttpOnly, Secure, SameSite=Lax on path /", async ({ page }) => {
    await page.goto("/");
    const group = await openThemeGroup(page);
    await group.getByText("Dark Theme").click();
    await expectSaved(page, "dark");

    expect(await themeCookie(page)).toMatchObject({
      value: "dark",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });
  });

  test("System Theme writes theme=system, and the page follows the OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const lightBackground = await bodyBackground(page);
    const group = await openThemeGroup(page);
    await group.getByText("Dark Theme").click();
    await expectSaved(page, "dark");
    await group.getByText("System Theme").click();
    await expectSaved(page, "system");

    expect(await page.locator("html").getAttribute("data-theme")).toBeNull();
    expect(await bodyBackground(page)).toBe(lightBackground);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await bodyBackground(page)).not.toBe(lightBackground);

    const response = await page.reload();
    expect(await response!.text()).not.toMatch(/<html[^>]*\sdata-theme=/);
  });

  // CSS, not a script, follows the OS theme in System Theme (#203).
  test("should respect the system preference in System Theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    // In System Theme (default), CSS leaves the choice to the OS: "light dark".
    const html = page.locator("html");
    expect(await html.evaluate((el) => getComputedStyle(el).colorScheme)).toBe("light dark");
    expect(await html.getAttribute("data-theme")).toBeNull();
    const darkBackground = await bodyBackground(page);

    // Switch to light system preference
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const htmlLight = page.locator("html");
    expect(await htmlLight.evaluate((el) => getComputedStyle(el).colorScheme)).toBe("light dark");
    expect(await htmlLight.getAttribute("data-theme")).toBeNull();
    expect(await bodyBackground(page)).not.toBe(darkBackground);
  });

  test("a Light Theme choice holds when the OS theme changes to dark (#203)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const group = await openThemeGroup(page);
    await group.getByText("Light Theme").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const lightBackground = await bodyBackground(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bodyBackground(page)).toBe(lightBackground);
  });

  test("the save refuses a cross-site call", async ({ page }) => {
    await page.goto("/");
    const group = await openThemeGroup(page);
    const [save] = await Promise.all([
      page.waitForRequest(
        (request) => request.method() === "POST" && request.url().includes("/_server"),
      ),
      group.getByText("Dark Theme").click(),
    ]);
    await expectSaved(page, "dark");

    // Send the page's own save request again, with only Sec-Fetch-Site changed.
    const replay = (site: string) =>
      page.request.fetch(save.url(), {
        method: "POST",
        headers: { ...save.headers(), "sec-fetch-site": site },
        data: save.postData() ?? undefined,
      });
    const crossSite = await replay("cross-site");
    expect(crossSite.headers()["set-cookie"]).toBeUndefined();
    // The same request from the same origin sets the cookie, so the check above
    // shows the refusal, not a broken replay.
    const sameOrigin = await replay("same-origin");
    expect(sameOrigin.headers()["set-cookie"]).toMatch(/^theme=dark;/);
  });

  test("the arrow keys change the Theme, and Escape closes the Profile menu", async ({ page }) => {
    await page.goto("/");
    const group = await openThemeGroup(page);
    const system = group.locator("label", { hasText: "System Theme" });
    const ring = (label: Locator) => label.evaluate((el) => getComputedStyle(el).boxShadow);

    // A pointer click shows no focus ring.
    await system.click();
    expect(await ring(system)).toBe("none");

    // A keyboard user tabs in from the Profile menu button: My Profile, Log In,
    // then the checked Theme item, which shows the ring. (WebKit, as Safari on
    // macOS, does not focus a radio on a click.)
    await page.getByRole("button", { name: "Profile menu" }).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
    await expect(group.getByRole("radio", { name: "System Theme" })).toBeFocused();
    expect(await ring(system)).not.toBe("none");

    // A key moves the choice. (WebKit 26.6 does not match :focus-visible on a
    // radio that an arrow key focuses, also in plain HTML, so the ring is not
    // checked here.)
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio", { name: "Light Theme" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio", { name: "Dark Theme" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectSaved(page, "dark");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Profile menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // The closed panel fades out but stays in the page, inert.
    await expect(page.locator("#profile-menu")).toHaveAttribute("inert", "");
  });

  test("a page load renews a valid cookie, and sets none without one", async ({ page }) => {
    const ONE_YEAR = 31536000;
    const setTheme = (value: string) =>
      page.context().addCookies([
        {
          name: "theme",
          value,
          url: "https://localhost:3443",
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          expires: Math.floor(Date.now() / 1000) + 60,
        },
      ]);
    const themeHeader = async (response: Response | null) =>
      (await response!.headersArray()).find(
        (header) => header.name.toLowerCase() === "set-cookie" && header.value.startsWith("theme="),
      );

    // No cookie: the page load sets none.
    expect(await themeHeader(await page.goto("/"))).toBeUndefined();
    expect(await themeCookie(page)).toBeUndefined();

    // A bad value is System Theme, and the page load sets no cookie.
    await setTheme("auto");
    expect(await themeHeader(await page.goto("/"))).toBeUndefined();

    // A cookie that ends in 60 seconds ends about one year later after a load.
    await setTheme("dark");
    const response = await page.goto("/");
    expect((await themeHeader(response))?.value).toBe(
      "theme=dark; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    const expires = (await themeCookie(page))!.expires;
    expect(Math.abs(expires - (Date.now() / 1000 + ONE_YEAR))).toBeLessThan(60);
  });

  test("at 320 px, a visitor can choose a Theme, and each item fits on one line", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const group = await openThemeGroup(page);
    for (const name of ["System Theme", "Light Theme", "Dark Theme"]) {
      const box = (await group.locator("label", { hasText: name }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      // One line: the text needs no more width than the row has, and no icon
      // shrinks to make room. (Computed sizes ignore the menu's scale animation.)
      const fits = await group
        .locator("label", { hasText: name })
        .evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth &&
            [...el.querySelectorAll("svg")].every((svg) => getComputedStyle(svg).width === "16px"),
        );
      expect(fits).toBe(true);
    }
    await group.getByText("Dark Theme").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

// The page background, as the browser computes it.
function bodyBackground(page: Page) {
  return page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
}

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
    await expect(page).toHaveURL("/");

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
    await expect(page).toHaveURL("/about");
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

// Escape is the Cancel of an inline form (ADR-0030). The question that it opens
// stays open: the browser would otherwise close it on the same Escape. Tab
// moves between the question's buttons (#210).
test.describe("Jedi Page - the keyboard in the inline forms and the question (#210)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");
  });
  const question = (page: Page) =>
    page.getByRole("dialog", { name: "You have unsaved changes. Discard them?" });

  test("Escape in the compose box with a Draft asks; Discard empties the box", async ({ page }) => {
    const article = page.locator("article").first();
    await article.getByRole("button", { name: /^Post Comments, /i }).click();
    const compose = article.getByRole("textbox", { name: "Post Comment" });
    await compose.fill("A draft I have not posted");

    await compose.press("Escape");
    await expect(question(page)).toBeVisible();
    await question(page).getByRole("button", { name: "Keep editing" }).click();
    await expect(compose).toHaveValue("A draft I have not posted");

    await compose.press("Escape");
    await question(page).getByRole("button", { name: "Discard" }).click();
    await expect(compose).toHaveValue("");
    await expect(compose).toBeFocused();
  });

  test("Escape in the Add Caption form with a Draft asks; Discard closes the form", async ({
    page,
  }) => {
    const article = page.locator("article").first();
    await article.getByRole("button", { name: "Add Caption" }).click();
    const input = article.getByLabel("Your caption");
    await input.fill("A caption I have not sent");

    await input.press("Escape");
    await expect(question(page)).toBeVisible();
    await question(page).getByRole("button", { name: "Discard" }).click();
    await expect(input).toHaveCount(0);
  });

  test("Escape in the empty compose box closes the panel; focus moves to its toggle", async ({
    page,
  }) => {
    const article = page.locator("article").first();
    const toggle = article.getByRole("button", { name: /^Post Comments, /i });
    await toggle.click();
    await article.getByRole("textbox", { name: "Post Comment" }).press("Escape");
    await expect(article.getByRole("region", { name: "Post Comments" })).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
  });

  test("Tab and Shift+Tab move between the question's buttons, and wrap", async ({ page }) => {
    const article = page.locator("article").first();
    await article.getByRole("button", { name: /^Post Comments, /i }).click();
    const compose = article.getByRole("textbox", { name: "Post Comment" });
    await compose.fill("A draft I have not posted");
    await compose.press("Escape");
    const keep = question(page).getByRole("button", { name: "Keep editing" });
    const discard = question(page).getByRole("button", { name: "Discard" });
    await expect(keep).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(discard).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(keep).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(discard).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(question(page)).toBeHidden();
    await expect(compose).toHaveValue("");
  });
});

// A modal dialog keeps Tab inside: Tab and Shift+Tab wrap (#210).
test.describe("Jedi Page - Tab stays in the dialogs (#210)", () => {
  test("the Login dialog", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const header = page.getByRole("banner");
    await header.getByRole("button", { name: "Profile menu" }).click();
    await header.getByRole("button", { name: "Log In" }).click();
    const dialog = page.getByRole("dialog", { name: "Login" });
    const username = dialog.getByLabel("Username");
    const login = dialog.getByRole("button", { name: /^login$/i });

    await username.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(login).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(username).toBeFocused();
  });

  test("the New Post dialog", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "demo1", "welcome");
    await page.getByRole("banner").getByRole("button", { name: "New Post" }).click();
    const dialog = page.getByRole("dialog", { name: "New Post" });
    await expect(dialog.getByRole("checkbox").first()).toBeVisible();
    const title = dialog.getByLabel("Title");
    const post = dialog.getByRole("button", { name: "Post", exact: true });

    await title.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(post).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(title).toBeFocused();
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

// An avatar keeps its circle in a narrow flex row (#203). jsdom does not
// calculate layout, so only a real browser shows the squeeze. User 12 has the
// maximum 32-character name and no image, so the Nav shows its initials.
test.describe("Jedi Page - Nav avatar keeps its circle (#203)", () => {
  test("the long-name User's Nav avatar is 32 × 32 at 640 px and at 768 px", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "DemoBartalomo2342and-five-eigths", "dbart_01");

    const avatar = page.getByRole("banner").getByTestId("avatar");
    for (const width of [640, 768]) {
      await page.setViewportSize({ width, height: 720 });
      const box = await avatar.boundingBox();
      expect(box, `the avatar box at ${width} px`).not.toBeNull();
      expect({ width: box?.width, height: box?.height }, `at ${width} px`).toEqual({
        width: 32,
        height: 32,
      });
    }
  });
});
