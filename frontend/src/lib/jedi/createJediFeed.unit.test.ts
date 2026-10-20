import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createComponent, createRoot, getOwner, runWithOwner, Suspense, type JSX } from "solid-js";
import { render, screen } from "@solidjs/testing-library";
import { Channel } from "~/lib/channel";
import { createMemoryFeed } from "~/lib/feed.memory";
import { createDraftGuard, type DraftGuard } from "~/lib/createDraftGuard";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { JediApi } from "./jedi-api";
import type {
  AuthorRef,
  CaptionView,
  JediCategory,
  CommentView,
  Like,
  PostView,
} from "~/types/jedi";
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
      commentCount: 0,
    }));

const postListMock = vi.fn<JediApi["posts"]["list"]>();
const postGetLikeMock = vi.fn<JediApi["posts"]["getLike"]>();
const postToggleLikeMock = vi.fn<JediApi["posts"]["toggleLike"]>();
const postUpdateMock = vi.fn<JediApi["posts"]["update"]>();
const postRemoveMock = vi.fn<JediApi["posts"]["remove"]>();
const captionListForPostMock = vi.fn<JediApi["captions"]["listForPost"]>();
const captionGetLikeMock = vi.fn<JediApi["captions"]["getLike"]>();
const captionToggleLikeMock = vi.fn<JediApi["captions"]["toggleLike"]>();
const captionUpdateMock = vi.fn<JediApi["captions"]["update"]>();
const captionRemoveMock = vi.fn<JediApi["captions"]["remove"]>();
const commentListForPostMock = vi.fn<JediApi["comments"]["list"]>();
const captionCommentListMock = vi.fn<JediApi["captionComments"]["list"]>();
const api: JediApi = {
  categories: { list: () => Promise.resolve(CATEGORIES) },
  posts: {
    list: postListMock,
    create: () => Promise.reject(new Error("not used by the view-model")),
    getLike: postGetLikeMock,
    toggleLike: postToggleLikeMock,
    update: postUpdateMock,
    remove: postRemoveMock,
  },
  captions: {
    listForPost: captionListForPostMock,
    add: () => Promise.reject(new Error("not used by the view-model")),
    getLike: captionGetLikeMock,
    toggleLike: captionToggleLikeMock,
    update: captionUpdateMock,
    remove: captionRemoveMock,
  },
  comments: {
    list: commentListForPostMock,
    add: () => Promise.reject(new Error("not used here")),
    update: () => Promise.reject(new Error("not used here")),
    remove: () => Promise.reject(new Error("not used here")),
    source: () => Promise.reject(new Error("not used here")),
  },
  captionComments: {
    list: captionCommentListMock,
    add: () => Promise.reject(new Error("not used here")),
    update: () => Promise.reject(new Error("not used here")),
    remove: () => Promise.reject(new Error("not used here")),
    source: () => Promise.reject(new Error("not used here")),
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
  postUpdateMock.mockReset();
  postUpdateMock.mockImplementation((id: number) =>
    Promise.resolve(RANKED_POSTS.find((p) => p.id === id)!),
  );
  captionUpdateMock.mockReset();
  captionUpdateMock.mockImplementation((id: number) =>
    Promise.resolve(captionsFor(1).find((c) => c.id === id)!),
  );
  postRemoveMock.mockReset();
  postRemoveMock.mockResolvedValue(undefined);
  captionRemoveMock.mockReset();
  captionRemoveMock.mockResolvedValue(undefined);
  captionListForPostMock.mockReset();
  captionListForPostMock.mockImplementation((postId: number) =>
    Promise.resolve(captionsFor(postId)),
  );
  // Post N's thread holds one Comment, id N * 1000.
  commentListForPostMock.mockReset();
  commentListForPostMock.mockImplementation((postId: number) =>
    Promise.resolve([commentOn(postId, postId * 1000)]),
  );
  // Caption N's thread holds one Comment, id N * 100.
  captionCommentListMock.mockReset();
  captionCommentListMock.mockImplementation((captionId: number) =>
    Promise.resolve([commentOn(captionId, captionId * 100)]),
  );
});

const commentOn = (postId: number, id: number): CommentView => ({
  id,
  parentId: postId,
  author: author(1, "Lisa"),
  contentHtml: `<p>comment ${id}</p>`,
  ctime: "2026-10-10T12:00:00Z",
  mtime: "2026-10-10T12:00:00Z",
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

async function withAnonymousJedi(run: (jedi: JediFeed) => void | Promise<void>) {
  let dispose!: () => void;
  const jedi = createRoot((d) => {
    dispose = d;
    return createJediFeed({ api });
  });
  try {
    await tick();
    await tick();
    await run(jedi);
  } finally {
    dispose();
  }
}

describe("createJediFeed — the route's view-model seam", () => {
  it("ranks the visible posts with the top photo first under the default 'All' row", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedCategory()).toBe(0);
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4]);
      expect(jedi.visiblePosts()?.[0].title).toBe("Little Jedi");
    }));

  it("lists every category for the sidebar, behind an 'All' filter row (#33-b)", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.categories()?.map((c) => c.name)).toEqual([
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
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedCategory()).toBe(0);
      jedi.setSelectedCategory(2);
      expect(jedi.selectedCategory()).toBe(2);
    }));

  it("defaults selectedPost to the top-ranked post", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedPost()?.id).toBe(1);
      expect(jedi.selectedPost()?.title).toBe("Little Jedi");
    }));

  it("selectPost switches the selected post to the clicked one", () =>
    withAnonymousJedi((jedi) => {
      jedi.selectPost(2);
      expect(jedi.selectedPost()?.id).toBe(2);
      expect(jedi.selectedPost()?.title).toBe("Brilliant tree");
    }));

  it("exposes the externalized hero content", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.hero()?.title).toBe("Awesome Photos & Captions");
      expect(jedi.hero()?.ctaText).toBe("Get Started");
    }));
});

describe("createJediFeed — visiblePosts, the category filter (#33-b)", () => {
  it("shows every post under the default 'All' row", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedCategory()).toBe(0);
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4]);
    }));

  it("filters posts to the selected category", () =>
    withAnonymousJedi((jedi) => {
      jedi.setSelectedCategory(1); // Landscape — "Brilliant tree" (2), "Serene Beach" (4)
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([2, 4]);
      jedi.setSelectedCategory(3); // Animals — "Little Jedi" (1), "Camouflage" (3)
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([1, 3]);
    }));

  it("shows no posts for a category nothing is tagged with", () =>
    withAnonymousJedi((jedi) => {
      jedi.setSelectedCategory(2); // People — no posts
      expect(jedi.visiblePosts()).toEqual([]);
    }));

  it("keeps visiblePosts ranked by likes", () =>
    withAnonymousJedi((jedi) => {
      const likes = jedi.visiblePosts()!.map((p) => p.likeCount);
      expect(likes).toEqual([...likes].sort((a, b) => b - a));
    }));

  it("moves selectedPost to the first visible post when the filter hides it", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedPost()?.id).toBe(1); // top-ranked default
      jedi.setSelectedCategory(1); // Landscape hides post 1
      expect(jedi.selectedPost()?.id).toBe(2);
    }));

  it("keeps an explicitly selected post while the filter still shows it", () =>
    withAnonymousJedi((jedi) => {
      jedi.selectPost(2);
      jedi.setSelectedCategory(1); // Landscape still contains post 2
      expect(jedi.selectedPost()?.id).toBe(2);
    }));
});

describe("createJediFeed — the empty-category state", () => {
  it("has no empty-category label under the default 'All' row", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.emptyCategoryLabel()).toBeUndefined();
    }));

  it("has no empty-category label for a category that has posts", () =>
    withAnonymousJedi((jedi) => {
      jedi.setSelectedCategory(3); // Animals — post 1
      expect(jedi.emptyCategoryLabel()).toBeUndefined();
    }));

  it("exposes the category name when the filter matches no posts", () =>
    withAnonymousJedi((jedi) => {
      jedi.setSelectedCategory(2); // People — no posts
      expect(jedi.emptyCategoryLabel()).toBe("People");
    }));

  it("leaves selectedPost undefined for an empty category (no top-ranked fallback)", () =>
    withAnonymousJedi((jedi) => {
      jedi.setSelectedCategory(2); // People — no posts
      expect(jedi.selectedPost()).toBeUndefined();
    }));
});

describe("createJediFeed — the captions of the selected post", () => {
  it("ranks the selected post's captions by likes (top first)", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.visibleCaptions()?.map((c) => c.likeCount)).toEqual([8, 5]);
    }));

  it("renders the selected post's captions as visibleCaptions when a post is shown", () =>
    withAnonymousJedi((jedi) => {
      const postId = jedi.selectedPost()?.id;
      expect(jedi.visibleCaptions()?.length).toBeGreaterThan(0);
      expect(jedi.visibleCaptions()?.every((c) => c.postId === postId)).toBe(true);
    }));

  it("empties visibleCaptions when the category leaves no photo selected", () =>
    withAnonymousJedi((jedi) => {
      jedi.setSelectedCategory(2); // People — no posts, no selected photo
      expect(jedi.selectedPost()).toBeUndefined();
      expect(jedi.visibleCaptions()).toEqual([]);
    }));

  it("defaults selectedCaption to the winning (top-ranked) caption of the selected post", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedCaption()).toBe(jedi.visibleCaptions()?.[0]);
      expect(jedi.selectedCaption()?.text).toBe("Jedi Kitty protects the street");
    }));

  it("selectCaption switches the caption shown in <main>", () =>
    withAnonymousJedi((jedi) => {
      jedi.selectCaption(2);
      expect(jedi.selectedCaption()?.text).toBe("May the paws be with you");
    }));

  it("re-keys the captions and selected caption to the newly selected post", () =>
    withAnonymousJedi(async (jedi) => {
      expect(jedi.visibleCaptions()?.map((c) => c.likeCount)).toEqual([8, 5]);
      jedi.selectPost(2);
      await tick();
      await tick();
      const caps2 = jedi.visibleCaptions();
      expect(caps2?.every((c) => c.postId === 2)).toBe(true);
      expect(jedi.selectedCaption()).toBe(caps2?.[0]);
    }));

  it("self-resets to the new post's winning caption when the post changes", () =>
    withAnonymousJedi(async (jedi) => {
      jedi.selectCaption(2); // a caption of post 1
      expect(jedi.selectedCaption()?.id).toBe(2);
      jedi.selectPost(2);
      await tick();
      await tick();
      // Caption 2 belongs to post 1, so it falls back to post 2's winner.
      expect(jedi.selectedCaption()).toBe(jedi.visibleCaptions()?.[0]);
      expect(jedi.selectedCaption()?.postId).toBe(2);
    }));

  // The captions load by a network RPC, so the previous post's captions must not
  // stand in for the new post's while that request is in flight (#118 review):
  // neither Top Captions nor <main> may offer a caption of the wrong post.
  it("shows no captions of the previous post while the new post's captions load", () =>
    withAnonymousJedi(async (jedi) => {
      let release!: () => void;
      captionListForPostMock.mockImplementationOnce(
        (postId: number) =>
          new Promise((resolve) => {
            release = () => resolve(captionsFor(postId));
          }),
      );
      jedi.selectCaption(2); // a caption of post 1
      jedi.selectPost(2);
      await tick();
      await tick();
      // In flight: no caption at all, rather than post 1's.
      expect(jedi.visibleCaptions()).toBeUndefined();
      expect(jedi.selectedCaption()).toBeUndefined();

      release();
      await tick();
      await tick();
      expect(jedi.visibleCaptions()?.every((c) => c.postId === 2)).toBe(true);
      expect(jedi.selectedCaption()?.postId).toBe(2);
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
      const jedi = createJediFeed({ api });
      await tick();
      await tick();
      expect(jedi.visibleCaptions()).toEqual([]); // post 1: loaded, none

      jedi.selectPost(2);
      await tick();
      await tick();
      expect(jedi.visibleCaptions()).toBeUndefined(); // post 2: still loading

      release();
      await tick();
      await tick();
      expect(jedi.visibleCaptions()).toEqual(captionsFor(2));

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
          const jedi = createJediFeed({ api });
          jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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

  it("does not subscribe when no feed is connected (anonymous landing)", async () => {
    // No feed: the view-model still loads Posts, but wires no subscription.
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      await tick();
      await tick();
      expect(jedi.visiblePosts()?.map((p) => p.id)).toEqual([1, 3, 2, 4]);
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
    commentCount: 0,
  });

  it("subscribes to the selected Post's Caption feed, and moves it with the selection", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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

describe("createJediFeed — the selected Post's Comment thread (#124)", () => {
  const ids = (jedi: JediFeed) => jedi.postComments.comments()?.map((c) => c.id);

  it("loads the selected Post's thread only while the panel is open, also on the anonymous landing", () =>
    withAnonymousJedi(async (jedi) => {
      expect(jedi.postComments.open()).toBe(false);
      expect(commentListForPostMock).not.toHaveBeenCalled();

      jedi.postComments.setOpen(true);
      await tick();
      expect(ids(jedi)).toEqual([1000]);

      // Another Post closes the panel; opening it there loads that thread.
      jedi.selectPost(2);
      expect(jedi.postComments.open()).toBe(false);
      jedi.postComments.setOpen(true);
      await tick();
      expect(ids(jedi)).toEqual([2000]);
    }));

  it("holds the thread's Subscription only while the panel is open", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
      await tick();
      await tick();
      const commentChannels = () => mem.held().filter((c) => c.kind === "post_comment");
      expect(commentChannels()).toEqual([]);

      jedi.postComments.setOpen(true);
      await tick();
      expect(mem.held()).toContainEqual(Channel.postComment(1));

      // Another Post closes the panel, so its Subscription ends too.
      jedi.selectPost(2);
      await tick();
      expect(commentChannels()).toEqual([]);

      dispose();
    });
  });

  it("a pushed Comment for the selected Post shows in its thread", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
      await tick();
      await tick();
      jedi.postComments.setOpen(true);
      await tick();

      mem.emit({
        event_type: "post_comment",
        payload: {
          id: 1001,
          parent_id: 1,
          author: { id: 2, name: "Homer", avatar_url: null },
          content_html: "<p>live</p>",
          ctime: "2026-10-10T12:01:00Z",
          mtime: "2026-10-10T12:01:00Z",
        },
      });
      expect(ids(jedi), "the newer Comment goes on top").toEqual([1001, 1000]);

      dispose();
    });
  });

  it("a posts poke neither reloads the thread nor recreates its rows", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
      await tick();
      await tick();
      jedi.postComments.setOpen(true);
      await tick();
      const row = jedi.postComments.comments()![0];
      const loads = commentListForPostMock.mock.calls.length;

      // A Comment add pokes `posts`: the refetched list holds new Post objects.
      postListMock.mockResolvedValue(RANKED_POSTS.map((p) => ({ ...p })));
      mem.emit(pokeOn(Channel.posts));
      await tick();
      await tick();

      expect(commentListForPostMock.mock.calls.length).toBe(loads);
      expect(jedi.postComments.comments()![0]).toBe(row);
      expect(jedi.postComments.open(), "the panel stays open").toBe(true);

      dispose();
    });
  });
});

describe("createJediFeed — the shown Caption's Comment thread (#127)", () => {
  const ids = (jedi: JediFeed) => jedi.captionComments.comments()?.map((c) => c.id);
  // A Like re-ranks Post 1's Captions: Caption 2 is now first.
  const reRankCaptions = () => {
    const [first, second] = captionsFor(1);
    captionListForPostMock.mockResolvedValue([{ ...second, likeCount: 9 }, first]);
  };

  it("loads the shown Caption's thread only while its panel is open, also on the anonymous landing", () =>
    withAnonymousJedi(async (jedi) => {
      expect(jedi.captionComments.open()).toBe(false);
      expect(captionCommentListMock).not.toHaveBeenCalled();

      jedi.captionComments.setOpen(true);
      await tick();
      expect(ids(jedi)).toEqual([100]);

      // A pick of another Caption closes the panel.
      jedi.selectCaption(2);
      expect(jedi.captionComments.open()).toBe(false);
    }));

  it("holds the caption_comment Subscription only while the panel is open", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
      await tick();
      await tick();
      const threadChannels = () => mem.held().filter((c) => c.kind === "caption_comment");
      expect(threadChannels()).toEqual([]);

      jedi.captionComments.setOpen(true);
      await tick();
      expect(threadChannels()).toEqual([Channel.captionComment(1)]);

      jedi.captionComments.setOpen(false);
      await tick();
      expect(threadChannels()).toEqual([]);

      dispose();
    });
  });

  it("an open panel holds the Caption shown across a re-rank; after a close, the line follows the ranking", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
      await tick();
      await tick();
      expect(jedi.selectedCaption()?.id).toBe(1);
      jedi.captionComments.setOpen(true);

      reRankCaptions();
      mem.emit(pokeOn(Channel.postCaption(1)));
      await tick();
      await tick();
      expect(jedi.visibleCaptions()![0].id).toBe(2);
      expect(jedi.selectedCaption()?.id, "the Caption line stays").toBe(1);
      expect(jedi.captionComments.open(), "the panel stays open").toBe(true);

      jedi.captionComments.setOpen(false);
      expect(jedi.selectedCaption()?.id, "it follows the ranking again").toBe(2);

      dispose();
    });
  });
});

describe("createJediFeed — one Comments panel at a time (#210)", () => {
  it("an open of the Post thread closes an open Caption thread, and the reverse", () =>
    withAnonymousJedi(async (jedi) => {
      jedi.captionComments.setOpen(true);
      jedi.postComments.setOpen(true);
      expect(jedi.postComments.open()).toBe(true);
      expect(jedi.captionComments.open()).toBe(false);
      await tick();
      expect(jedi.postComments.comments()?.map((c) => c.id)).toEqual([1000]);

      jedi.captionComments.setOpen(true);
      expect(jedi.captionComments.open()).toBe(true);
      expect(jedi.postComments.open()).toBe(false);
    }));

  it("with a Draft in the open thread, an open of the other asks; Discard switches the panels", () =>
    withLive(async (jedi, guard) => {
      jedi.postComments.setOpen(true);
      guard.report(Symbol("post comment"), true, jedi.postComments.draftScope);

      jedi.captionComments.setOpen(true);
      expect(guard.pending()).toBe(true);
      guard.cancelMove();
      expect(jedi.postComments.open(), "Keep editing keeps the open thread").toBe(true);
      expect(jedi.captionComments.open()).toBe(false);
      expect(guard.hasDraftIn([jedi.postComments.draftScope]), "and its Draft").toBe(true);

      jedi.captionComments.setOpen(true);
      guard.confirmMove();
      expect(jedi.postComments.open()).toBe(false);
      expect(jedi.captionComments.open()).toBe(true);
      expect(guard.hasDraft(), "Discard drops the thread's Drafts").toBe(false);
    }));

  it("an Add Caption Draft does not stop a switch: it is outside both thread scopes", () =>
    withLive(async (jedi, guard) => {
      guard.report(Symbol("add caption"), true, jedi.addCaptionScope);
      jedi.captionComments.setOpen(true);

      jedi.postComments.setOpen(true);
      expect(guard.pending()).toBe(false);
      expect(jedi.postComments.open()).toBe(true);
      expect(jedi.captionComments.open()).toBe(false);
      expect(guard.hasDraft(), "the Add Caption Draft stays").toBe(true);
    }));

  it("while a form in the open thread writes, an open of the other does nothing and asks nothing", () =>
    withLive(async (jedi, guard) => {
      jedi.captionComments.setOpen(true);
      const form = Symbol("caption comment");
      guard.report(form, true, jedi.captionComments.draftScope);
      guard.reportBusy(form, true, jedi.captionComments.draftScope);

      jedi.postComments.setOpen(true);
      expect(guard.pending()).toBe(false);
      expect(jedi.captionComments.open()).toBe(true);
      expect(jedi.postComments.open()).toBe(false);
    }));

  it("after a switch away from the Caption thread, the Caption shown follows the ranking", () =>
    withLive(async (jedi, _guard, mem) => {
      const [winner, next] = captionsFor(1);
      jedi.captionComments.setOpen(true);
      captionListForPostMock.mockImplementation((postId: number) =>
        Promise.resolve(postId === 1 ? [next, winner] : captionsFor(postId)),
      );
      mem.emit(pokeOn(Channel.postCaption(1)));
      await settle();
      expect(jedi.selectedCaption()?.id, "the open thread holds the Caption").toBe(winner.id);

      jedi.postComments.setOpen(true);
      expect(jedi.selectedCaption()?.id, "the switch ends the hold").toBe(next.id);

      // A re-rank back to the seeded order.
      captionListForPostMock.mockImplementation((postId: number) =>
        Promise.resolve(captionsFor(postId)),
      );
      mem.emit(pokeOn(Channel.postCaption(1)));
      await settle();
      expect(jedi.selectedCaption()?.id, "a re-rank after the switch").toBe(winner.id);
    }));

  it("a Caption pick leaves an open Post panel open", () =>
    withLive(async (jedi) => {
      jedi.postComments.setOpen(true);
      jedi.selectCaption(captionsFor(1)[1].id);
      expect(jedi.selectedCaption()?.id).toBe(captionsFor(1)[1].id);
      expect(jedi.postComments.open()).toBe(true);
    }));
});

describe("createJediFeed — the Draft guard (ADR-0030)", () => {
  // The view-model inside a guard that holds a Draft, as a form would report.
  async function withDraft(run: (jedi: JediFeed, guard: DraftGuard) => void | Promise<void>) {
    let dispose!: () => void;
    const { jedi, guard } = createRoot((d) => {
      dispose = d;
      const guard = createDraftGuard();
      return { jedi: createJediFeed({ api, guard }), guard };
    });
    try {
      await tick();
      await tick();
      guard.report(Symbol("add caption"), true, jedi.addCaptionScope);
      await run(jedi, guard);
    } finally {
      dispose();
    }
  }

  it("a Top Photo click waits for the confirm, then moves", () =>
    withDraft((jedi, guard) => {
      jedi.selectPost(2);
      expect(jedi.selectedPost()?.id).toBe(1);
      expect(guard.pending()).toBe(true);

      guard.confirmMove();
      expect(jedi.selectedPost()?.id).toBe(2);
    }));

  it("a click on the Post already shown is no move", () =>
    withDraft((jedi, guard) => {
      jedi.selectPost(1);
      expect(guard.pending()).toBe(false);
    }));

  it("guards a category change only when it changes the selected Post", () =>
    withDraft((jedi, guard) => {
      jedi.setSelectedCategory(3); // Animals still lists post 1
      expect(guard.pending()).toBe(false);
      expect(jedi.selectedCategory()).toBe(3);

      jedi.setSelectedCategory(1); // Landscape moves the article to post 2
      expect(guard.pending()).toBe(true);
      expect(jedi.selectedCategory()).toBe(3);
      guard.cancelMove();
      expect(jedi.selectedPost()?.id).toBe(1);
    }));

  it("guards closing the Comments panel, not opening it", () =>
    withDraft((jedi, guard) => {
      jedi.postComments.setOpen(true);
      expect(jedi.postComments.open()).toBe(true);
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);

      jedi.postComments.setOpen(false);
      expect(jedi.postComments.open()).toBe(true);
      guard.confirmMove();
      expect(jedi.postComments.open()).toBe(false);
    }));

  it("a panel close asks only about the panel's Drafts", () =>
    withDraft((jedi, guard) => {
      // `withDraft`'s Draft sits outside the panel, as an Add Caption Draft does.
      jedi.postComments.setOpen(true);
      jedi.postComments.setOpen(false);
      expect(guard.pending()).toBe(false);
      expect(jedi.postComments.open()).toBe(false);

      jedi.postComments.setOpen(true);
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      jedi.postComments.setOpen(false);
      guard.confirmMove();
      expect(jedi.postComments.open()).toBe(false);
      expect(guard.hasDraft(), "Discard keeps the Draft outside the panel").toBe(true);
    }));

  it("guards a Caption pick that changes the Caption shown, in the Caption thread's scope (#127)", () =>
    withDraft((jedi, guard) => {
      // `withDraft`'s Draft sits outside the Caption panel: a pick runs at once.
      jedi.selectCaption(2);
      expect(guard.pending()).toBe(false);
      expect(jedi.selectedCaption()?.id).toBe(2);

      jedi.captionComments.setOpen(true);
      guard.report(Symbol("caption comment"), true, jedi.captionComments.draftScope);
      jedi.selectCaption(2);
      expect(guard.pending(), "a pick of the Caption shown is no move").toBe(false);

      jedi.selectCaption(1);
      expect(guard.pending()).toBe(true);
      expect(jedi.selectedCaption()?.id).toBe(2);
      guard.confirmMove();
      expect(jedi.selectedCaption()?.id).toBe(1);
      expect(jedi.captionComments.open()).toBe(false);
    }));

  it("keeps the shown Post while a Draft exists: a re-rank does not move the article", async () => {
    const mem = memoryFeed();
    await createRoot(async (dispose) => {
      const guard = createDraftGuard();
      const jedi = createJediFeed({ api, guard });
      jedi.connectFeed(mem.feed);
      await tick();
      await tick();
      expect(jedi.selectedPost()?.id).toBe(1);
      const draft = Symbol("add caption");
      guard.report(draft, true, jedi.addCaptionScope);

      // A Like re-ranks the Posts: post 3 is now first.
      const [first, second, ...rest] = RANKED_POSTS;
      postListMock.mockResolvedValue([second, first, ...rest]);
      mem.emit(pokeOn(Channel.posts));
      await tick();
      await tick();
      expect(jedi.visiblePosts()![0].id).toBe(3);
      expect(jedi.selectedPost()?.id, "the article stays").toBe(1);

      guard.report(draft, false);
      expect(jedi.selectedPost()?.id, "it follows the ranking again").toBe(3);

      dispose();
    });
  });
});

// The view-model with a live Feed, inside a real guard (#187).
async function withLive(
  run: (jedi: JediFeed, guard: DraftGuard, mem: ReturnType<typeof memoryFeed>) => Promise<void>,
) {
  const mem = memoryFeed();
  await createRoot(async (dispose) => {
    try {
      const guard = createDraftGuard();
      const jedi = createJediFeed({ api, guard });
      jedi.connectFeed(mem.feed);
      await tick();
      await tick();
      await run(jedi, guard, mem);
    } finally {
      dispose();
    }
  });
}
const settle = async () => {
  await tick();
  await tick();
};

describe("createJediFeed — a Post or Caption delete (#187)", () => {
  const POST_DELETED = "This Post was deleted. Your unsaved changes were discarded.";
  const CAPTION_DELETED = "This Caption was deleted. Your unsaved changes were discarded.";
  // The back-end after a delete: Post 1 is gone.
  const withoutPost1 = () => postListMock.mockResolvedValue(RANKED_POSTS.slice(1));
  // The back-end after a delete: the Caption `id` of Post 1 is gone.
  const withoutCaption = (id: number) =>
    captionListForPostMock.mockImplementation((postId: number) =>
      Promise.resolve(captionsFor(postId).filter((c) => c.id !== id)),
    );

  it("the Owner's Post delete releases every Draft, shows no notice, refetches and speaks", () =>
    withLive(async (jedi, guard, mem) => {
      guard.report(Symbol("add caption"), true, jedi.addCaptionScope);
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      expect(jedi.postOwner.removeDiscardsDraft()).toBe(true);
      let answer!: () => void;
      postRemoveMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      withoutPost1();

      const deleted = jedi.postOwner.remove(1);
      expect(postRemoveMock).toHaveBeenCalledWith(1);
      expect(guard.hasDraft(), "released when the Owner confirms").toBe(false);
      // The poke can arrive before the delete result (ADR-0016).
      mem.emit(pokeOn(Channel.posts));
      await settle();
      answer();
      await deleted;
      await settle();

      expect(guard.notice()).toBeUndefined();
      expect(jedi.selectedPost()?.id, "the fallback picks what shows").toBe(3);
      expect(jedi.announcement()).toBe("Post deleted.");
    }));

  it("a failed Post delete holds the Drafts again and rejects", () =>
    withLive(async (jedi, guard) => {
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      postRemoveMock.mockRejectedValueOnce(new Error("Could not delete the Post"));

      await expect(jedi.postOwner.remove(1)).rejects.toThrow("Could not delete the Post");
      expect(guard.hasDraft()).toBe(true);
      expect(jedi.selectedPost()?.id).toBe(1);
    }));

  it("a delete of a subject that is no longer shown deletes nothing and rejects", () =>
    withLive(async (jedi, guard) => {
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      const caption = jedi.selectedCaption()!.id;

      await expect(jedi.postOwner.remove(3)).rejects.toThrow(
        "The Post shown changed. Nothing was deleted.",
      );
      await expect(jedi.captionOwner.remove(caption + 1)).rejects.toThrow(
        "The Caption shown changed. Nothing was deleted.",
      );
      expect(postRemoveMock).not.toHaveBeenCalled();
      expect(captionRemoveMock).not.toHaveBeenCalled();
      expect(guard.hasDraft(), "no Draft is released").toBe(true);
    }));

  it("the Owner's Caption delete releases only its Comments panel's Drafts", () =>
    withLive(async (jedi, guard) => {
      const shown = jedi.selectedCaption()!.id;
      const outside = Symbol("add caption");
      guard.report(outside, true, jedi.addCaptionScope);
      expect(jedi.captionOwner.removeDiscardsDraft()).toBe(false);
      guard.report(Symbol("caption comment"), true, jedi.captionComments.draftScope);
      expect(jedi.captionOwner.removeDiscardsDraft()).toBe(true);
      withoutCaption(shown);

      await jedi.captionOwner.remove(shown);
      await settle();

      expect(captionRemoveMock).toHaveBeenCalledWith(shown);
      expect(guard.holds(outside), "a Draft outside the panel stays").toBe(true);
      expect(guard.notice()).toBeUndefined();
      expect(jedi.selectedCaption()?.id).not.toBe(shown);
      expect(jedi.announcement()).toBe("Caption deleted.");
    }));

  it("another User's Post delete discards every Draft on the Post with the Post notice", () =>
    withLive(async (jedi, guard, mem) => {
      guard.report(Symbol("add caption"), true, jedi.addCaptionScope);
      guard.report(Symbol("caption comment"), true, jedi.captionComments.draftScope);
      withoutPost1();
      mem.emit(pokeOn(Channel.posts));
      await settle();

      expect(guard.notice()).toBe(POST_DELETED);
      expect(guard.hasDraft()).toBe(false);
      expect(jedi.selectedPost()?.id).toBe(3);
    }));

  it("a viewer without a Draft hears the Post delete and gets no dialog", () =>
    withLive(async (jedi, guard, mem) => {
      withoutPost1();
      mem.emit(pokeOn(Channel.posts));
      await settle();

      expect(guard.notice()).toBeUndefined();
      expect(jedi.announcement()).toBe("This Post was deleted.");
    }));

  it("another User's Caption delete discards its panel's Drafts with the Caption notice", () =>
    withLive(async (jedi, guard, mem) => {
      const shown = jedi.selectedCaption()!.id;
      const outside = Symbol("add caption");
      guard.report(outside, true, jedi.addCaptionScope);
      guard.report(Symbol("caption comment"), true, jedi.captionComments.draftScope);
      withoutCaption(shown);
      mem.emit(pokeOn(Channel.postCaption(1)));
      await settle();

      expect(guard.notice()).toBe(CAPTION_DELETED);
      expect(guard.holds(outside), "a Draft outside the Caption stays").toBe(true);
      expect(jedi.selectedCaption()?.id).not.toBe(shown);
    }));

  it("a viewer without a Draft on the Caption hears its delete", () =>
    withLive(async (jedi, guard, mem) => {
      withoutCaption(jedi.selectedCaption()!.id);
      mem.emit(pokeOn(Channel.postCaption(1)));
      await settle();

      expect(guard.notice()).toBeUndefined();
      expect(jedi.announcement()).toBe("This Caption was deleted.");
    }));

  it("a refetch that keeps the shown Post and Caption says nothing", () =>
    withLive(async (jedi, guard, mem) => {
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      mem.emit(pokeOn(Channel.posts));
      mem.emit(pokeOn(Channel.postCaption(1)));
      await settle();

      expect(guard.notice()).toBeUndefined();
      expect(guard.hasDraft()).toBe(true);
      expect(jedi.announcement()).toBe("");
    }));
});

describe("createJediFeed — the Post and Caption edits (#187)", () => {
  // Category index 3 is Animals: Posts 1 and 3, in that rank.
  const ANIMALS = 3;
  const T6 = "This Post is no longer in Animals. Your unsaved changes may not apply.";
  const LEFT = "This Post is no longer in Animals.";
  // The back-end after another User's edit: Post 1 is only in Landscape.
  const post1LeavesAnimals = () =>
    postListMock.mockResolvedValue(
      RANKED_POSTS.map((p) => (p.id === 1 ? { ...p, categories: [CAT[1]] } : p)),
    );
  // The back-end after a re-rank: Post 3 first.
  const reRanked = () => {
    const [first, second, ...rest] = RANKED_POSTS;
    postListMock.mockResolvedValue([second, first, ...rest]);
  };

  it("an open Post edit holds the shown Post across a re-rank, with no Draft", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.postOwner.edit.setOpen(true);
      expect(jedi.postOwner.edit.open()).toBe(true);
      reRanked();
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.hasDraft()).toBe(false);
      expect(jedi.selectedPost()?.id, "the edit holds the Post").toBe(1);

      jedi.postOwner.edit.setOpen(false);
      expect(jedi.selectedPost()?.id, "a close lets it follow the ranking").toBe(3);
    }));

  it("an open Caption edit holds the Caption shown across a re-rank", () =>
    withLive(async (jedi, _guard, mem) => {
      const [winner, next] = captionsFor(1);
      jedi.captionOwner.edit.setOpen(true);
      captionListForPostMock.mockImplementation((postId: number) =>
        Promise.resolve(postId === 1 ? [next, winner] : captionsFor(postId)),
      );
      mem.emit(pokeOn(Channel.postCaption(1)));
      await settle();
      expect(jedi.selectedCaption()?.id).toBe(winner.id);
      expect(jedi.captionOwner.edit.open()).toBe(true);

      jedi.captionOwner.edit.setOpen(false);
      expect(jedi.selectedCaption()?.id).toBe(next.id);
    }));

  it("a change of the shown Post or Caption closes its edit", () =>
    withLive(async (jedi) => {
      jedi.captionOwner.edit.setOpen(true);
      jedi.selectCaption(captionsFor(1)[1].id);
      await settle();
      expect(jedi.captionOwner.edit.open()).toBe(false);

      jedi.postOwner.edit.setOpen(true);
      jedi.selectPost(2);
      await settle();
      expect(jedi.postOwner.edit.open()).toBe(false);
      jedi.selectPost(1);
      await settle();
      expect(jedi.postOwner.edit.open(), "a return does not reopen it").toBe(false);
    }));

  it("a Caption pick names the Caption edit and Caption thread scopes", () =>
    withLive(async (jedi, guard) => {
      const other = captionsFor(1)[1].id;
      guard.report(Symbol("add caption"), true, jedi.addCaptionScope);
      jedi.selectCaption(other);
      expect(guard.pending(), "a Draft outside both scopes").toBe(false);
      jedi.selectCaption(captionsFor(1)[0].id);

      const edit = Symbol("caption edit");
      guard.report(edit, true, jedi.captionOwner.edit.draftScope);
      jedi.selectCaption(other);
      expect(guard.pending(), "a Draft in the Caption edit").toBe(true);
      guard.cancelMove();
      guard.report(edit, false, jedi.captionOwner.edit.draftScope);

      guard.report(Symbol("caption comment"), true, jedi.captionComments.draftScope);
      jedi.selectCaption(other);
      expect(guard.pending(), "a Draft in the Caption thread").toBe(true);
    }));

  it("postOwner.save saves the changes, refetches at once and speaks", () =>
    withLive(async (jedi) => {
      const before = postListMock.mock.calls.length;
      await jedi.postOwner.save(1, { title: "Big Jedi" });
      expect(postUpdateMock).toHaveBeenCalledWith(1, { title: "Big Jedi" });
      expect(postListMock.mock.calls.length).toBeGreaterThan(before);
      expect(jedi.announcement()).toBe("Post saved.");
    }));

  it("the Owner's own Category edit switches the filter to All when it sends the save", () =>
    withLive(async (jedi, guard) => {
      jedi.setSelectedCategory(ANIMALS);
      guard.report(Symbol("post edit"), true, jedi.postOwner.edit.draftScope);
      let answer!: (post: PostView) => void;
      postUpdateMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      const saved = jedi.postOwner.save(1, { categoryIds: [1] });

      expect(jedi.selectedCategory()).toBe(0);
      expect(jedi.selectedPost()?.id).toBe(1);
      expect(guard.pending(), "no question").toBe(false);
      answer(RANKED_POSTS[0]);
      await saved;
    }));

  it("captionOwner.save saves the text, refetches at once and speaks", () =>
    withLive(async (jedi) => {
      const id = jedi.selectedCaption()!.id;
      const before = captionListForPostMock.mock.calls.length;
      await jedi.captionOwner.save(id, "New text");
      expect(captionUpdateMock).toHaveBeenCalledWith(id, "New text");
      expect(captionListForPostMock.mock.calls.length).toBeGreaterThan(before);
      expect(jedi.announcement()).toBe("Caption saved.");
    }));

  it("an Event Category leave keeps the Post with a Draft and asks once; Keep editing keeps it", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      const draft = Symbol("comment");
      guard.report(draft, true, jedi.postComments.draftScope);
      post1LeavesAnimals();
      mem.emit(pokeOn(Channel.posts));
      await settle();

      expect(jedi.selectedPost()?.id, "the Post stays shown").toBe(1);
      expect(guard.pending()).toBe(true);
      expect(guard.question()).toBe(T6);
      guard.cancelMove();
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.pending(), "once per leave").toBe(false);
      expect(jedi.selectedPost()?.id).toBe(1);

      // The last Draft ends: the top-ranked Post in the Category shows.
      guard.report(draft, false);
      await settle();
      expect(jedi.selectedPost()?.id).toBe(3);
      expect(jedi.announcement()).toBe(LEFT);
    }));

  it("a held Post that leaves its Category empty stays shown, with no empty panel", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      const draft = Symbol("comment");
      guard.report(draft, true, jedi.postComments.draftScope);
      // Every Post leaves Animals, so the filter lists none.
      postListMock.mockResolvedValue(
        RANKED_POSTS.map((p) => ({
          ...p,
          categories: p.categories.filter((c) => c.id !== ANIMALS),
        })),
      );
      mem.emit(pokeOn(Channel.posts));
      await settle();

      expect(jedi.selectedPost()?.id, "the Post stays shown").toBe(1);
      expect(jedi.emptyCategoryLabel(), "no empty panel unmounts its forms").toBeUndefined();
      expect(guard.question()).toBe(T6);

      // The last Draft ends: the Category is empty.
      guard.cancelMove();
      guard.report(draft, false);
      await settle();
      expect(jedi.emptyCategoryLabel()).toBe("Animals");
    }));

  it("Discard on the Category question drops the Drafts and moves the article", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      post1LeavesAnimals();
      mem.emit(pokeOn(Channel.posts));
      await settle();

      guard.confirmMove();
      await settle();
      expect(guard.hasDraft()).toBe(false);
      expect(jedi.selectedPost()?.id).toBe(3);
      expect(jedi.announcement()).toBe(LEFT);
    }));

  it("Discard on the Category question also closes an open Post edit, so its forms unmount", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      jedi.postOwner.edit.setOpen(true);
      guard.report(Symbol("post edit"), true, jedi.postOwner.edit.draftScope);
      post1LeavesAnimals();
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.question()).toBe(T6);

      guard.confirmMove();
      await settle();
      expect(jedi.postOwner.edit.open()).toBe(false);
      expect(jedi.selectedPost()?.id).toBe(3);
    }));

  it("a repeated message is spoken again: the live region clears first", () =>
    withLive(async (jedi) => {
      await jedi.postOwner.save(1, { title: "Big Jedi" });
      expect(jedi.announcement()).toBe("Post saved.");
      const saved = jedi.postOwner.save(1, { title: "Bigger Jedi" });
      await Promise.resolve();
      expect(jedi.announcement(), "cleared before the same text").toBe("");
      await saved;
      await settle();
      expect(jedi.announcement()).toBe("Post saved.");
    }));

  it("a viewer without a Draft sees the article move and hears why", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      post1LeavesAnimals();
      mem.emit(pokeOn(Channel.posts));
      await settle();

      expect(guard.pending()).toBe(false);
      expect(jedi.selectedPost()?.id).toBe(3);
      expect(jedi.announcement()).toBe(LEFT);
    }));

  it("an open edit with no Draft keeps the Post with no question, until it closes", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      jedi.postOwner.edit.setOpen(true);
      post1LeavesAnimals();
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.pending()).toBe(false);
      expect(jedi.selectedPost()?.id).toBe(1);

      jedi.postOwner.edit.setOpen(false);
      await settle();
      expect(jedi.selectedPost()?.id).toBe(3);
      expect(jedi.announcement()).toBe(LEFT);
    }));

  it("a User's own Category change still asks first, then moves", () =>
    withLive(async (jedi, guard) => {
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      jedi.setSelectedCategory(1); // Landscape does not list Post 1
      expect(guard.pending()).toBe(true);
      expect(guard.question()).toBe("You have unsaved changes. Discard them?");
      guard.confirmMove();
      expect(jedi.selectedPost()?.id).toBe(2);
      expect(jedi.announcement(), "a User's own move says nothing").toBe("");
    }));

  it("a Post delete while the Category question is open shows the Post notice instead", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      post1LeavesAnimals();
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.pending()).toBe(true);

      postListMock.mockResolvedValue(RANKED_POSTS.slice(1));
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.pending()).toBe(false);
      expect(guard.notice()).toBe("This Post was deleted. Your unsaved changes were discarded.");
    }));

  it("a deleted Caption discards the Caption edit's Draft too", () =>
    withLive(async (jedi, guard, mem) => {
      const shown = jedi.selectedCaption()!.id;
      jedi.captionOwner.edit.setOpen(true);
      guard.report(Symbol("caption edit"), true, jedi.captionOwner.edit.draftScope);
      captionListForPostMock.mockImplementation((postId: number) =>
        Promise.resolve(captionsFor(postId).filter((c) => c.id !== shown)),
      );
      mem.emit(pokeOn(Channel.postCaption(1)));
      await settle();
      expect(guard.notice()).toBe("This Caption was deleted. Your unsaved changes were discarded.");
      expect(guard.hasDraft()).toBe(false);
    }));
});

describe("createJediFeed — a Draft outside the Post, such as the New Post Draft (#214)", () => {
  // Category index 3 is Animals: Posts 1 and 3, in that rank.
  const ANIMALS = 3;
  const POST_DELETED = "This Post was deleted. Your unsaved changes were discarded.";
  // The New Post Draft has no scope.
  const newPost = Symbol("new post");
  const postScopes = (jedi: JediFeed) => [
    jedi.postOwner.edit.draftScope,
    jedi.captionOwner.edit.draftScope,
    jedi.addCaptionScope,
    jedi.postComments.draftScope,
    jedi.captionComments.draftScope,
  ];
  // The Post's two Comments panels: one opens at a time (#210).
  const PANELS = ["postComments", "captionComments"] as const;
  // Open the Post edit and one Comments panel, as the Post's own forms.
  const openPostForms = (jedi: JediFeed, panel: (typeof PANELS)[number]) => {
    jedi.postOwner.edit.setOpen(true);
    jedi[panel].setOpen(true);
    expect(jedi[panel].open(), "the panel opens").toBe(true);
  };
  const expectPostFormsClosed = (jedi: JediFeed, guard: DraftGuard) => {
    expect(jedi.postOwner.edit.open(), "the Post edit closes").toBe(false);
    expect(jedi.postComments.open(), "the Comments panel closes").toBe(false);
    expect(jedi.captionComments.open(), "the Caption Comments panel closes").toBe(false);
    expect(guard.hasDraftIn(postScopes(jedi)), "no Draft in the Post's scopes").toBe(false);
  };
  const withoutPost1 = () => postListMock.mockResolvedValue(RANKED_POSTS.slice(1));

  it("does not hold the Post: a re-rank moves the article", () =>
    withLive(async (jedi, guard, mem) => {
      guard.report(newPost, true);
      const [first, second, ...rest] = RANKED_POSTS;
      postListMock.mockResolvedValue([second, first, ...rest]);
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(jedi.selectedPost()?.id).toBe(3);
      expect(guard.holds(newPost)).toBe(true);
    }));

  it.each(PANELS)(
    "a Post change does not ask about it, and still closes the Post's forms (%s)",
    (panel) =>
      withLive(async (jedi, guard) => {
        guard.report(newPost, true);
        openPostForms(jedi, panel);
        jedi.selectPost(2);
        expect(guard.pending()).toBe(false);
        expect(jedi.selectedPost()?.id).toBe(2);
        expect(guard.holds(newPost)).toBe(true);
        expectPostFormsClosed(jedi, guard);
      }),
  );

  it.each(PANELS)(
    "another User's Post delete does not drop it, shows no notice, and closes the Post's forms (%s)",
    (panel) =>
      withLive(async (jedi, guard, mem) => {
        guard.report(newPost, true);
        jedi[panel].setOpen(true);
        expect(jedi[panel].open(), "the panel opens").toBe(true);
        withoutPost1();
        mem.emit(pokeOn(Channel.posts));
        await settle();
        expect(guard.notice()).toBeUndefined();
        expect(jedi.announcement()).toBe("This Post was deleted.");
        expect(guard.holds(newPost)).toBe(true);
        expectPostFormsClosed(jedi, guard);
      }),
  );

  it("with a Draft on the Post too, a Post delete discards only the Post's Draft", () =>
    withLive(async (jedi, guard, mem) => {
      guard.report(newPost, true);
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      withoutPost1();
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.notice()).toBe(POST_DELETED);
      expect(guard.holds(newPost)).toBe(true);
      expectPostFormsClosed(jedi, guard);
    }));

  it("a Category leave does not ask about it; Discard of the Post's Draft keeps it", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      guard.report(newPost, true);
      jedi.postOwner.edit.setOpen(true);
      guard.report(Symbol("post edit"), true, jedi.postOwner.edit.draftScope);
      jedi.postComments.setOpen(true);
      postListMock.mockResolvedValue(
        RANKED_POSTS.map((p) => (p.id === 1 ? { ...p, categories: [CAT[1]] } : p)),
      );
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.pending()).toBe(true);

      guard.confirmMove();
      await settle();
      expect(jedi.selectedPost()?.id, "the article moves").toBe(3);
      expect(guard.holds(newPost)).toBe(true);
      expectPostFormsClosed(jedi, guard);
    }));

  it("with only this Draft, a Category leave moves the article with no question", () =>
    withLive(async (jedi, guard, mem) => {
      jedi.setSelectedCategory(ANIMALS);
      guard.report(newPost, true);
      jedi.postComments.setOpen(true);
      postListMock.mockResolvedValue(
        RANKED_POSTS.map((p) => (p.id === 1 ? { ...p, categories: [CAT[1]] } : p)),
      );
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.pending()).toBe(false);
      expect(jedi.selectedPost()?.id).toBe(3);
      expect(guard.holds(newPost)).toBe(true);
      expectPostFormsClosed(jedi, guard);
    }));

  it("the Owner's own Post delete keeps it, and the delete question shows no Draft line for it", () =>
    withLive(async (jedi, guard) => {
      guard.report(newPost, true);
      expect(jedi.postOwner.removeDiscardsDraft()).toBe(false);
      guard.report(Symbol("comment"), true, jedi.postComments.draftScope);
      expect(jedi.postOwner.removeDiscardsDraft()).toBe(true);
      withoutPost1();

      await jedi.postOwner.remove(1);
      await settle();
      expect(guard.holds(newPost)).toBe(true);
      expect(guard.notice()).toBeUndefined();
      expectPostFormsClosed(jedi, guard);
    }));

  it("the Add Caption Draft is in its own scope: a Post change asks, and a Post delete discards it", () =>
    withLive(async (jedi, guard, mem) => {
      const addCaption = Symbol("add caption");
      guard.report(addCaption, true, jedi.addCaptionScope);
      expect(guard.hasDraftIn([jedi.addCaptionScope])).toBe(true);
      jedi.selectPost(2);
      expect(guard.pending()).toBe(true);
      guard.cancelMove();

      withoutPost1();
      mem.emit(pokeOn(Channel.posts));
      await settle();
      expect(guard.notice()).toBe(POST_DELETED);
      expect(guard.holds(addCaption)).toBe(false);
    }));
});

describe("createJediFeed — the selected Post's like state (#122)", () => {
  const like = (postId: number, likeCount: number, liked: boolean): Like => ({
    id: postId,
    likeCount,
    liked,
  });

  it("has no like state on the anonymous landing (no feed connected)", () =>
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedPostLike()).toBeUndefined();
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
    withAnonymousJedi(async (jedi) => {
      await jedi.togglePostLike();
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
      const jedi = createJediFeed({ api });
      jedi.connectFeed(mem.feed);
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
    withAnonymousJedi((jedi) => {
      expect(jedi.selectedCaptionLike()).toBeUndefined();
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
