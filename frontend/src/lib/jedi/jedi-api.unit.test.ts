import { describe, it, expect, vi, beforeEach } from "vite-plus/test";

// Pass-through spy: lets us assert every URL field is routed through the
// sanitizer, without re-testing sanitizeUrl (it has its own unit tests).
// `trustedUrl` is the seam's empty-URL fallback, so the mock must export it too.
vi.mock("~/lib/sanitizeUrl", () => ({
  sanitizeUrl: vi.fn((u: string) => u),
  trustedUrl: (u: string) => u,
}));

// `categories.list` now calls the real `list_categories` RPC (ADR-0011), so the
// back-end client is mocked here — the seam under test is the icon mapping, not
// the network. The hoisted fn lets each test program its own taxonomy rows.
const { categoryListMock } = vi.hoisted(() => ({ categoryListMock: vi.fn() }));
vi.mock("~/lib/backend-rpc", () => ({
  category: { list: categoryListMock },
}));

import { sanitizeUrl } from "~/lib/sanitizeUrl";
import { ICON_NAMES } from "~/components/Icon";
import { jediApi } from "./jedi-api";

const sanitizeSpy = sanitizeUrl as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => sanitizeSpy.mockClear());

// The seeded taxonomy (frontend/src/lib/jedi/data.json ↔ 02-dev-seed.sql).
const SEEDED_CATEGORIES = [
  { id: 1, name: "Landscape", icon: "landscape" },
  { id: 2, name: "People", icon: "portrait" },
  { id: 3, name: "Animals", icon: "dog" },
  { id: 4, name: "Abstract", icon: "collage" },
  { id: 5, name: "Black & White", icon: "180-degrees" },
  { id: 6, name: "Cute", icon: "fire-heart" },
];

describe("jediApi.categories", () => {
  beforeEach(() => categoryListMock.mockResolvedValue(SEEDED_CATEGORIES));

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

  // Relaxed from "every icon is a real sprite name": the back-end `icon` is now
  // an opaque key, so the seam maps a known key to itself and any unknown key to
  // the fallback. Either way the result is always a valid IconName.
  it("maps each opaque icon key to a known IconName or the fallback", async () => {
    categoryListMock.mockResolvedValueOnce([
      { id: 1, name: "Known", icon: "dog" },
      { id: 2, name: "Unknown", icon: "no-such-icon" },
    ]);
    const cats = await jediApi.categories.list();
    expect(cats.map((c) => c.icon)).toEqual(["dog", "menu"]);
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

describe("jediApi.hero", () => {
  it("returns the externalized hero content", async () => {
    const hero = await jediApi.hero.get();
    expect(hero.title).toBe("Awesome Photos & Captions");
    expect(hero.subtitle).toBe("Share your favorite Photos from Flickr and add a great caption");
    expect(hero.ctaText).toBe("Get Started");
    expect(hero.ctaHref).toBe("#");
    expect(hero.backgroundImage).toBe(
      "https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg",
    );
  });

  it("routes hero URL fields through the sanitizer (single boundary)", async () => {
    const hero = await jediApi.hero.get();
    const args = sanitizeSpy.mock.calls.flat();
    expect(args).toContain(hero.ctaHref);
    expect(args).toContain(hero.backgroundImage);
  });
});

describe("jediApi.profile", () => {
  it("returns the current user's profile (Bart) for the nav avatar", async () => {
    const profile = await jediApi.profile.get();
    expect(profile).toEqual({
      id: 3,
      name: "Bart",
      avatarUrl: "https://img.icons8.com/doodle/96/null/bart-simpson.png",
    });
  });

  it("routes the profile avatar through the sanitizer (single boundary)", async () => {
    const profile = await jediApi.profile.get();
    expect(sanitizeSpy.mock.calls.flat()).toContain(profile.avatarUrl);
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
