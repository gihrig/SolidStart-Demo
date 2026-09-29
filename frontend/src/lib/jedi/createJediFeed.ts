import {
  createEffect,
  createResource,
  createSignal,
  on,
  type Accessor,
  type Setter,
} from "solid-js";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";
import { type MessageFeedFactory } from "~/lib/websocket";
import { Channel } from "~/lib/channel";
import type { JediCategory, PostView, CaptionView, HeroView } from "~/types/jedi";

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
   * ranked Post list and the featured Post (#117) — the poke carries no row, so
   * the refetch re-reads through the scoped public RPC. Absent on the anonymous
   * landing page, whose WebSocket needs auth; the initial fetch still renders.
   */
  feed?: MessageFeedFactory;
}

export function createJediFeed(deps: CreateJediFeedDeps = {}): JediFeed {
  const api = deps.api ?? jediApi;
  const [selectedCategory, setSelectedCategory] = createSignal(0);
  const [selectedPostId, setSelectedPostId] = createSignal<number | undefined>();
  const [selectedCaptionId, setSelectedCaptionId] = createSignal<number | undefined>();

  const [realCategories] = createResource(() => api.categories.list());
  const [posts, { refetch: refetchPosts }] = createResource(() => api.posts.list());
  // The featured post IS the ranked list's first element, so it is derived, not a
  // second fetch (`list_posts` is already ranked by the back-end). It is the
  // loading fallback for `selectedPost` below.
  const featured = (): PostView | undefined => posts()?.[0];

  // Live propagation (#117): a `posts` poke means the Post list may have changed,
  // so refetch the list (the featured post re-derives from it). The feed is
  // optional — the anonymous landing page has no socket — so this wiring runs
  // when injected, or later through `connectFeed` on login (#120).
  const connectFeed = (factory: MessageFeedFactory): void => {
    const feed = factory({
      onPostsUpdate: () => void refetchPosts(),
    });
    feed.subscribe(Channel.posts);
    // A poke sent while the socket is down is lost, and a (re)connect only
    // replays the subscription. So each time the socket comes up, refetch: a
    // Post created meanwhile still appears (#120 review).
    createEffect(
      on(
        feed.connected,
        (connected) => {
          if (connected) void refetchPosts();
        },
        { defer: true },
      ),
    );
  };
  if (deps.feed) connectFeed(deps.feed);

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

  const [topCaptions] = createResource(
    () => selectedPost()?.id,
    (postId) => api.captions.listForPost(postId),
  );
  // Read `.latest`, not `topCaptions()`: a suspending read here re-triggered
  // Suspense on every post re-key, reconciling the route subtree and blurring
  // the focused sidebar listbox to <body> (#35). `.latest` is non-suspending, but
  // during a refetch it still holds the PREVIOUS post's captions — for the whole
  // network round trip (#118). So only captions of the selected post count; while
  // the new post's captions load, there are none (`undefined`), never stale ones.
  const selectedPostCaptions = (): CaptionView[] | undefined => {
    const captions = topCaptions.latest;
    const postId = selectedPost()?.id;
    return captions?.every((c) => c.postId === postId) ? captions : undefined;
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

  const [hero] = createResource(() => api.hero.get());

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
    connectFeed,
  };
}
