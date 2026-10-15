import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { loginAs, loginAsDemo } from "./loginAsDemo";

// Two clients, two Users (#129): client A (demo1) acts, and client B (Bart)
// sees each change with no refresh. Then A undoes the change. These tests change
// seeded counts, so only the `live` project runs this file, after the browser
// projects (playwright.config.ts). Run them in order, not in parallel.
test.describe.configure({ mode: "default" });

interface Clients {
  a: Page;
  b: Page;
  close: () => Promise<void>;
}

/** Open `/` in two new browser contexts: A logs in as demo1, B as Bart. */
async function openClients(browser: Browser): Promise<Clients> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  await Promise.all([a.goto("/"), b.goto("/")]);
  await Promise.all([loginAsDemo(a), loginAs(b, "Bart", "bart_01")]);
  return {
    a,
    b,
    close: async () => {
      await contextA.close();
      await contextB.close();
    },
  };
}

/** The featured Post (Post 1, "Little Jedi" by Lisa) on a client. */
async function featuredArticle(page: Page): Promise<Locator> {
  const article = page.locator("article").first();
  await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
  return article;
}

/** Read the number of an `sr-only` count label, e.g. "Likes: 5". */
async function readCount(article: Locator, label: string): Promise<number> {
  const text = await article.getByText(new RegExp(`^${label}: \\d+$`)).textContent();
  const count = Number(text?.match(/\d+$/)?.[0]);
  expect(count, `a number after "${label}: "`).not.toBeNaN();
  return count;
}

test.describe("Live updates across Users (#129)", () => {
  test("demo1 likes then unlikes Post 1; Bart sees the count and Top Photos change", async ({
    browser,
  }) => {
    const { a, b, close } = await openClients(browser);
    try {
      const articleA = await featuredArticle(a);
      const articleB = await featuredArticle(b);
      const likeA = articleA.getByRole("button", { name: "Like post by Lisa" });
      // Like is enabled once the like state loads, which needs a live session.
      // So B holds its Channels before A acts.
      await expect(likeA).toBeEnabled();
      await expect(articleB.getByRole("button", { name: "Like post by Lisa" })).toBeEnabled();

      // Read the seed state; do not assume it.
      const liked = (await likeA.getAttribute("aria-pressed")) === "true";
      const before = await readCount(articleB, "Likes");
      const after = before + (liked ? -1 : 1);
      // Post 1's Top Photos row, by its photo: a change can move the row.
      const rowB = b
        .getByRole("listbox", { name: "Top Photos" })
        .getByRole("option")
        .filter({ has: b.getByRole("img", { name: "Little Jedi cat", exact: true }) });
      await expect(rowB).toContainText(`(${before} Likes)`);

      await likeA.click();
      await expect(likeA).toHaveAttribute("aria-pressed", String(!liked));
      await expect(articleB.getByText(`Likes: ${after}`, { exact: true })).toBeVisible();
      await expect(rowB).toContainText(`(${after} Likes)`);

      // Undo, so the seed state stays as it was.
      await likeA.click();
      await expect(likeA).toHaveAttribute("aria-pressed", String(liked));
      await expect(articleB.getByText(`Likes: ${before}`, { exact: true })).toBeVisible();
      await expect(rowB).toContainText(`(${before} Likes)`);
    } finally {
      await close();
    }
  });

  test("demo1 likes then unlikes Caption 1; Bart sees the count and Top Captions change", async ({
    browser,
  }) => {
    const { a, b, close } = await openClients(browser);
    try {
      const articleA = await featuredArticle(a);
      const articleB = await featuredArticle(b);
      const likeA = articleA.getByRole("button", { name: "Like caption by Lisa" });
      await expect(likeA).toBeEnabled();
      await expect(articleB.getByRole("button", { name: "Like caption by Lisa" })).toBeEnabled();

      const liked = (await likeA.getAttribute("aria-pressed")) === "true";
      const before = await readCount(articleB, "Caption likes");
      const after = before + (liked ? -1 : 1);
      // Caption 1's Top Captions row, by its author: Post 1's two Captions are by
      // Lisa and Bart.
      const rowB = b
        .getByRole("listbox", { name: "Top Captions" })
        .getByRole("option")
        .filter({ hasText: "Lisa" });
      await expect(rowB).toContainText(`(${before} Likes)`);

      await likeA.click();
      await expect(likeA).toHaveAttribute("aria-pressed", String(!liked));
      // The Caption line changes at once; the Top Captions row changes after the
      // `post_caption` refetch (#123 Decision 13).
      await expect(articleB.getByText(`Caption likes: ${after}`, { exact: true })).toBeVisible();
      await expect(rowB).toContainText(`(${after} Likes)`);

      // Undo, so the seed state stays as it was.
      await likeA.click();
      await expect(likeA).toHaveAttribute("aria-pressed", String(liked));
      await expect(articleB.getByText(`Caption likes: ${before}`, { exact: true })).toBeVisible();
      await expect(rowB).toContainText(`(${before} Likes)`);
    } finally {
      await close();
    }
  });

  test("demo1 posts then deletes a Comment on Post 1; Bart sees the row come and go", async ({
    browser,
  }) => {
    const { a, b, close } = await openClients(browser);
    try {
      const articleA = await featuredArticle(a);
      const articleB = await featuredArticle(b);
      // B opens the thread first, so B holds its Channel before A posts.
      await articleB.getByRole("button", { name: /^Comments, /i }).click();
      await expect(articleB.getByRole("textbox", { name: "Your comment" })).toBeVisible();
      await articleA.getByRole("button", { name: /^Comments, /i }).click();

      // A unique text, so a row left by an earlier failed run cannot match.
      const text = `e2e live comment ${Date.now()}`;
      await articleA.getByRole("textbox", { name: "Your comment" }).fill(text);
      await articleA.getByRole("button", { name: "Post Comment" }).click();

      const rowA = articleA.getByRole("listitem").filter({ hasText: text });
      const rowB = articleB.getByRole("listitem").filter({ hasText: text });
      await expect(rowB).toBeVisible();
      await expect(rowB.getByText("demo1", { exact: true })).toBeVisible();

      // Undo: A deletes it, and B sees the row go.
      await rowA.getByRole("button", { name: "Delete comment" }).click();
      await expect(rowA).toHaveCount(0);
      await expect(rowB).toHaveCount(0);
    } finally {
      await close();
    }
  });
});
