import { describe, it, expect } from "vite-plus/test";
import { createRoot } from "solid-js";
import { createJediFeed, type JediFeed } from "./createJediFeed";

// The resources back onto pre-resolved promises; two macrotask ticks drain the
// microtask queue including the selectedPost -> captions chain. Every assertion
// goes through the accessors the route consumes — the module's real interface.
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function withFeed(run: (feed: JediFeed) => void | Promise<void>) {
  let dispose!: () => void;
  const feed = createRoot((d) => {
    dispose = d;
    return createJediFeed();
  });
  try {
    await tick();
    await tick();
    await run(feed);
  } finally {
    dispose();
  }
}

describe("createJediFeed — the route's view-model seam", () => {
  it("ranks the visible posts with the top photo first under the default 'All' row", () =>
    withFeed((feed) => {
      expect(feed.selectedCategory()).toBe(0);
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4]);
      expect(feed.visiblePosts()?.[0].title).toBe("Little Jedi");
    }));

  it("lists every category for the sidebar, behind an 'All' filter row (#33-b)", () =>
    withFeed((feed) => {
      expect(feed.categories()?.map((c) => c.name)).toEqual([
        "All",
        "Landscape",
        "People",
        "Animals",
        "Abstract",
        "Black & White",
        "Cute",
      ]);
    }));

  it("owns the selectedCategory selection state (defaults to 0 — the 'All' row)", () =>
    withFeed((feed) => {
      expect(feed.selectedCategory()).toBe(0);
      feed.setSelectedCategory(2);
      expect(feed.selectedCategory()).toBe(2);
    }));

  it("defaults selectedPost to the top-ranked post", () =>
    withFeed((feed) => {
      expect(feed.selectedPost()?.id).toBe(1);
      expect(feed.selectedPost()?.title).toBe("Little Jedi");
    }));

  it("selectPost switches the selected post to the clicked one", () =>
    withFeed((feed) => {
      feed.selectPost(2);
      expect(feed.selectedPost()?.id).toBe(2);
      expect(feed.selectedPost()?.title).toBe("Brilliant tree");
    }));

  it("exposes the externalized hero content", () =>
    withFeed((feed) => {
      expect(feed.hero()?.title).toBe("Awesome Photos & Captions");
      expect(feed.hero()?.ctaText).toBe("Get Started");
    }));
});

describe("createJediFeed — visiblePosts, the category filter (#33-b)", () => {
  it("shows every post under the default 'All' row", () =>
    withFeed((feed) => {
      expect(feed.selectedCategory()).toBe(0);
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4]);
    }));

  it("filters posts to the selected category", () =>
    withFeed((feed) => {
      feed.setSelectedCategory(1); // Landscape — "Brilliant tree" (2), "Serene Beach" (4)
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([2, 4]);
      feed.setSelectedCategory(3); // Animals — "Little Jedi" (1), "Camouflage" (3)
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([1, 3]);
    }));

  it("shows no posts for a category nothing is tagged with", () =>
    withFeed((feed) => {
      feed.setSelectedCategory(2); // People — no posts
      expect(feed.visiblePosts()).toEqual([]);
    }));

  it("keeps visiblePosts ranked by likes", () =>
    withFeed((feed) => {
      const likes = feed.visiblePosts()!.map((p) => p.likeCount);
      expect(likes).toEqual([...likes].sort((a, b) => b - a));
    }));

  it("moves selectedPost to the first visible post when the filter hides it", () =>
    withFeed((feed) => {
      expect(feed.selectedPost()?.id).toBe(1); // top-ranked default
      feed.setSelectedCategory(1); // Landscape hides post 1
      expect(feed.selectedPost()?.id).toBe(2);
    }));

  it("keeps an explicitly selected post while the filter still shows it", () =>
    withFeed((feed) => {
      feed.selectPost(2);
      feed.setSelectedCategory(1); // Landscape still contains post 2
      expect(feed.selectedPost()?.id).toBe(2);
    }));
});

describe("createJediFeed — the empty-category state", () => {
  it("has no empty-category label under the default 'All' row", () =>
    withFeed((feed) => {
      expect(feed.emptyCategoryLabel()).toBeUndefined();
    }));

  it("has no empty-category label for a category that has posts", () =>
    withFeed((feed) => {
      feed.setSelectedCategory(3); // Animals — post 1
      expect(feed.emptyCategoryLabel()).toBeUndefined();
    }));

  it("exposes the category name when the filter matches no posts", () =>
    withFeed((feed) => {
      feed.setSelectedCategory(2); // People — no posts
      expect(feed.emptyCategoryLabel()).toBe("People");
    }));

  it("leaves selectedPost undefined for an empty category (no top-ranked fallback)", () =>
    withFeed((feed) => {
      feed.setSelectedCategory(2); // People — no posts
      expect(feed.selectedPost()).toBeUndefined();
    }));
});

describe("createJediFeed — the captions of the selected post", () => {
  it("ranks the selected post's captions by likes (top first)", () =>
    withFeed((feed) => {
      expect(feed.visibleCaptions()?.map((c) => c.likeCount)).toEqual([8, 5]);
    }));

  it("renders the selected post's captions as visibleCaptions when a post is shown", () =>
    withFeed((feed) => {
      const postId = feed.selectedPost()?.id;
      expect(feed.visibleCaptions()?.length).toBeGreaterThan(0);
      expect(feed.visibleCaptions()?.every((c) => c.postId === postId)).toBe(true);
    }));

  it("empties visibleCaptions when the category leaves no photo selected", () =>
    withFeed((feed) => {
      feed.setSelectedCategory(2); // People — no posts, no selected photo
      expect(feed.selectedPost()).toBeUndefined();
      expect(feed.visibleCaptions()).toEqual([]);
    }));

  it("defaults selectedCaption to the winning (top-ranked) caption of the selected post", () =>
    withFeed((feed) => {
      expect(feed.selectedCaption()).toBe(feed.visibleCaptions()?.[0]);
      expect(feed.selectedCaption()?.text).toBe("Jedi Kitty protects the street");
    }));

  it("selectCaption switches the caption shown in <main>", () =>
    withFeed((feed) => {
      feed.selectCaption(2);
      expect(feed.selectedCaption()?.text).toBe("May the paws be with you");
    }));

  it("re-keys the captions and selected caption to the newly selected post", () =>
    withFeed(async (feed) => {
      expect(feed.visibleCaptions()?.map((c) => c.likeCount)).toEqual([8, 5]);
      feed.selectPost(2);
      await tick();
      await tick();
      const caps2 = feed.visibleCaptions();
      expect(caps2?.every((c) => c.postId === 2)).toBe(true);
      expect(feed.selectedCaption()).toBe(caps2?.[0]);
    }));

  it("self-resets to the new post's winning caption when the post changes", () =>
    withFeed(async (feed) => {
      feed.selectCaption(2); // a caption of post 1
      expect(feed.selectedCaption()?.id).toBe(2);
      feed.selectPost(2);
      await tick();
      await tick();
      // Caption 2 belongs to post 1, so it falls back to post 2's winner.
      expect(feed.selectedCaption()).toBe(feed.visibleCaptions()?.[0]);
      expect(feed.selectedCaption()?.postId).toBe(2);
    }));
});
