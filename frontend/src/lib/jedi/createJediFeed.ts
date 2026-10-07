import {
  createEffect,
  createResource,
  createSignal,
  on,
  onCleanup,
  type Accessor,
  type Setter,
} from "solid-js";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";
import { createLikeState } from "~/lib/jedi/createLikeState";
import { type MessageFeedFactory } from "~/lib/websocket";
import { Channel } from "~/lib/channel";
import type { JediCategory, Like, PostView, CaptionView, HeroView } from "~/types/jedi";

/**
 * The Jedi feed's view-model: it owns the route's four data resources and the
 * derivations over them, exposing a small accessor interface. The route reads
 * these accessors and renders — no data orchestration in the markup — so the
 * derivations are exercisable at this seam without rendering the DOM, the same
 * way `jedi-api` is tested through its interface.
 *
 * `selectedCategory` is an index into `categories()`, whose row 0 is the
 * synthetic "All" filter row (#33-b). `visiblePosts` filters `posts` behind it;
 * the Top Photos card renders whatever it is handed and stays presentational.
 *
 * `selectedPost` is the post shown in the main article (#29): it defaults to the
 * top-ranked *visible* post and follows `selectPost(id)` when a Top Photo is
 * clicked, so a category filter that hides the selection moves the article to a
 * post the sidebar actually lists. `topCaptions` re-keys off it, so the
 * captions and the rest of the article's metadata track the selection.
 *
 * `selectedCaption` is the caption shown under the post (#33): it defaults to
 * the `winningCaption` and follows `selectCaption(id)`. Like `selectedPost` it
 * self-resets — the old caption's id is absent from the new post's captions, so
 * it falls back to that post's winner.
 *
 * `selectedPostLike` / `selectedCaptionLike` are the viewer's like state of the
 * selected Post and the selected Caption (#122, #123). Each comes from one
 * `createLikeState`; this view-model keeps the Feed wiring around them.
 *
 * `hero` (the header banner content) is the externalized header data (#32): the
 * route renders the Hero from `hero`, so it is not hard-coded in the markup. The
 * nav avatar's profile now lives in the global Nav, not here (see ADR-0007).
 */
export interface JediFeed {
  /** The real categories behind an "All" row at index 0 (`selectedCategory`). */
  categories: Accessor<JediCategory[] | undefined>;
  /** The ranked posts filtered to `selectedCategory` — what Top Photos renders (#33-b). */
  visiblePosts: Accessor<PostView[] | undefined>;
  /** The selected category's name when its filter matches no posts, so `<main>`
   *  can show a "No Posts in …" panel; undefined when posts exist or are loading. */
  emptyCategoryLabel: Accessor<string | undefined>;
  selectedPost: Accessor<PostView | undefined>;
  selectPost: (id: number) => void;
  /** What Top Captions renders: the selected post's captions, or empty when no
   *  post is selected (an empty category), so the card clears with `<main>`. */
  visibleCaptions: Accessor<CaptionView[] | undefined>;
  selectedCaption: Accessor<CaptionView | undefined>;
  selectCaption: (id: number) => void;
  selectedCategory: Accessor<number>;
  setSelectedCategory: Setter<number>;
  hero: Accessor<HeroView | undefined>;
  /** The viewer's like state of the selected Post (#122): the live count and
   *  whether the viewer likes it. Undefined while loading, and on the anonymous
   *  landing, where no live session is connected (the read needs a login). */
  selectedPostLike: Accessor<Like | undefined>;
  /** Like or unlike the selected Post: the opposite of the like state shown
   *  (#122). The change shows at once, then the back-end's answer replaces it;
   *  a click while a toggle runs counts too. A no-op without a like state.
   *  Rejects, and rolls the Like back, when the back-end fails. */
  togglePostLike: () => Promise<void>;
  /** The viewer's like state of the selected Caption (#123), as
   *  `selectedPostLike` is for the Post. */
  selectedCaptionLike: Accessor<Like | undefined>;
  /** Like or unlike the selected Caption (#123), as `togglePostLike`. The
   *  Caption line shows the new count at once; Top Captions re-ranks after the
   *  back-end's `post_caption` poke. */
  toggleCaptionLike: () => Promise<void>;
  /** Wire a live Feed after creation (#120): the route builds this view-model
   *  anonymously, then connects the socket's Feed once a User logs in. The
   *  subscription is owned by the caller's reactive scope, so it ends with it. */
  connectFeed: (feed: MessageFeedFactory) => void;
}

/** The synthetic "no filter" row. Id 0 is unused by the real categories. */
const ALL_CATEGORIES: JediCategory = { id: 0, name: "All", icon: "menu" };

/** Injectable seams for the view-model. */
export interface CreateJediFeedDeps {
  /**
   * The Jedi data seam. Defaults to the `jediApi` singleton (the real back-end);
   * a test injects an in-memory `JediApi` — the same inject-or-default idiom as
   * `feed` below (arch-review C2, #119).
   */
  api?: JediApi;
  /**
   * The live **Feed** (`CONTEXT.md`). When present, a `posts` poke refetches the
   * ranked Post list and the featured Post (#117), and a `post_caption` poke for
   * the selected Post refetches its Top Captions (#121), a `post_like` poke for
   * the selected Post refetches its like state (#122), and a `caption_like` poke
   * for the selected Caption refetches its like state (#123) — a poke carries no row,
   * so the refetch re-reads through the scoped public RPC. Absent on the
   * anonymous landing page, whose WebSocket needs auth; the initial fetch still
   * renders.
   */
  feed?: MessageFeedFactory;
}

export function createJediFeed(deps: CreateJediFeedDeps = {}): JediFeed {
  const api = deps.api ?? jediApi;
  const [selectedCategory, setSelectedCategory] = createSignal(0);
  const [selectedPostId, setSelectedPostId] = createSignal<number | undefined>();
  const [selectedCaptionId, setSelectedCaptionId] = createSignal<number | undefined>();

  const [realCategories] = createResource(() => api.categories.list());
  const [postsResource, { refetch: refetchPosts }] = createResource(() => api.posts.list());
  // The first load reads `postsResource()`, so the route's <Suspense> (and SSR)
  // waits for the Posts. After that, read `.latest`: a refetch (a `posts` poke,
  // e.g. a Post Like) must not suspend again, or the app's <Suspense> swaps the
  // whole route for its fallback, which looks like a page reload (#123).
  const posts = (): PostView[] | undefined => postsResource.latest ?? postsResource();
  // The featured post IS the ranked list's first element, so it is derived, not a
  // second fetch (`list_posts` is already ranked by the back-end). It is the
  // loading fallback for `selectedPost` below.
  const featured = (): PostView | undefined => posts()?.[0];

  // Live propagation (#117): a `posts` poke means the Post list may have changed,
  // so refetch the list (the featured post re-derives from it). A `post_caption`
  // poke means one Post's Captions changed (#121); only the selected Post's feed
  // is held, and its poke refetches Top Captions. A `post_like` poke means one
  // Post's like count changed (#122); the selected Post's like feed is held the
  // same way, and its poke refetches the like state. A `caption_like` poke means
  // one Caption's like count changed (#123); the selected Caption's like feed is
  // held, and moved, the same way. The feed is optional — the
  // anonymous landing page has no socket — so this wiring runs when injected, or
  // later through `connectFeed` on login (#120). It reads `selectedPost` and
  // `topCaptions` below, so it is invoked only after they are defined.
  const connectFeed = (factory: MessageFeedFactory): void => {
    // A connected Feed means a logged-in User, so the viewer's like state can
    // load now; it ends with the caller's scope (logout), like the socket. A
    // logout also drops the wanted Likes (`createLikeState`), so a queued send
    // stops after the request in flight and never goes out with the next User's
    // cookie (#122 review).
    setLive(true);
    onCleanup(() => setLive(false));
    const feed = factory({
      onPostsUpdate: () => void refetchPosts(),
      onPostCaptionUpdate: (postId) => {
        if (postId === selectedPost()?.id) void refetchCaptions();
      },
      onPostLikeUpdate: (postId) => {
        if (postId === selectedPost()?.id) postLike.refetch();
      },
      onCaptionLikeUpdate: (captionId) => {
        if (captionId === selectedCaption()?.id) captionLike.refetch();
      },
    });
    feed.subscribe(Channel.posts);
    // Hold the selected Post's Caption and like feeds; move them when the
    // selection moves.
    createEffect(
      on(
        () => selectedPost()?.id,
        (postId, prevId) => {
          if (postId === prevId) return;
          if (prevId !== undefined) {
            feed.unsubscribe(Channel.postCaption(prevId));
            feed.unsubscribe(Channel.postLike(prevId));
          }
          if (postId !== undefined) {
            feed.subscribe(Channel.postCaption(postId));
            feed.subscribe(Channel.postLike(postId));
          }
        },
      ),
    );
    // Hold the selected Caption's like feed; move it when the selection moves.
    createEffect(
      on(
        () => selectedCaption()?.id,
        (captionId, prevId) => {
          if (captionId === prevId) return;
          if (prevId !== undefined) feed.unsubscribe(Channel.captionLike(prevId));
          if (captionId !== undefined) feed.subscribe(Channel.captionLike(captionId));
        },
      ),
    );
    // A poke sent while the socket is down is lost, and a (re)connect only
    // replays the subscription. So each time the socket comes up, refetch: a
    // Post, Caption, or Like created meanwhile still appears (#120 review).
    createEffect(
      on(
        feed.connected,
        (connected) => {
          if (!connected) return;
          void refetchPosts();
          void refetchCaptions();
          postLike.refetch();
          captionLike.refetch();
        },
        { defer: true },
      ),
    );
  };

  const categories = (): JediCategory[] | undefined => {
    const list = realCategories();
    return list && [ALL_CATEGORIES, ...list];
  };

  // Filtering happens here so the Top Photos card stays presentational. Ranking
  // is inherited from `posts` — filter preserves order.
  const visiblePosts = (): PostView[] | undefined => {
    const all = posts();
    const category = categories()?.[selectedCategory()];
    if (!all || !category || category.id === ALL_CATEGORIES.id) return all;
    return all.filter((p) => p.categories.some((c) => c.id === category.id));
  };

  // The clicked post, but only while the filter still lists it; otherwise the
  // top-ranked visible post. `visible === undefined` is the loading state (fall
  // back to `featured`); an empty array is a real category with no posts, which
  // stays undefined so `<main>` can show the empty panel instead of a stale post.
  const selectedPost = (): PostView | undefined => {
    const visible = visiblePosts();
    if (visible === undefined) return featured();
    const id = selectedPostId();
    return visible.find((p) => p.id === id) ?? visible[0];
  };

  // Truthy only when a real (non-"All") category filters every post away.
  const emptyCategoryLabel = (): string | undefined => {
    if (visiblePosts()?.length !== 0) return undefined;
    const category = categories()?.[selectedCategory()];
    return category && category.id !== ALL_CATEGORIES.id ? category.name : undefined;
  };
  const selectPost = (id: number): void => {
    setSelectedPostId(id);
  };

  // Each result carries the Post id it was fetched for, so even an empty list
  // belongs to one Post (#185 review).
  const [topCaptions, { refetch: refetchCaptions }] = createResource(
    () => selectedPost()?.id,
    async (postId) => ({ postId, captions: await api.captions.listForPost(postId) }),
  );
  // Read `.latest`, not `topCaptions()`: a suspending read here re-triggered
  // Suspense on every post re-key, reconciling the route subtree and blurring
  // the focused sidebar listbox to <body> (#35). `.latest` is non-suspending, but
  // during a refetch it still holds the PREVIOUS post's captions — for the whole
  // network round trip (#118). So only captions of the selected post count; while
  // the new post's captions load, there are none (`undefined`), never stale ones.
  // Match on the result's Post id, not on each caption's: `[].every(...)` is
  // true, so the last post's empty list would pass as this post's "none".
  const selectedPostCaptions = (): CaptionView[] | undefined => {
    const result = topCaptions.latest;
    return result?.postId === selectedPost()?.id ? result?.captions : undefined;
  };
  const winningCaption = () => selectedPostCaptions()?.[0];

  // `[]` when no post is selected (empty category) so Top Captions clears: the
  // empty branch, not the resource, drives that clear.
  const visibleCaptions = (): CaptionView[] | undefined =>
    selectedPost() ? selectedPostCaptions() : [];

  // Self-resets on a post change: the old id is absent from the new captions.
  const selectedCaption = (): CaptionView | undefined =>
    selectedPostCaptions()?.find((c) => c.id === selectedCaptionId()) ?? winningCaption();
  const selectCaption = (id: number): void => {
    setSelectedCaptionId(id);
  };

  // The viewer's like state of the selected Post (#122) and of the selected
  // Caption (#123). The read needs a login, so each loads only while a live
  // session is connected.
  const [live, setLive] = createSignal(false);
  const postLike = createLikeState({
    selectedId: () => selectedPost()?.id,
    live,
    getLike: (id) => api.posts.getLike(id),
    toggleLike: (id, liked) => api.posts.toggleLike(id, liked),
  });
  const captionLike = createLikeState({
    selectedId: () => selectedCaption()?.id,
    live,
    getLike: (id) => api.captions.getLike(id),
    toggleLike: (id, liked) => api.captions.toggleLike(id, liked),
  });

  const [hero] = createResource(() => api.hero.get());

  if (deps.feed) connectFeed(deps.feed);

  return {
    categories,
    visiblePosts,
    emptyCategoryLabel,
    selectedPost,
    selectPost,
    visibleCaptions,
    selectedCaption,
    selectCaption,
    selectedCategory,
    setSelectedCategory,
    hero,
    selectedPostLike: postLike.like,
    togglePostLike: postLike.toggle,
    selectedCaptionLike: captionLike.like,
    toggleCaptionLike: captionLike.toggle,
    connectFeed,
  };
}
