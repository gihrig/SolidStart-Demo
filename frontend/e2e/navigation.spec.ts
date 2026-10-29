import { test, expect, type Page } from "@playwright/test";

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

// 8. Top Nav: the current page and the hover (#247)
test.describe("Top Nav current page and hover", () => {
  const TRANSPARENT = "rgba(0, 0, 0, 0)";

  // The computed value of `color: <css>` inside `scope`. A probe resolves the
  // token the same way the browser resolves the rule, in every browser.
  async function resolveColor(page: Page, css: string, scope = "body") {
    return page
      .locator(scope)
      .first()
      .evaluate((el, value) => {
        const probe = document.createElement("span");
        probe.style.color = value;
        el.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }, css);
  }

  // The server reads the theme cookie during SSR (#200).
  async function setTheme(page: Page, value: "light" | "dark") {
    await page
      .context()
      .addCookies([
        { name: "theme", value, url: "https://localhost:3443", httpOnly: true, secure: true },
      ]);
  }

  for (const [path, current] of [
    ["/", "Home"],
    ["/about", "About"],
    ["/readme", "Readme"],
    ["/nonexistent", null],
  ] as const) {
    test(`on ${path}, only the ${current ?? "no"} Nav link has the underline`, async ({ page }) => {
      await page.goto(path);
      const sky500 = await resolveColor(page, "var(--color-sky-500)");

      // At 1280 px the Site menu is hidden, so its query includes hidden
      // elements; the computed underline is the same.
      for (const navName of ["Main", "Site menu"]) {
        const includeHidden = navName === "Site menu";
        const nav = page.getByRole("navigation", { name: navName, includeHidden });
        for (const name of ["Home", "About", "Readme"]) {
          const link = nav.getByRole("link", { name, includeHidden });
          await expect(link, `${navName} ${name}`).toHaveCSS("border-bottom-width", "4px");
          if (name === current) {
            await expect(link, `${navName} ${name}`).toHaveAttribute("aria-current", "page");
            await expect(link, `${navName} ${name}`).toHaveCSS("border-bottom-color", sky500);
          } else {
            await expect(link, `${navName} ${name}`).not.toHaveAttribute("aria-current");
            await expect(link, `${navName} ${name}`).toHaveCSS("border-bottom-color", TRANSPARENT);
          }
        }
      }

      // The Brand link never marks the current page; the Home Nav link marks /.
      const brand = page.getByRole("link", { name: /awesome/i });
      await expect(brand).not.toHaveAttribute("aria-current");
      await expect(brand).toHaveCSS("border-bottom-color", TRANSPARENT);
    });
  }

  test("a hovered Nav link and the hovered Brand link get the background and the underline", async ({
    page,
  }) => {
    await page.goto("/about");
    const sky500 = await resolveColor(page, "var(--color-sky-500)");
    const gray700 = await resolveColor(page, "var(--color-gray-700)");

    for (const link of [
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Readme" }),
      page.getByRole("link", { name: /awesome/i }),
    ]) {
      await expect(link).toHaveCSS("border-bottom-color", TRANSPARENT);
      await link.hover();
      await expect(link).toHaveCSS("background-color", gray700);
      await expect(link).toHaveCSS("border-bottom-color", sky500);
    }
  });

  // The Top Nav is dark in every Theme, so its underline is sky-500 in every
  // Theme. The page accent follows the Theme.
  for (const theme of ["system", "light", "dark"] as const) {
    test(`in ${theme} Theme, the underline is sky-500`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      if (theme !== "system") await setTheme(page, theme);
      await page.goto("/");
      const sky500 = await resolveColor(page, "var(--color-sky-500)");
      const sky700 = await resolveColor(page, "var(--color-sky-700)");

      const home = page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Home" });
      await expect(home).toHaveCSS("border-bottom-color", sky500);

      const pageAccent = theme === "dark" ? sky500 : sky700;
      expect(await resolveColor(page, "var(--theme-accent)")).toBe(pageAccent);
    });
  }

  // The Top Nav accent override is not on .site-header, so the Profile menu
  // panel inside it keeps the Light Theme accent: sky-500 on its zinc-200 card
  // is 2.14:1.
  test("in Light Theme, the focus ring of a Theme item is still sky-700", async ({ page }) => {
    await setTheme(page, "light");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const sky500 = await resolveColor(page, "var(--color-sky-500)");
    const sky700 = await resolveColor(page, "var(--color-sky-700)");

    // A keyboard path, so :focus-visible applies: open the menu, then Tab to
    // the checked radio of the Theme group.
    await page.getByRole("button", { name: "Profile menu" }).focus();
    await page.keyboard.press("Enter");
    const radio = page.getByRole("radio", { name: "Light Theme" });
    await expect(radio).toBeChecked();
    for (let i = 0; i < 5 && !(await radio.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(radio).toBeFocused();

    const item = page.locator("label.theme-item", { has: radio });
    const ring = () => item.evaluate((el) => getComputedStyle(el).boxShadow);
    await expect.poll(ring).toContain(sky700);
    expect(await ring()).not.toContain(sky500);
  });

  test("in System Theme with a dark OS, the page accent is sky-500", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await resolveColor(page, "var(--theme-accent)")).toBe(
      await resolveColor(page, "var(--color-sky-500)"),
    );
  });
});

// 9. Site menu rows (#247). jsdom has no layout, so only e2e can prove the
// click area.
test("each Site menu link fills its row, so a click at the row's edge follows it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /toggle navigation/i }).click();
  const menu = page.getByRole("navigation", { name: "Site menu" });
  await expect(menu).toHaveCSS("opacity", "1");

  const list = (await menu.getByRole("list").boundingBox())!;
  const links = menu.getByRole("link");
  await expect(links).toHaveText(["Home", "About", "Readme"]);
  for (const link of await links.all()) {
    const box = (await link.boundingBox())!;
    expect(box.x).toBeCloseTo(list.x, 0);
    expect(box.width).toBeCloseTo(list.width, 0);
    await expect(link).toHaveCSS("height", "48px");
    await expect(link).toHaveCSS("justify-content", "center");
  }

  const about = (await menu.getByRole("link", { name: "About" }).boundingBox())!;
  await page.mouse.click(20, about.y + about.height / 2);
  await expect(page).toHaveURL("/about");
});
