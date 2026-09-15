import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createRoot } from "solid-js";
import { Channel } from "~/lib/channel";

// `jediApi.categories.list` / `posts.*` call the real RPCs (ADR-0011, #117); the
// back-end client is mocked so this seam test stays offline. Categories mirror the
// seeded taxonomy; Posts are hoisted spies each test programs (default set below).
const { postListMock, postFeaturedMock } = vi.hoisted(() => ({
  postListMock: vi.fn(),
  postFeaturedMock: vi.fn(),
}));
vi.mock("~/lib/backend-rpc", () => ({
  category: {
    list: () =>
      Promise.resolve([
        { id: 1, name: "Landscape", icon: "landscape" },
        { id: 2, name: "People", icon: "portrait" },
        { id: 3, name: "Animals", icon: "dog" },
        { id: 4, name: "Abstract", icon: "collage" },
        { id: 5, name: "Black & White", icon: "180-degrees" },
        { id: 6, name: "Cute", icon: "fire-heart" },
      ]),
  },
  post: { list: postListMock, featured: postFeaturedMock },
}));

import { createJediFeed, type JediFeed } from "./createJediFeed";

// The wire `PostView`s the back-end returns, already ranked (#117 — the front-end
// never re-ranks). Order [1, 3, 2, 4] mirrors data.json's like counts; categories
// match the fixture (post 1/3 -> Animals+Cute, post 2/4 -> Landscape).
const wireAuthor = (id: number, name: string) => ({
  id,
  name,
  avatar_url: `https://example.test/${name}.png`,
});
const CAT = {
  1: { id: 1, name: "Landscape", icon: "landscape" },
  3: { id: 3, name: "Animals", icon: "dog" },
  6: { id: 6, name: "Cute", icon: "fire-heart" },
};
const wirePost = (
  id: number,
  title: string,
  author: { id: number; name: string },
  categories: { id: number; name: string; icon: string }[],
  likeCount: number,
) => ({
  id,
  author: wireAuthor(author.id, author.name),
  title,
  image_src: `https://example.test/${id}.jpg`,
  image_alt: title,
  photographer: "Photographer",
  photographer_url: "https://example.test/photographer",
  source_url: "https://example.test/source",
  categories,
  like_count: likeCount,
  comment_count: 0,
});
const LISA = { id: 1, name: "Lisa" };
const HOMER = { id: 2, name: "Homer" };
const RANKED_POSTS = [
  wirePost(1, "Little Jedi", LISA, [CAT[3], CAT[6]], 5),
  wirePost(3, "Camouflage", LISA, [CAT[3], CAT[6]], 5),
  wirePost(2, "Brilliant tree", HOMER, [CAT[1]], 4),
  wirePost(4, "Serene Beach", HOMER, [CAT[1]], 3),
];

beforeEach(() => {
  postListMock.mockResolvedValue(RANKED_POSTS);
  postFeaturedMock.mockResolvedValue(RANKED_POSTS[0]);
});

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

describe("createJediFeed — the realtime posts poke (#117)", () => {
  // A fake Feed factory: it captures the consumer's callbacks so the test can
  // fire a `posts` poke, and records the channel the view-model subscribes to.
  function fakeFeed() {
    let options: { onPostsUpdate?: () => void } = {};
    const subscribe = vi.fn();
    const factory = (opts: { onPostsUpdate?: () => void }) => {
      options = opts;
      return { connected: () => true, subscribe, unsubscribe: vi.fn() };
    };
    return { factory, subscribe, poke: () => options.onPostsUpdate?.() };
  }

  it("subscribes to the posts channel and refetches on a poke", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      createJediFeed({ feed: feed.factory });
      await tick();
      await tick();

      // The view-model subscribes to the id-less `posts` list feed.
      expect(feed.subscribe).toHaveBeenCalledWith(Channel.posts);

      // A `posts` poke refetches the ranked list; the featured Post re-derives.
      const listCallsBefore = postListMock.mock.calls.length;
      feed.poke();
      await tick();
      await tick();
      expect(postListMock.mock.calls.length).toBeGreaterThan(listCallsBefore);

      dispose();
    });
  });

  it("does not subscribe when no feed is injected (anonymous landing)", async () => {
    // No feed: the view-model still loads Posts, but wires no subscription.
    await createRoot(async (dispose) => {
      const feed = createJediFeed();
      await tick();
      await tick();
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4]);
      dispose();
    });
  });
});
