import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createComponent, createRoot, getOwner, runWithOwner, Suspense, type JSX } from "solid-js";
import { render, screen } from "@solidjs/testing-library";
import { Channel } from "~/lib/channel";
import { createMemoryFeed } from "~/lib/feed.memory";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { JediApi } from "./jedi-api";
import type { AuthorRef, CaptionView, JediCategory, Like, PostView } from "~/types/jedi";
import type { WsEvent } from "~/types/backend";
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
const captionGetLikeMock = vi.fn<JediApi["captions"]["getLike"]>();
const captionToggleLikeMock = vi.fn<JediApi["captions"]["toggleLike"]>();
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
    getLike: captionGetLikeMock,
    toggleLike: captionToggleLikeMock,
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
  // A stateful fake back-end for the viewer's Likes: Post N has N * 10 Likes
  // from other Users, plus 1 while the viewer likes it. A toggle writes the
  // wanted state, so a later read sees it (the view-model rereads after one).
  const viewerLikes = new Set<number>();
  const likeOf = (postId: number) => {
    const liked = viewerLikes.has(postId);
    return { id: postId, likeCount: postId * 10 + (liked ? 1 : 0), liked };
  };
  postGetLikeMock.mockReset();
  postGetLikeMock.mockImplementation((postId: number) => Promise.resolve(likeOf(postId)));
  postToggleLikeMock.mockReset();
  postToggleLikeMock.mockImplementation((postId: number, liked: boolean) => {
    if (liked) viewerLikes.add(postId);
    else viewerLikes.delete(postId);
    return Promise.resolve(likeOf(postId));
  });
  // The same fake for the viewer's Caption Likes: Caption N has N * 100 Likes
  // from other Users, plus 1 while the viewer likes it.
  const viewerCaptionLikes = new Set<number>();
  const captionLikeOf = (id: number) => {
    const liked = viewerCaptionLikes.has(id);
    return { id, likeCount: id * 100 + (liked ? 1 : 0), liked };
  };
  captionGetLikeMock.mockReset();
  captionGetLikeMock.mockImplementation((id: number) => Promise.resolve(captionLikeOf(id)));
  captionToggleLikeMock.mockReset();
  captionToggleLikeMock.mockImplementation((id: number, liked: boolean) => {
    if (liked) viewerCaptionLikes.add(id);
    else viewerCaptionLikes.delete(id);
    return Promise.resolve(captionLikeOf(id));
  });
  captionListForPostMock.mockReset();
  captionListForPostMock.mockImplementation((postId: number) =>
    Promise.resolve(captionsFor(postId)),
  );
});

// The resources back onto pre-resolved promises; two macrotask ticks drain the
// microtask queue including the selectedPost -> captions chain. Every assertion
// goes through the accessors the route consumes — the module's real interface.
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// The real Feed core over the in-memory wire (ADR-0028). It connects first
// unless the test drives the connect itself.
function memoryFeed(connected = true) {
  const mem = createMemoryFeed();
  mem.setConnected(connected);
  return mem;
}

// A poke Event as the server pushes it on `channel`.
const pokeOn = (channel: Channel): WsEvent => ({ event_type: "poke", ...channel });

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
  it("keeps the page on screen while a poke refetches the Posts (no Suspense fallback)", async () => {
    // A Post Like pokes `posts` (#122). The route renders under the app's
    // <Suspense>, so a suspending read during the refetch would swap the whole
    // route for the fallback, which looks like a page reload.
    const mem = memoryFeed();
    render(() =>
      createComponent(Suspense, {
        fallback: "Loading",
        get children() {
          const jedi = createJediFeed({ api, feed: mem.feed });
          // A function child renders as reactive text.
          return (() => jedi.selectedPost()?.title ?? "none") as unknown as JSX.Element;
        },
      }),
    );
    expect(await screen.findByText("Little Jedi")).toBeInTheDocument();

    let answer!: (posts: PostView[]) => void;
    postListMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    mem.emit(pokeOn(Channel.posts));
    await tick();
    expect(screen.queryByText("Loading")).toBeNull();
    expect(screen.getByText("Little Jedi")).toBeInTheDocument();

    answer(RANKED_POSTS);
    await tick();
    expect(screen.getByText("Little Jedi")).toBeInTheDocument();
  });

  it("subscribes to the posts channel and refetches on a poke", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();

      // The view-model subscribes to the id-less `posts` list feed.
      expect(mem.held()).toContainEqual(Channel.posts);

      // A `posts` poke refetches the ranked list; the featured Post re-derives.
      const listCallsBefore = postListMock.mock.calls.length;
      mem.emit(pokeOn(Channel.posts));
      await tick();
      await tick();
      expect(postListMock.mock.calls.length).toBeGreaterThan(listCallsBefore);

      dispose();
    });
  });

  it("connectFeed wires a feed after creation: a poke shows a new Post (#120)", async () => {
    // The route builds the view-model anonymously, then connects the socket's
    // Feed on login. A Post created elsewhere lands; its poke refetches the list.
    const mem = memoryFeed();
    const created = post(5, "New arrival", HOMER, [CAT[1]], 0);
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      // After an `await` there is no owner. Re-enter the root's owner, so its
      // dispose also ends the Feed wiring.
      const owner = getOwner();
      await tick();
      await tick();
      expect(mem.held()).toEqual([]);

      runWithOwner(owner, () => jedi.connectFeed(mem.feed));
      expect(mem.held()).toContainEqual(Channel.posts);

      postListMock.mockResolvedValue([...RANKED_POSTS, created]);
      mem.emit(pokeOn(Channel.posts));
      await tick();
      await tick();
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4, 5]);

      dispose();
    });
  });

  it("refetches the Posts when the socket (re)connects, so a missed poke is recovered (#120 review)", async () => {
    // A poke sent while the socket is down is lost. When the socket comes up, the
    // view-model reconciles by refetching, so a Post created meanwhile appears.
    const mem = memoryFeed(false);
    const created = post(5, "New arrival", HOMER, [CAT[1]], 0);
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();

      // The Post lands while the socket is down: its poke never arrives.
      postListMock.mockResolvedValue([...RANKED_POSTS, created]);
      mem.setConnected(true);
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
  const newCaption = (postId: number): CaptionView => ({
    id: 99,
    postId,
    author: HOMER,
    text: "A new contender",
    likeCount: 0,
  });

  it("subscribes to the selected Post's Caption feed, and moves it with the selection", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();
      expect(mem.held()).toContainEqual(Channel.postCaption(1));

      jedi.selectPost(2);
      await tick();
      expect(mem.held()).not.toContainEqual(Channel.postCaption(1));
      expect(mem.held()).toContainEqual(Channel.postCaption(2));

      dispose();
    });
  });

  it("a poke for the selected Post refetches its Captions, so a new one appears", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();

      captionListForPostMock.mockResolvedValue([...captionsFor(1), newCaption(1)]);
      mem.emit(pokeOn(Channel.postCaption(1)));
      await tick();
      await tick();
      expect(jedi.visibleCaptions()?.map((c) => c.id)).toContain(99);

      dispose();
    });
  });

  it("ignores a poke for a Post that is not selected", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();

      const callsBefore = captionListForPostMock.mock.calls.length;
      mem.emit(pokeOn(Channel.postCaption(2)));
      await tick();
      await tick();
      expect(captionListForPostMock.mock.calls.length).toBe(callsBefore);

      dispose();
    });
  });

  it("refetches the Captions when the socket (re)connects, so a missed poke is recovered", async () => {
    const mem = memoryFeed(false);
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();

      // The Caption lands while the socket is down: its poke never arrives.
      captionListForPostMock.mockResolvedValue([...captionsFor(1), newCaption(1)]);
      mem.setConnected(true);
      await tick();
      await tick();
      expect(jedi.visibleCaptions()?.map((c) => c.id)).toContain(99);

      dispose();
    });
  });
});

describe("createJediFeed — the selected Post's like state (#122)", () => {
  const like = (postId: number, likeCount: number, liked: boolean): Like => ({
    id: postId,
    likeCount,
    liked,
  });

  it("has no like state on the anonymous landing (no feed connected)", () =>
    withFeed((feed) => {
      expect(feed.selectedPostLike()).toBeUndefined();
      expect(postGetLikeMock).not.toHaveBeenCalled();
    }));

  it("loads the selected Post's like state once a feed connects, and re-keys with the selection", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      // After an `await` there is no owner; re-enter the root's (as above).
      const owner = getOwner();
      await tick();
      await tick();
      runWithOwner(owner, () => jedi.connectFeed(mem.feed));
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
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();
      expect(mem.held()).toContainEqual(Channel.postLike(1));

      jedi.selectPost(2);
      await tick();
      expect(mem.held()).not.toContainEqual(Channel.postLike(1));
      expect(mem.held()).toContainEqual(Channel.postLike(2));

      dispose();
    });
  });

  it("a poke for the selected Post refetches its like state, so another User's Like shows", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();

      postGetLikeMock.mockResolvedValue(like(1, 11, false));
      mem.emit(pokeOn(Channel.postLike(1)));
      await tick();
      await tick();
      expect(jedi.selectedPostLike()).toEqual(like(1, 11, false));

      // A poke for a Post that is not selected does not refetch.
      const callsBefore = postGetLikeMock.mock.calls.length;
      mem.emit(pokeOn(Channel.postLike(2)));
      await tick();
      expect(postGetLikeMock.mock.calls.length).toBe(callsBefore);

      dispose();
    });
  });

  it("togglePostLike sets the selected Post's like to the opposite state, then back", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();

      await jedi.togglePostLike();
      expect(postToggleLikeMock).toHaveBeenLastCalledWith(1, true);
      expect(jedi.selectedPostLike()).toEqual(like(1, 11, true));

      await jedi.togglePostLike();
      expect(postToggleLikeMock).toHaveBeenLastCalledWith(1, false);
      expect(jedi.selectedPostLike()).toEqual(like(1, 10, false));

      dispose();
    });
  });

  it("togglePostLike does nothing without a like state (anonymous landing)", () =>
    withFeed(async (feed) => {
      await feed.togglePostLike();
      expect(postToggleLikeMock).not.toHaveBeenCalled();
    }));
});

describe("createJediFeed — the immediate local Like, synced from the server (#122)", () => {
  const like = (postId: number, likeCount: number, liked: boolean): Like => ({
    id: postId,
    likeCount,
    liked,
  });
  // A promise the test settles by hand, to hold a back-end call in flight.
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  // A live Feed; `poke` fires a `post_like` poke by hand.
  async function withLiveFeed(run: (jedi: JediFeed, poke: (id: number) => void) => Promise<void>) {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();
      try {
        await run(jedi, (postId) => mem.emit(pokeOn(Channel.postLike(postId))));
      } finally {
        dispose();
      }
    });
  }

  it("shows the Like at once, before the back-end answers", () =>
    withLiveFeed(async (jedi) => {
      const answer = deferred<Like>();
      postToggleLikeMock.mockReturnValueOnce(answer.promise);

      const done = jedi.togglePostLike();
      expect(jedi.selectedPostLike()).toEqual(like(1, 11, true));

      answer.resolve(like(1, 11, true));
      await done;
    }));

  it("shows the back-end's view once it answers, with other Users' Likes", () =>
    withLiveFeed(async (jedi) => {
      // Another User liked the Post too, so the back-end's count is higher.
      postToggleLikeMock.mockResolvedValueOnce(like(1, 12, true));
      postGetLikeMock.mockResolvedValue(like(1, 12, true));

      await jedi.togglePostLike();
      await tick();
      expect(jedi.selectedPostLike()).toEqual(like(1, 12, true));
    }));

  it("rolls the Like back and rejects when the back-end fails", () =>
    withLiveFeed(async (jedi) => {
      postToggleLikeMock.mockRejectedValueOnce(new Error("Network down"));

      await expect(jedi.togglePostLike()).rejects.toThrow("Network down");
      await tick();
      expect(jedi.selectedPostLike()).toEqual(like(1, 10, false));
    }));

  it("ignores an older read that lands after the toggle (the race)", () =>
    withLiveFeed(async (jedi, poke) => {
      // Another User's poke starts a read that ends after our toggle.
      const olderRead = deferred<Like>();
      postGetLikeMock.mockReturnValueOnce(olderRead.promise);
      poke(1);
      await tick();

      await jedi.togglePostLike();
      olderRead.resolve(like(1, 10, false)); // read before our Like committed
      await tick();
      await tick();
      expect(jedi.selectedPostLike()).toEqual(like(1, 11, true));
    }));

  it("keeps fast clicks: the last wanted state wins, sent in order", () =>
    withLiveFeed(async (jedi) => {
      const first = deferred<Like>();
      postToggleLikeMock.mockReturnValueOnce(first.promise);

      const like1 = jedi.togglePostLike(); // like
      const unlike = jedi.togglePostLike(); // unlike, while the like is in flight
      expect(jedi.selectedPostLike()).toEqual(like(1, 10, false));

      first.resolve(like(1, 11, true));
      await Promise.all([like1, unlike]);
      await tick();
      expect(postToggleLikeMock.mock.calls).toEqual([
        [1, true],
        [1, false],
      ]);
      expect(jedi.selectedPostLike()).toEqual(like(1, 10, false));
    }));

  it("keeps each Post's last wanted state when the viewer moves to another Post mid-toggle", () =>
    withLiveFeed(async (jedi) => {
      const first = deferred<Like>();
      postToggleLikeMock.mockReturnValueOnce(first.promise);

      const p1Like = jedi.togglePostLike(); // Post 1: like
      const p1Unlike = jedi.togglePostLike(); // Post 1: unlike, while the like is in flight
      jedi.selectPost(2);
      await tick();
      await tick();
      const p2Like = jedi.togglePostLike(); // Post 2: like
      expect(jedi.selectedPostLike()).toEqual(like(2, 21, true));

      first.resolve(like(1, 11, true));
      await Promise.all([p1Like, p1Unlike, p2Like]);
      expect(postToggleLikeMock.mock.calls).toEqual([
        [1, true],
        [1, false],
        [2, true],
      ]);
    }));

  it("drops a queued Like at logout, so the next User's session never sends it", () =>
    createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      // The live session lives in its own scope, like the route's LiveFeed;
      // ending that scope is a logout.
      const logout = createRoot((end) => {
        jedi.connectFeed(memoryFeed().feed);
        return end;
      });
      await tick();
      await tick();
      const first = deferred<Like>();
      postToggleLikeMock.mockReturnValueOnce(first.promise);

      const done = jedi.togglePostLike(); // like, in flight
      void jedi.togglePostLike(); // unlike, queued
      logout();

      first.resolve(like(1, 11, true));
      await done;
      expect(postToggleLikeMock.mock.calls).toEqual([[1, true]]);
      dispose();
    }));
});

describe("createJediFeed — the selected Caption's like state (#123)", () => {
  const like = (id: number, likeCount: number, liked: boolean): Like => ({ id, likeCount, liked });
  async function withLiveFeed(
    run: (jedi: JediFeed, mem: ReturnType<typeof memoryFeed>) => Promise<void>,
    mem = memoryFeed(),
  ) {
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api, feed: mem.feed });
      await tick();
      await tick();
      try {
        await run(jedi, mem);
      } finally {
        dispose();
      }
    });
  }

  it("has no Caption like state on the anonymous landing (no feed connected)", () =>
    withFeed((feed) => {
      expect(feed.selectedCaptionLike()).toBeUndefined();
      expect(captionGetLikeMock).not.toHaveBeenCalled();
    }));

  it("loads the selected Caption's like state, and re-keys with the Caption selection", () =>
    withLiveFeed(async (jedi) => {
      // Post 1's winning Caption is Caption 1.
      expect(jedi.selectedCaptionLike()).toEqual(like(1, 100, false));

      jedi.selectCaption(2);
      await tick();
      await tick();
      expect(jedi.selectedCaptionLike()).toEqual(like(2, 200, false));
    }));

  it("re-keys with the Post selection: the new Post's winning Caption", () =>
    withLiveFeed(async (jedi) => {
      jedi.selectPost(3); // Post 3's Captions rank [6, 8]: a 2-2 tie by id.
      await tick();
      await tick();
      await tick();
      expect(jedi.selectedCaptionLike()).toEqual(like(6, 600, false));
    }));

  it("subscribes to the selected Caption's like feed, and moves it with the selection", () =>
    withLiveFeed(async (jedi, mem) => {
      expect(mem.held()).toContainEqual(Channel.captionLike(1));

      jedi.selectCaption(2);
      await tick();
      expect(mem.held()).not.toContainEqual(Channel.captionLike(1));
      expect(mem.held()).toContainEqual(Channel.captionLike(2));
    }));

  it("a poke for the selected Caption refetches its like state, so another User's Like shows", () =>
    withLiveFeed(async (jedi, mem) => {
      captionGetLikeMock.mockResolvedValue(like(1, 101, false));
      mem.emit(pokeOn(Channel.captionLike(1)));
      await tick();
      await tick();
      expect(jedi.selectedCaptionLike()).toEqual(like(1, 101, false));

      // A poke for a Caption that is not selected does not refetch.
      const callsBefore = captionGetLikeMock.mock.calls.length;
      mem.emit(pokeOn(Channel.captionLike(2)));
      await tick();
      expect(captionGetLikeMock.mock.calls.length).toBe(callsBefore);
    }));

  it("refetches the Caption like state when the socket (re)connects", async () => {
    await withLiveFeed(async (jedi, mem) => {
      captionGetLikeMock.mockResolvedValue(like(1, 105, false));
      mem.setConnected(true);
      await tick();
      await tick();
      expect(jedi.selectedCaptionLike()).toEqual(like(1, 105, false));
    }, memoryFeed(false));
  });

  it("toggleCaptionLike sets the selected Caption's like to the opposite state, then back", () =>
    withLiveFeed(async (jedi) => {
      await jedi.toggleCaptionLike();
      expect(captionToggleLikeMock).toHaveBeenLastCalledWith(1, true);
      expect(jedi.selectedCaptionLike()).toEqual(like(1, 101, true));

      await jedi.toggleCaptionLike();
      expect(captionToggleLikeMock).toHaveBeenLastCalledWith(1, false);
      expect(jedi.selectedCaptionLike()).toEqual(like(1, 100, false));
      expect(postToggleLikeMock).not.toHaveBeenCalled();
    }));
});
