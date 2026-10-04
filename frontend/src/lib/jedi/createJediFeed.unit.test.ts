import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { Channel } from "~/lib/channel";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { JediApi } from "./jedi-api";
import type { AuthorRef, CaptionView, JediCategory, PostLike, PostView } from "~/types/jedi";
import data from "./data.json";
import { createJediFeed, type JediFeed } from "./createJediFeed";

// The view-model takes its `JediApi` by injection (#119 rider, arch-review C2),
// so this seam test hands it a synthetic in-memory `JediApi` in the contract
// shape — no back-end client mock and no wire rows. `jedi-api.unit.test.ts`
// owns the wire→contract mapping.
const CATEGORIES: JediCategory[] = [
  { id: 1, name: "Landscape", icon: "landscape" },
  { id: 2, name: "People", icon: "portrait" },
  { id: 3, name: "Animals", icon: "dog" },
  { id: 4, name: "Abstract", icon: "collage" },
  { id: 5, name: "Black & White", icon: "180-degrees" },
  { id: 6, name: "Cute", icon: "fire-heart" },
];
const CAT = { 1: CATEGORIES[0], 3: CATEGORIES[2], 6: CATEGORIES[5] };

const author = (id: number, name: string): AuthorRef => ({
  id,
  name,
  avatarUrl: trustedUrl(`https://example.test/${name}.png`),
});
const post = (
  id: number,
  title: string,
  by: AuthorRef,
  categories: JediCategory[],
  likeCount: number,
): PostView => ({
  id,
  author: by,
  title,
  imageSrc: trustedUrl(`https://example.test/${id}.jpg`),
  imageAlt: title,
  photographer: "Photographer",
  photographerUrl: trustedUrl("https://example.test/photographer"),
  sourceUrl: trustedUrl("https://example.test/source"),
  categories,
  likeCount,
  commentCount: 0,
});

// The Posts as the back-end ranks them (#117 — the front-end never re-ranks).
// Order [1, 3, 2, 4] mirrors data.json's like counts; categories match the
// fixture (post 1/3 -> Animals+Cute, post 2/4 -> Landscape).
const LISA = author(1, "Lisa");
const HOMER = author(2, "Homer");
const RANKED_POSTS = [
  post(1, "Little Jedi", LISA, [CAT[3], CAT[6]], 5),
  post(3, "Camouflage", LISA, [CAT[3], CAT[6]], 5),
  post(2, "Brilliant tree", HOMER, [CAT[1]], 4),
  post(4, "Serene Beach", HOMER, [CAT[1]], 3),
];

// Captions built from the fixture and pre-ranked as the back-end ranks them:
// like count desc, then id asc (#118).
const users = new Map(data.users.map((u) => [u.id, u]));
const captionsFor = (postId: number): CaptionView[] =>
  data.captions
    .filter((c) => c.post_id === postId)
    .sort((a, b) => b.likeCount - a.likeCount || a.id - b.id)
    .map((c) => ({
      id: c.id,
      postId: c.post_id,
      author: author(c.owner_id, users.get(c.owner_id)!.name),
      text: c.text,
      likeCount: c.likeCount,
    }));

const postListMock = vi.fn<JediApi["posts"]["list"]>();
const postGetLikeMock = vi.fn<JediApi["posts"]["getLike"]>();
const postToggleLikeMock = vi.fn<JediApi["posts"]["toggleLike"]>();
const captionListForPostMock = vi.fn<JediApi["captions"]["listForPost"]>();
const api: JediApi = {
  categories: { list: () => Promise.resolve(CATEGORIES) },
  posts: {
    list: postListMock,
    featured: () => Promise.resolve(RANKED_POSTS[0]),
    create: () => Promise.reject(new Error("not used by the view-model")),
    getLike: postGetLikeMock,
    toggleLike: postToggleLikeMock,
  },
  captions: {
    listForPost: captionListForPostMock,
    add: () => Promise.reject(new Error("not used by the view-model")),
  },
  hero: {
    get: () =>
      Promise.resolve({
        title: "Awesome Photos & Captions",
        subtitle: "Share your favorite Photos from Flickr and add a great caption",
        ctaText: "Get Started",
        backgroundImage: trustedUrl("https://example.test/hero.jpg"),
      }),
  },
  profile: { get: () => Promise.resolve(LISA) },
};

beforeEach(() => {
  postListMock.mockReset();
  postListMock.mockResolvedValue(RANKED_POSTS);
  postGetLikeMock.mockReset();
  postGetLikeMock.mockImplementation((postId: number) =>
    Promise.resolve({ postId, likeCount: postId * 10, liked: false }),
  );
  postToggleLikeMock.mockReset();
  postToggleLikeMock.mockImplementation((postId: number, liked: boolean) =>
    Promise.resolve({ postId, likeCount: postId * 10 + (liked ? 1 : 0), liked }),
  );
  captionListForPostMock.mockReset();
  captionListForPostMock.mockImplementation((postId: number) =>
    Promise.resolve(captionsFor(postId)),
  );
});

// The resources back onto pre-resolved promises; two macrotask ticks drain the
// microtask queue including the selectedPost -> captions chain. Every assertion
// goes through the accessors the route consumes — the module's real interface.
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function withFeed(run: (feed: JediFeed) => void | Promise<void>) {
  let dispose!: () => void;
  const feed = createRoot((d) => {
    dispose = d;
    return createJediFeed({ api });
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

  // The captions load by a network RPC, so the previous post's captions must not
  // stand in for the new post's while that request is in flight (#118 review):
  // neither Top Captions nor <main> may offer a caption of the wrong post.
  it("shows no captions of the previous post while the new post's captions load", () =>
    withFeed(async (feed) => {
      let release!: () => void;
      captionListForPostMock.mockImplementationOnce(
        (postId: number) =>
          new Promise((resolve) => {
            release = () => resolve(captionsFor(postId));
          }),
      );
      feed.selectCaption(2); // a caption of post 1
      feed.selectPost(2);
      await tick();
      await tick();
      // In flight: no caption at all, rather than post 1's.
      expect(feed.visibleCaptions()).toBeUndefined();
      expect(feed.selectedCaption()).toBeUndefined();

      release();
      await tick();
      await tick();
      expect(feed.visibleCaptions()?.every((c) => c.postId === 2)).toBe(true);
      expect(feed.selectedCaption()?.postId).toBe(2);
    }));

  it("an empty list from the previous post does not read as the new post's (#185 review)", async () => {
    // Post 1 has no captions; post 2's load is held in flight. `[].every(...)` is
    // true, so an ownerless empty list would pass as post 2's "none" and show the
    // caption form before post 2's real captions arrive.
    let release!: () => void;
    captionListForPostMock.mockImplementation((postId: number) =>
      postId === 1
        ? Promise.resolve([])
        : new Promise((resolve) => {
            release = () => resolve(captionsFor(postId));
          }),
    );
    await createRoot(async (dispose) => {
      const feed = createJediFeed({ api });
      await tick();
      await tick();
      expect(feed.visibleCaptions()).toEqual([]); // post 1: loaded, none

      feed.selectPost(2);
      await tick();
      await tick();
      expect(feed.visibleCaptions()).toBeUndefined(); // post 2: still loading

      release();
      await tick();
      await tick();
      expect(feed.visibleCaptions()).toEqual(captionsFor(2));

      dispose();
    });
  });
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
      createJediFeed({ api, feed: feed.factory });
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

  it("connectFeed wires a feed after creation: a poke shows a new Post (#120)", async () => {
    // The route builds the view-model anonymously, then connects the socket's
    // Feed on login. A Post created elsewhere lands; its poke refetches the list.
    const feed = fakeFeed();
    const created = post(5, "New arrival", HOMER, [CAT[1]], 0);
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      await tick();
      await tick();
      expect(feed.subscribe).not.toHaveBeenCalled();

      jedi.connectFeed(feed.factory);
      expect(feed.subscribe).toHaveBeenCalledWith(Channel.posts);

      postListMock.mockResolvedValue([...RANKED_POSTS, created]);
      feed.poke();
      await tick();
      await tick();
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4, 5]);

      dispose();
    });
  });

  it("refetches the Posts when the socket (re)connects, so a missed poke is recovered (#120 review)", async () => {
    // A poke sent while the socket is down is lost. When the socket comes up, the
    // view-model reconciles by refetching, so a Post created meanwhile appears.
    const [connected, setConnected] = createSignal(false);
    let options: { onPostsUpdate?: () => void } = {};
    const factory = (opts: { onPostsUpdate?: () => void }) => {
      options = opts;
      return { connected, subscribe: vi.fn(), unsubscribe: vi.fn() };
    };
    const created = post(5, "New arrival", HOMER, [CAT[1]], 0);
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: factory });
      await tick();
      await tick();
      expect(options.onPostsUpdate).toBeDefined();

      // The Post lands while the socket is down: its poke never arrives.
      postListMock.mockResolvedValue([...RANKED_POSTS, created]);
      setConnected(true);
      await tick();
      await tick();
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4, 5]);

      dispose();
    });
  });

  it("does not subscribe when no feed is injected (anonymous landing)", async () => {
    // No feed: the view-model still loads Posts, but wires no subscription.
    await createRoot(async (dispose) => {
      const feed = createJediFeed({ api });
      await tick();
      await tick();
      expect(feed.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4]);
      dispose();
    });
  });
});

describe("createJediFeed — the realtime post_caption poke (#121)", () => {
  // A fake Feed factory: it captures the consumer's callbacks so the test can
  // fire a `post_caption` poke, and records every (un)subscribe.
  type Options = { onPostCaptionUpdate?: (postId: number) => void };
  function fakeFeed(connected: () => boolean = () => true) {
    let options: Options = {};
    const subscribe = vi.fn();
    const unsubscribe = vi.fn();
    const factory = (opts: Options) => {
      options = opts;
      return { connected, subscribe, unsubscribe };
    };
    return {
      factory,
      subscribe,
      unsubscribe,
      poke: (postId: number) => options.onPostCaptionUpdate?.(postId),
    };
  }
  const newCaption = (postId: number): CaptionView => ({
    id: 99,
    postId,
    author: HOMER,
    text: "A new contender",
    likeCount: 0,
  });

  it("subscribes to the selected Post's Caption feed, and moves it with the selection", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: feed.factory });
      await tick();
      await tick();
      expect(feed.subscribe).toHaveBeenCalledWith(Channel.postCaption(1));

      jedi.selectPost(2);
      await tick();
      expect(feed.unsubscribe).toHaveBeenCalledWith(Channel.postCaption(1));
      expect(feed.subscribe).toHaveBeenCalledWith(Channel.postCaption(2));

      dispose();
    });
  });

  it("a poke for the selected Post refetches its Captions, so a new one appears", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: feed.factory });
      await tick();
      await tick();

      captionListForPostMock.mockResolvedValue([...captionsFor(1), newCaption(1)]);
      feed.poke(1);
      await tick();
      await tick();
      expect(jedi.visibleCaptions()?.map((c) => c.id)).toContain(99);

      dispose();
    });
  });

  it("ignores a poke for a Post that is not selected", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      createJediFeed({ api, feed: feed.factory });
      await tick();
      await tick();

      const callsBefore = captionListForPostMock.mock.calls.length;
      feed.poke(2);
      await tick();
      await tick();
      expect(captionListForPostMock.mock.calls.length).toBe(callsBefore);

      dispose();
    });
  });

  it("refetches the Captions when the socket (re)connects, so a missed poke is recovered", async () => {
    const [connected, setConnected] = createSignal(false);
    const feed = fakeFeed(connected);
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: feed.factory });
      await tick();
      await tick();

      // The Caption lands while the socket is down: its poke never arrives.
      captionListForPostMock.mockResolvedValue([...captionsFor(1), newCaption(1)]);
      setConnected(true);
      await tick();
      await tick();
      expect(jedi.visibleCaptions()?.map((c) => c.id)).toContain(99);

      dispose();
    });
  });
});

describe("createJediFeed — the selected Post's like state (#122)", () => {
  // A fake Feed factory: it captures the consumer's callbacks so the test can
  // fire a `post_like` poke, and records every (un)subscribe.
  type Options = { onPostLikeUpdate?: (postId: number) => void };
  function fakeFeed() {
    let options: Options = {};
    const subscribe = vi.fn();
    const unsubscribe = vi.fn();
    const factory = (opts: Options) => {
      options = opts;
      return { connected: () => true, subscribe, unsubscribe };
    };
    return {
      factory,
      subscribe,
      unsubscribe,
      poke: (postId: number) => options.onPostLikeUpdate?.(postId),
    };
  }
  const like = (postId: number, likeCount: number, liked: boolean): PostLike => ({
    postId,
    likeCount,
    liked,
  });

  it("has no like state on the anonymous landing (no feed connected)", () =>
    withFeed((feed) => {
      expect(feed.selectedPostLike()).toBeUndefined();
      expect(postGetLikeMock).not.toHaveBeenCalled();
    }));

  it("loads the selected Post's like state once a feed connects, and re-keys with the selection", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      await tick();
      await tick();
      jedi.connectFeed(feed.factory);
      await tick();
      await tick();
      expect(jedi.selectedPostLike()).toEqual(like(1, 10, false));

      jedi.selectPost(2);
      await tick();
      await tick();
      expect(jedi.selectedPostLike()).toEqual(like(2, 20, false));

      dispose();
    });
  });

  it("subscribes to the selected Post's like feed, and moves it with the selection", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: feed.factory });
      await tick();
      await tick();
      expect(feed.subscribe).toHaveBeenCalledWith(Channel.postLike(1));

      jedi.selectPost(2);
      await tick();
      expect(feed.unsubscribe).toHaveBeenCalledWith(Channel.postLike(1));
      expect(feed.subscribe).toHaveBeenCalledWith(Channel.postLike(2));

      dispose();
    });
  });

  it("a poke for the selected Post refetches its like state, so another User's Like shows", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: feed.factory });
      await tick();
      await tick();

      postGetLikeMock.mockResolvedValue(like(1, 11, false));
      feed.poke(1);
      await tick();
      await tick();
      expect(jedi.selectedPostLike()).toEqual(like(1, 11, false));

      // A poke for a Post that is not selected does not refetch.
      const callsBefore = postGetLikeMock.mock.calls.length;
      feed.poke(2);
      await tick();
      expect(postGetLikeMock.mock.calls.length).toBe(callsBefore);

      dispose();
    });
  });

  it("toggleLike sets the selected Post's like to the opposite state, then back", async () => {
    const feed = fakeFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: feed.factory });
      await tick();
      await tick();

      await jedi.toggleLike();
      expect(postToggleLikeMock).toHaveBeenLastCalledWith(1, true);
      expect(jedi.selectedPostLike()).toEqual(like(1, 11, true));

      await jedi.toggleLike();
      expect(postToggleLikeMock).toHaveBeenLastCalledWith(1, false);
      expect(jedi.selectedPostLike()).toEqual(like(1, 10, false));

      dispose();
    });
  });

  it("toggleLike does nothing without a like state (anonymous landing)", () =>
    withFeed(async (feed) => {
      await feed.toggleLike();
      expect(postToggleLikeMock).not.toHaveBeenCalled();
    }));
});
