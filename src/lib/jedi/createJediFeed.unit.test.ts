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

  it("lists every category for the sidebar", () =>
    withFeed((feed) => {
      expect(feed.categories()?.map((c) => c.name)).toEqual([
        "Landscape",
        "People",
        "Animals",
        "Abstract",
        "Black & White",
        "Cute",
      ]);
    }));

  it("owns the selectedCategory selection state (defaults to 0, #29 filters here)", () =>
    withFeed((feed) => {
      expect(feed.selectedCategory()).toBe(0);
      feed.setSelectedCategory(2);
      expect(feed.selectedCategory()).toBe(2);
    }));
});
