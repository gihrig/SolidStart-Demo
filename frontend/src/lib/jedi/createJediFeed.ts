import { batch, createResource, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import { passThroughGuard, type DraftGuard, type DraftScope } from "~/lib/createDraftGuard";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";
import { createLikeState } from "~/lib/jedi/createLikeState";
import {
  CAPTION_COMMENT_EVENTS,
  createCommentThread,
  POST_COMMENT_EVENTS,
  type CommentThreadState,
} from "~/lib/jedi/createCommentThread";
import { createSelection, type SelectionState } from "~/lib/jedi/createSelection";
import type { Feed } from "~/lib/feed";
import { Channel } from "~/lib/channel";
import type {
  JediCategory,
  Like,
  PostChanges,
  PostView,
  CaptionView,
  HeroView,
} from "~/types/jedi";
import type { OwnerWrites } from "~/lib/jedi/createSelection";

export type { EditState, OwnerWrites } from "~/lib/jedi/createSelection";

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
 * `selectedPost` is the Post shown in the main article (#29), and
 * `selectedCaption` the Caption shown under it (#33). One `createSelection`
 * owns both (#271): the picks, the Post hold, the Caption hold, the guarded
 * moves, the change causes (#187), the Owner's writes (`postOwner`,
 * `captionOwner`), the Draft scopes and the live region (`announcement`).
 * This view-model keeps the Posts resource, whose load runs the selection's
 * cause check before the view sees the new list.
 *
 * `selectedPostLike` / `selectedCaptionLike` are the viewer's like state of the
 * selected Post and the selected Caption (#122, #123). Each comes from one
 * `createLikeState`; this view-model keeps the Feed wiring around them.
 *
 * `postComments` is the selected Post's Comment thread (#124), and
 * `captionComments` the shown Caption's (#127). Each is one
 * `createCommentThread`, exposed as one nested member, with its own open state,
 * Draft scope and Subscription; this view-model keeps the Feed wiring around
 * them. One of the two is open at a time (#210).
 *
 * A close of a Comments panel, by its toggle or by an open of the other panel
 * (#210), goes through the app's Draft guard (ADR-0030): with a Draft, it waits
 * for the confirm dialog.
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
  /** Select a Post (a Top Photo click). A change of the selected Post goes
   *  through the Draft guard. */
  selectPost: (id: number) => void;
  /** What Top Captions renders: the selected post's captions, or empty when no
   *  post is selected (an empty category), so the card clears with `<main>`. */
  visibleCaptions: Accessor<CaptionView[] | undefined>;
  selectedCaption: Accessor<CaptionView | undefined>;
  /** Select a Caption (a Top Captions click). A change of the Caption shown
   *  closes its Comments panel and its edit, so it goes through the Draft
   *  guard, in the Caption scope (#127, #271). */
  selectCaption: (id: number) => void;
  selectedCategory: Accessor<number>;
  /** Select a category by index. A change that changes the selected Post goes
   *  through the Draft guard; one that keeps it does not. */
  setSelectedCategory: (index: number) => void;
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
   *  Caption actions show the new count at once; Top Captions re-ranks after
   *  the back-end's `post_caption` poke. */
  toggleCaptionLike: () => Promise<void>;
  /** The selected Post's Comment thread (#124): the panel's open state, its
   *  rows and its writes. It loads only while the panel is open. The read is
   *  public, so it loads on the anonymous landing too; the writes need a login.
   *  A close goes through the Draft guard. An open closes the other thread,
   *  in that thread's scope (#210), in one step. While its panel is open, it
   *  starts a Post hold (#271). */
  postComments: CommentThreadState;
  /** The shown Caption's Comment thread (#127), as `postComments` is for the
   *  Post. While its panel is open, it starts a Caption hold and a Post hold. */
  captionComments: CommentThreadState;
  /** The Owner's writes on the shown Post (#187). The edit is the Edit
   *  dialog. When a save's Categories drop the selected one, the filter
   *  switches to "All" when the save is sent, so the Post stays shown. A
   *  delete releases every Draft on the Post. */
  postOwner: OwnerWrites<PostChanges>;
  /** The Owner's writes on the shown Caption (#187). The edit is the form in
   *  the Caption line. A save rejects for a Caption that got a Like. A delete
   *  releases every Draft on the Caption: its edit's and its Comments panel's
   *  (#271). */
  captionOwner: OwnerWrites<string>;
  /** The scopes of the Post shown and of the Caption shown (ADR-0030). */
  draftScopes: { post: DraftScope; caption: DraftScope };
  /** The message of the route's polite live region (#187): the result of the
   *  Owner's own delete, or a delete by another User that discarded no Draft.
   *  Empty until the first message. */
  announcement: Accessor<string>;
  /** Wire a live Feed after creation (#120): the route builds this view-model
   *  anonymously, then connects the socket's Feed once a User logs in. The
   *  subscription is owned by the caller's reactive scope, so it ends with it. */
  connectFeed: (feed: Feed) => void;
}

/** The synthetic "no filter" row. Id 0 is unused by the real categories. */
const ALL_CATEGORIES: JediCategory = { id: 0, name: "All", icon: "menu" };

/** Injectable seam for the view-model. */
export interface CreateJediFeedDeps {
  /**
   * The Jedi data seam. Defaults to the `jediApi` singleton (the real back-end);
   * a test injects an in-memory `JediApi` (arch-review C2, #119). The live Feed
   * is not a dep: the route connects it through `connectFeed` on login (#120).
   */
  api?: JediApi;
  /** The app's Draft guard (`useDraftGuard()`, ADR-0030). Defaults to the
   *  pass-through guard, which runs each move at once. */
  guard?: DraftGuard;
}

export function createJediFeed(deps: CreateJediFeedDeps = {}): JediFeed {
  const api = deps.api ?? jediApi;
  const guard = deps.guard ?? passThroughGuard;
  const [selectedCategory, setSelectedCategoryIndex] = createSignal(0);

  const [realCategories] = createResource(() => api.categories.list());
  // Each load finds the cause of a change before the view sees the new list:
  // a form that the change unmounts then holds no Draft (#187). Only in the
  // browser: an Event reaches no server render, and on the server a read after
  // the `await` can meet another request's render context. The check runs
  // after the `await`, so `selection` below exists by then.
  const [postsResource, { refetch: refetchPosts }] = createResource(async () => {
    const list = await api.posts.list();
    if (!isServer) untrack(() => selection.checkPosts(list));
    return list;
  });
  // The first load reads `postsResource()`, so the route's <Suspense> (and SSR)
  // waits for the Posts. After that, read `.latest`: a refetch (a `posts` poke,
  // e.g. a Post Like) must not suspend again, or the app's <Suspense> swaps the
  // whole route for its fallback, which looks like a page reload (#123).
  const posts = (): PostView[] | undefined => postsResource.latest ?? postsResource();

  const categories = (): JediCategory[] | undefined => {
    const list = realCategories();
    return list && [ALL_CATEGORIES, ...list];
  };
  // The real Category that filters the Posts at `categoryIndex`, by default
  // the selected one. Undefined for "All", and while the Categories load.
  const filterCategory = (categoryIndex = selectedCategory()): JediCategory | undefined => {
    const category = categories()?.[categoryIndex];
    return category?.id === ALL_CATEGORIES.id ? undefined : category;
  };

  // Filtering happens here so the Top Photos card stays presentational. Ranking
  // is inherited from `posts` — filter preserves order. It takes the category
  // index, so a category change can check the Post it would select.
  const visiblePostsIn = (categoryIndex: number): PostView[] | undefined => {
    const all = posts();
    const category = filterCategory(categoryIndex);
    if (!all || !category) return all;
    return all.filter((p) => p.categories.some((c) => c.id === category.id));
  };
  const visiblePosts = () => visiblePostsIn(selectedCategory());

  // The Post and the Caption shown, with the Post hold, the Caption hold and
  // the Owner's writes (#271).
  const selection: SelectionState = createSelection({
    posts,
    visiblePostsIn,
    filterCategory,
    categoryIndex: selectedCategory,
    setCategoryIndex: setSelectedCategoryIndex,
    refetchPosts: () => void refetchPosts(),
    calls: {
      listCaptions: (postId) => api.captions.listForPost(postId),
      updatePost: (id, changes) => api.posts.update(id, changes),
      removePost: (id) => api.posts.remove(id),
      updateCaption: (id, text) => api.captions.update(id, text),
      removeCaption: (id) => api.captions.remove(id),
    },
    guard,
  });
  const { selectedPost, selectedCaption } = selection;

  // Truthy only when a real (non-"All") category filters every post away. A
  // held Post that an Event moved out of the filter still shows: the empty
  // panel would unmount the forms on it (PR #216 review).
  const emptyCategoryLabel = (): string | undefined => {
    if (visiblePosts()?.length !== 0 || selectedPost()) return undefined;
    return filterCategory()?.name;
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

  // The selected Post's Comment thread (#124). It loads while its panel is
  // open; the read is public, so it does not wait for a live session. Its
  // close goes through the guard. Its scope sits under the Post scope.
  const { thread: postThread, onEvent: onPostCommentEvent } = createCommentThread({
    parentId: () => selectedPost()?.id,
    api: api.comments,
    events: POST_COMMENT_EVENTS,
    openOn: selection.threadOpenOn.post,
    guard,
    parentScope: selection.draftScopes.post,
  });
  // The shown Caption's Comment thread (#127), the same way, under the
  // Caption scope.
  const { thread: captionThread, onEvent: onCaptionCommentEvent } = createCommentThread({
    parentId: () => selectedCaption()?.id,
    api: api.captionComments,
    events: CAPTION_COMMENT_EVENTS,
    openOn: selection.threadOpenOn.caption,
    guard,
    parentScope: selection.draftScopes.caption,
  });
  // One Comments panel at a time (#210). An open of one thread closes the
  // other, a guarded move in the other thread's scope. In the move, that close
  // runs at once: the attempt checked the same scope. The switch is one step
  // (#271): no panel is closed between the two, so the Post hold stays. The
  // open comes first, as it reads the subject shown, which the Post hold keeps.
  const openAlone = (
    thread: CommentThreadState,
    other: CommentThreadState,
  ): CommentThreadState => ({
    ...thread,
    setOpen: (open) => {
      if (!open || !other.open()) thread.setOpen(open);
      else
        guard.attempt(
          () =>
            batch(() => {
              thread.setOpen(true);
              other.setOpen(false);
            }),
          other.draftScope,
        );
    },
  });
  const postComments = openAlone(postThread, captionThread);
  const captionComments = openAlone(captionThread, postThread);

  // Live propagation (#117): a `posts` poke means the Post list may have changed,
  // so refetch the list (the featured post re-derives from it). A `post_caption`
  // poke means one Post's Captions changed (#121), and a `post_like` poke means
  // one Post's like count changed (#122): each is held for the selected Post
  // only. A `caption_like` poke means one Caption's like count changed (#123),
  // held for the selected Caption. A `post_comment` Event carries a Comment
  // upsert or removal for one Post's thread (#124), held for the selected Post
  // while its Comments panel is open; a `caption_comment` Event, the same for
  // the shown Caption's thread (#127). Each Subscription names its Channel
  // through an accessor, so the Feed moves the hold with the selection and
  // routes only the held Channel here (ADR-0028). Each handler refetches on a
  // poke and on the resync call after a (re)connect, so a poke lost while the
  // socket was down is recovered (#120 review). The anonymous landing page has
  // no socket, so the route calls this on login (#120).
  const connectFeed = (feed: Feed): void => {
    // A connected Feed means a logged-in User, so the viewer's like state can
    // load now; it ends with the caller's scope (logout), like the socket. A
    // logout also drops the wanted Likes (`createLikeState`), so a queued send
    // stops after the request in flight and never goes out with the next User's
    // cookie (#122 review).
    setLive(true);
    onCleanup(() => setLive(false));
    // The Channel for the selected entity's id, or none while nothing is selected.
    const selectedChannel =
      (id: () => number | undefined, channel: (id: number) => Channel) =>
      (): Channel | undefined => {
        const value = id();
        return value === undefined ? undefined : channel(value);
      };
    const postId = () => selectedPost()?.id;
    const captionId = () => selectedCaption()?.id;
    feed.subscribe(
      () => Channel.posts,
      () => void refetchPosts(),
    );
    feed.subscribe(selectedChannel(postId, Channel.postCaption), selection.refetchCaptions);
    feed.subscribe(selectedChannel(postId, Channel.postLike), () => postLike.refetch());
    feed.subscribe(selectedChannel(captionId, Channel.captionLike), () => captionLike.refetch());
    // The thread's Subscription is held only while the Comments panel is open.
    const shownThreadId = () => (postComments.open() ? postId() : undefined);
    feed.subscribe(selectedChannel(shownThreadId, Channel.postComment), onPostCommentEvent);
    const shownCaptionThreadId = () => (captionComments.open() ? captionId() : undefined);
    feed.subscribe(
      selectedChannel(shownCaptionThreadId, Channel.captionComment),
      onCaptionCommentEvent,
    );
  };

  const [hero] = createResource(() => api.hero.get());

  return {
    categories,
    visiblePosts,
    emptyCategoryLabel,
    selectedPost,
    selectPost: selection.selectPost,
    visibleCaptions: selection.visibleCaptions,
    selectedCaption,
    selectCaption: selection.selectCaption,
    selectedCategory,
    setSelectedCategory: selection.setSelectedCategory,
    hero,
    selectedPostLike: postLike.like,
    togglePostLike: postLike.toggle,
    selectedCaptionLike: captionLike.like,
    toggleCaptionLike: captionLike.toggle,
    postComments,
    captionComments,
    postOwner: selection.postOwner,
    captionOwner: selection.captionOwner,
    draftScopes: selection.draftScopes,
    announcement: selection.announcement,
    connectFeed,
  };
}
