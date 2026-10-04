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
import { type MessageFeedFactory } from "~/lib/websocket";
import { Channel } from "~/lib/channel";
import type { JediCategory, PostLike, PostView, CaptionView, HeroView } from "~/types/jedi";

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
  /** The viewer's like state of the selected Post (#122): the live count and
   *  whether the viewer likes it. Undefined while loading, and on the anonymous
   *  landing, where no live session is connected (the read needs a login). */
  selectedPostLike: Accessor<PostLike | undefined>;
  /** Like or unlike the selected Post: the opposite of the like state shown
   *  (#122). The change shows at once, then the back-end's answer replaces it;
   *  a click while a toggle runs counts too. A no-op without a like state.
   *  Rejects, and rolls the Like back, when the back-end fails. */
  toggleLike: () => Promise<void>;
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
   * the selected Post refetches its Top Captions (#121), and a `post_like` poke
   * for the selected Post refetches its like state (#122) — a poke carries no row,
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
  const [posts, { refetch: refetchPosts }] = createResource(() => api.posts.list());
  // The featured post IS the ranked list's first element, so it is derived, not a
  // second fetch (`list_posts` is already ranked by the back-end). It is the
  // loading fallback for `selectedPost` below.
  const featured = (): PostView | undefined => posts()?.[0];

  // Live propagation (#117): a `posts` poke means the Post list may have changed,
  // so refetch the list (the featured post re-derives from it). A `post_caption`
  // poke means one Post's Captions changed (#121); only the selected Post's feed
  // is held, and its poke refetches Top Captions. A `post_like` poke means one
  // Post's like count changed (#122); the selected Post's like feed is held the
  // same way, and its poke refetches the like state. The feed is optional — the
  // anonymous landing page has no socket — so this wiring runs when injected, or
  // later through `connectFeed` on login (#120). It reads `selectedPost` and
  // `topCaptions` below, so it is invoked only after they are defined.
  const connectFeed = (factory: MessageFeedFactory): void => {
    // A connected Feed means a logged-in User, so the viewer's like state can
    // load now; it ends with the caller's scope (logout), like the socket.
    setLive(true);
    onCleanup(() => setLive(false));
    const feed = factory({
      onPostsUpdate: () => void refetchPosts(),
      onPostCaptionUpdate: (postId) => {
        if (postId === selectedPost()?.id) void refetchCaptions();
      },
      onPostLikeUpdate: (postId) => {
        if (postId === selectedPost()?.id) void refetchLike();
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
          void refetchLike();
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

  // The viewer's like state (#122). The read needs a login, so it loads only
  // while a live session is connected, and re-keys with the selected Post.
  const [live, setLive] = createSignal(false);
  const [postLike, { refetch: refetchLike, mutate: setPostLike }] = createResource(
    () => (live() ? selectedPost()?.id : undefined),
    (postId) => api.posts.getLike(postId),
  );
  // Like `selectedPostCaptions`: `.latest` is non-suspending, so match on the
  // result's Post id, and never show a previous Post's like state.
  const serverLike = (): PostLike | undefined => {
    const result = postLike.latest;
    return live() && result?.postId === selectedPost()?.id ? result : undefined;
  };

  // The viewer's latest wanted like state of each Post that the back-end has
  // not confirmed yet (Post id -> liked). A click sets it, so the Like shows at
  // once. One entry per Post, so moving to another Post mid-toggle loses no click.
  const [pendingLikes, setPendingLikes] = createSignal<ReadonlyMap<number, boolean>>(new Map());

  // What the viewer sees: the server state with the wanted state laid over it.
  // The count moves by one from the server count. A read that lands while a
  // toggle runs updates only the server layer, so it cannot undo the click.
  const selectedPostLike = (): PostLike | undefined => {
    const server = serverLike();
    const liked = server && pendingLikes().get(server.postId);
    if (!server || liked === undefined || liked === server.liked) return server;
    return {
      postId: server.postId,
      likeCount: server.likeCount + (liked ? 1 : -1),
      liked,
    };
  };

  // One send runs at a time. It sends each Post's wanted state until the
  // back-end's answer matches the newest one, so fast clicks end in the last
  // wanted state, sent in order. The toggle sends the wanted state, not a flip,
  // so a repeat is a no-op on the back-end.
  let sending: Promise<void> | undefined;
  const sendPendingLikes = async (): Promise<void> => {
    const confirmed = new Map<number, PostLike>();
    const unconfirmed = () =>
      [...pendingLikes()].find(([postId, liked]) => confirmed.get(postId)?.liked !== liked);
    try {
      for (let next = unconfirmed(); next; next = unconfirmed()) {
        const [postId, liked] = next;
        confirmed.set(postId, await api.posts.toggleLike(postId, liked));
      }
      // Show the selected Post's answer; another Post's answer must not replace
      // the selected Post's like state.
      const result = confirmed.get(selectedPost()?.id ?? Number.NaN);
      if (result) setPostLike(result);
    } finally {
      // Confirmed or failed, drop the wanted states: a failure rolls back to the
      // server state. Then reread. The reread is the latest fetch, so Solid
      // ignores an older read still in flight, which would otherwise land last
      // and show the state from before the click (#122 review).
      setPendingLikes(new Map());
      sending = undefined;
      void refetchLike();
    }
  };
  // Every caller awaits the running send, so each one sees its failure.
  const toggleLike = (): Promise<void> => {
    const current = selectedPostLike();
    if (!current) return Promise.resolve();
    setPendingLikes((wanted) => new Map(wanted).set(current.postId, !current.liked));
    sending ??= sendPendingLikes();
    return sending;
  };

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
    selectedPostLike,
    toggleLike,
    connectFeed,
  };
}
