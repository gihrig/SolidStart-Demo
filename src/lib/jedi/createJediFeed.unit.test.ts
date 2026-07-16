import { describe, it, expect } from "vite-plus/test";
import { createRoot } from "solid-js";
import { createJediFeed, type JediFeed } from "./createJediFeed";

// The four resources back onto pre-resolved promises; two macrotask ticks
// drain the microtask queue including the featured -> topCaptions chain.
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
  it("exposes the ranked posts with the top photo first", () =>
    withFeed((feed) => {
      const posts = feed.posts();
      expect(posts?.[0].title).toBe("Little Jedi");
      const likes = posts!.map((p) => p.likeCount);
      expect(likes).toEqual([...likes].sort((a, b) => b - a));
    }));

  it("exposes the featured post (top-ranked)", () =>
    withFeed((feed) => {
      expect(feed.featured()?.id).toBe(1);
      expect(feed.featured()?.title).toBe("Little Jedi");
    }));

  it("loads the featured post's captions, ranked by likes", () =>
    withFeed((feed) => {
      expect(feed.topCaptions()?.map((c) => c.likeCount)).toEqual([8, 5]);
    }));

  it("derives winningCaption as the top-ranked caption of the featured post", () =>
    withFeed((feed) => {
      expect(feed.winningCaption()?.text).toBe("Jedi Kitty protects the street");
      expect(feed.winningCaption()).toBe(feed.topCaptions()?.[0]);
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

  it("defaults selectedPost to the featured (top-ranked) post", () =>
    withFeed((feed) => {
      expect(feed.selectedPost()?.id).toBe(feed.featured()?.id);
      expect(feed.selectedPost()?.id).toBe(1);
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

  it("exposes the current user's profile for the nav avatar (Bart)", () =>
    withFeed((feed) => {
      expect(feed.profile()?.name).toBe("Bart");
      expect(feed.profile()?.avatarUrl).toBe(
        "https://img.icons8.com/doodle/96/null/bart-simpson.png",
      );
    }));

  it("re-keys topCaptions and winningCaption to the selected post", () =>
    withFeed(async (feed) => {
      // Featured (post 1) captions rank [8, 5].
      expect(feed.topCaptions()?.map((c) => c.likeCount)).toEqual([8, 5]);
      feed.selectPost(2);
      await tick();
      await tick();
      // Post 2 has its own captions; winningCaption follows the selection.
      const caps2 = feed.topCaptions();
      expect(caps2?.every((c) => c.postId === 2)).toBe(true);
      expect(feed.winningCaption()).toBe(caps2?.[0]);
    }));
});

describe("createJediFeed — visiblePosts, the category filter (#33-b)", () => {
  it("shows every post under the default 'All' row", () =>
    withFeed((feed) => {
      expect(feed.selectedCategory()).toBe(0);
      expect(feed.visiblePosts()).toEqual(feed.posts());
    }));

  it("filters posts to the selected category", () =>
    withFeed((feed) => {
      feed.setSelectedCategory(1); // Landscape — only "Brilliant tree" (post 2)
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([2]);
      feed.setSelectedCategory(3); // Animals — only "Little Jedi" (post 1)
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([1]);
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
      expect(feed.selectedPost()?.id).toBe(1); // featured default
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

describe("createJediFeed — selectedCaption, the caption shown in <main>", () => {
  it("defaults to the winning caption of the selected post", () =>
    withFeed((feed) => {
      expect(feed.selectedCaption()).toBe(feed.winningCaption());
      expect(feed.selectedCaption()?.text).toBe("Jedi Kitty protects the street");
    }));

  it("selectCaption switches the caption shown in <main>", () =>
    withFeed((feed) => {
      feed.selectCaption(2);
      expect(feed.selectedCaption()?.text).toBe("May the paws be with you");
    }));

  it("self-resets to the new post's winning caption when the post changes", () =>
    withFeed(async (feed) => {
      feed.selectCaption(2); // a caption of post 1
      expect(feed.selectedCaption()?.id).toBe(2);
      feed.selectPost(2);
      await tick();
      await tick();
      // Caption 2 belongs to post 1, so it falls back to post 2's winner.
      expect(feed.selectedCaption()).toBe(feed.winningCaption());
      expect(feed.selectedCaption()?.postId).toBe(2);
    }));
});
