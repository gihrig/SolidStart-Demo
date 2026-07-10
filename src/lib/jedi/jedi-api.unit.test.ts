import { describe, it, expect, vi, beforeEach } from "vite-plus/test";

// Pass-through spy: lets us assert every URL field is routed through the
// sanitizer, without re-testing sanitizeUrl (it has its own unit tests).
vi.mock("~/lib/sanitizeUrl", () => ({ sanitizeUrl: vi.fn((u: string) => u) }));

import { sanitizeUrl } from "~/lib/sanitizeUrl";
import { ICON_NAMES } from "~/components/Icon";
import { jediApi } from "./jedi-api";

const sanitizeSpy = sanitizeUrl as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => sanitizeSpy.mockClear());

describe("jediApi.categories", () => {
  it("lists all categories including the added 'Cute'", async () => {
    const cats = await jediApi.categories.list();
    expect(cats.map((c) => c.name)).toEqual([
      "Landscape",
      "People",
      "Animals",
      "Abstract",
      "Black & White",
      "Cute",
    ]);
  });

  it("every category icon is a real sprite name", async () => {
    const cats = await jediApi.categories.list();
    for (const c of cats) expect(ICON_NAMES).toContain(c.icon);
  });
});

describe("jediApi.posts", () => {
  it("ranks posts by likeCount desc (Top Photos order)", async () => {
    const posts = await jediApi.posts.list();
    const likes = posts.map((p) => p.likeCount);
    expect(likes).toEqual([...likes].sort((a, b) => b - a));
    expect(posts[0].title).toBe("Little Jedi");
  });

  it("embeds the author snapshot joined from users", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.author).toEqual({
      id: 1,
      name: "Lisa",
      avatarUrl: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    });
  });

  it("resolves category_ids to full categories (tags == categories)", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.categories.map((c) => c.name)).toEqual(["Animals", "Cute"]);
  });

  it("derives commentCount from the comments collection", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.commentCount).toBe(3);
  });

  it("featured() returns the top-ranked post", async () => {
    const featured = await jediApi.posts.featured();
    expect(featured.id).toBe(1);
    expect(featured.title).toBe("Little Jedi");
  });

  it("routes every URL field through the sanitizer (single boundary)", async () => {
    const [post] = await jediApi.posts.list();
    const args = sanitizeSpy.mock.calls.flat();
    expect(args).toContain(post.imageSrc);
    expect(args).toContain(post.photographerUrl);
    expect(args).toContain(post.sourceUrl);
    expect(args).toContain(post.author.avatarUrl);
  });
});

describe("jediApi.captions", () => {
  it("ranks a post's captions by likeCount desc (Top Captions)", async () => {
    const caps = await jediApi.captions.listForPost(1);
    expect(caps.map((c) => c.likeCount)).toEqual([8, 5]);
    expect(caps[0].text).toBe("Jedi Kitty protects the street");
    expect(caps[0].author.name).toBe("Lisa");
  });

  it("returns [] for a post with no captions", async () => {
    expect(await jediApi.captions.listForPost(999)).toEqual([]);
  });
});
