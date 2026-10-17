import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
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

/** One edit's open state (#187): the Post edit or the Caption edit. */
export interface EditState {
  /** Whether the edit is open on the subject shown. A change of the subject
   *  shown closes it. While it is open, it holds its subject. */
  open: Accessor<boolean>;
  /** Open the edit on the subject shown, or close it. A close is the form's
   *  own Cancel or Save, so it is no guarded move. */
  setOpen: (open: boolean) => void;
  /** The scope of the edit form's Draft (ADR-0030). */
  draftScope: DraftScope;
}

/** The Owner's writes on one subject (#187): its edit, save and delete. */
export interface OwnerWrites<Changes> {
  /** The edit's open state. */
  edit: EditState;
  /** Save the Owner's edit of the subject `id`: only the changes. Refetches at
   *  once. Rejects on failure. */
  save: (id: number, changes: Changes) => Promise<void>;
  /** Delete the shown subject, as its Owner. It releases the Drafts on the
   *  subject first, as the poke can arrive before the result, and refetches at
   *  once. Rejects on failure, and the guard holds the Drafts again. */
  remove: () => Promise<void>;
  /** Whether `remove` would discard a Draft: the delete question says so. */
  removeDiscardsDraft: () => boolean;
}

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
 * post the sidebar actually lists. While a Draft exists, a re-rank does not
 * move it (ADR-0030). `topCaptions` re-keys off it, so the
 * captions and the rest of the article's metadata track the selection.
 *
 * `selectedCaption` is the caption shown under the post (#33): it defaults to
 * the `winningCaption` and follows `selectCaption(id)`. Like `selectedPost` it
 * self-resets — the old caption's id is absent from the new post's captions, so
 * it falls back to that post's winner. While its Comments panel is open, a
 * re-rank does not change it (#127, ADR-0030 addendum).
 *
 * `selectedPostLike` / `selectedCaptionLike` are the viewer's like state of the
 * selected Post and the selected Caption (#122, #123). Each comes from one
 * `createLikeState`; this view-model keeps the Feed wiring around them.
 *
 * `postComments` is the selected Post's Comment thread (#124), and
 * `captionComments` the shown Caption's (#127). Each is one
 * `createCommentThread`, exposed as one nested member, with its own open state,
 * Draft scope and Subscription; this view-model keeps the Feed wiring around
 * them.
 *
 * Each user-started move that changes the selected Post, a Caption pick that
 * changes the Caption shown, and a close of a Comments panel, goes through the
 * app's Draft guard (ADR-0030): with a Draft, it waits for the confirm dialog.
 *
 * `postOwner` / `captionOwner` are the Owner's writes (#187): the edit, the
 * save and the delete. A refetch finds the cause of a change that it did not
 * start: a held Post that is not in the full list was deleted, and so was a
 * held Caption that is not in its Post's list. That is a forced discard of the
 * Drafts on it, with the notice that names it; a viewer without a Draft hears
 * it in `announcement`.
 *
 * An open edit holds its subject, with or without a Draft. A held Post that an Event moves out of
 * the selected Category stays shown, and the guard asks whether to keep the
 * Drafts on it. When the hold ends, the article shows the top-ranked Post in
 * the Category.
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
   *  closes its Comments panel, so it goes through the Draft guard, in that
   *  panel's scope (#127). */
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
   *  Caption line shows the new count at once; Top Captions re-ranks after the
   *  back-end's `post_caption` poke. */
  toggleCaptionLike: () => Promise<void>;
  /** The selected Post's Comment thread (#124): the panel's open state, its
   *  rows and its writes. It loads only while the panel is open. The read is
   *  public, so it loads on the anonymous landing too; the writes need a login.
   *  A close goes through the Draft guard. */
  postComments: CommentThreadState;
  /** The shown Caption's Comment thread (#127), as `postComments` is for the
   *  Post. While its panel is open, it holds the Caption shown. */
  captionComments: CommentThreadState;
  /** The Owner's writes on the shown Post (#187). The edit is the Edit
   *  dialog. When a save's Categories drop the selected one, the filter
   *  switches to "All" when the save is sent, so the Post stays shown. A
   *  delete releases every Draft on the Post. */
  postOwner: OwnerWrites<PostChanges>;
  /** The Owner's writes on the shown Caption (#187). The edit is the form in
   *  the Caption line. A save rejects for a Caption that got a Like. A delete
   *  releases the Drafts in the Caption's Comments panel. */
  captionOwner: OwnerWrites<string>;
  /** The message of the route's polite live region (#187): the result of the
   *  Owner's own delete, or a delete by another User that discarded no Draft.
   *  Empty until the first message. */
  announcement: Accessor<string>;
  /** Wire a live Feed after creation (#120): the route builds this view-model
   *  anonymously, then connects the socket's Feed once a User logs in. The
   *  subscription is owned by the caller's reactive scope, so it ends with it. */
  connectFeed: (feed: Feed) => void;
}

/** The forced-discard notices of a deleted subject (#187, ADR-0030 addendum). */
const POST_DELETED_NOTICE = "This Post was deleted. Your unsaved changes were discarded.";
const CAPTION_DELETED_NOTICE = "This Caption was deleted. Your unsaved changes were discarded.";
/** The question when an Event moves a held Post out of the Category (T6). */
const leftCategoryNotice = (name: string) =>
  `This Post is no longer in ${name}. Your unsaved changes may not apply.`;

/** The live region's texts for the Owner's own write (T8). */
const POST_DELETED_ANNOUNCEMENT = "Post deleted.";
const CAPTION_DELETED_ANNOUNCEMENT = "Caption deleted.";
const POST_SAVED_ANNOUNCEMENT = "Post saved.";
const CAPTION_SAVED_ANNOUNCEMENT = "Caption saved.";
/** The live region's texts for a change by another User (T9). */
const POST_WAS_DELETED_ANNOUNCEMENT = "This Post was deleted.";
const CAPTION_WAS_DELETED_ANNOUNCEMENT = "This Caption was deleted.";
const leftCategoryAnnouncement = (name: string) => `This Post is no longer in ${name}.`;

/** The synthetic "no filter" row. Id 0 is unused by the real categories. */
const ALL_CATEGORIES: JediCategory = { id: 0, name: "All", icon: "menu" };

/** Whether the Post is in the Category. */
const inCategory = (post: PostView, category: JediCategory): boolean =>
  post.categories.some((c) => c.id === category.id);

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
  const [selectedPostId, setSelectedPostId] = createSignal<number | undefined>();
  const [selectedCaptionId, setSelectedCaptionId] = createSignal<number | undefined>();

  const [announcement, setAnnouncement] = createSignal("");
  // The live region speaks a change of its text, so it clears first: a repeat
  // of the same message, such as a second save, is spoken again.
  const announce = (message: string): void => {
    setAnnouncement("");
    queueMicrotask(() => setAnnouncement(message));
  };
  // The Subject each edit is open on (#187), else undefined.
  const [postEditOn, setPostEditOn] = createSignal<number>();
  const [captionEditOn, setCaptionEditOn] = createSignal<number>();
  // The held Post that an Event moved out of the selected Category (#187): it
  // stays shown while the hold lasts.
  const [keptPostId, setKeptPostId] = createSignal<number>();
  // The ids of the Owner's own deletes (#187): their absence from a list is no
  // Event cause, so it shows no notice.
  const ownDeletedPosts = new Set<number>();
  const ownDeletedCaptions = new Set<number>();

  const [realCategories] = createResource(() => api.categories.list());
  // Each load finds the cause of a change before the view sees the new list:
  // a form that the change unmounts then holds no Draft (#187). Only in the
  // browser: an Event reaches no server render, and on the server a read after
  // the `await` can meet another request's render context.
  const [postsResource, { refetch: refetchPosts }] = createResource(async () => {
    const list = await api.posts.list();
    if (!isServer) untrack(() => noteChangedPost(list));
    return list;
  });
  // The first load reads `postsResource()`, so the route's <Suspense> (and SSR)
  // waits for the Posts. After that, read `.latest`: a refetch (a `posts` poke,
  // e.g. a Post Like) must not suspend again, or the app's <Suspense> swaps the
  // whole route for its fallback, which looks like a page reload (#123).
  const posts = (): PostView[] | undefined => postsResource.latest ?? postsResource();
  // The featured post IS the ranked list's first element, so it is derived, not a
  // second fetch (`list_posts` is already ranked by the back-end). It is the
  // loading fallback for `selectedPost` below.
  const featured = (): PostView | undefined => posts()?.[0];

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
    return all.filter((p) => inCategory(p, category));
  };
  const visiblePosts = () => visiblePostsIn(selectedCategory());

  // The clicked post, but only while the filter still lists it; then the held
  // post; then the held post that an Event moved out of the filter, when
  // `keep` (#187); otherwise the top-ranked visible post. `visible ===
  // undefined` is the loading state (fall back to `featured`); an empty array
  // is a real category with no posts, which stays undefined so `<main>` can
  // show the empty panel instead of a stale post.
  const selectedPostIn = (
    categoryIndex: number,
    heldId: number | undefined,
    keep: boolean,
  ): PostView | undefined => {
    const visible = visiblePostsIn(categoryIndex);
    if (visible === undefined) return featured();
    const id = selectedPostId();
    const kept =
      keep && heldId !== undefined && heldId === keptPostId()
        ? posts()?.find((p) => p.id === heldId)
        : undefined;
    return (
      visible.find((p) => p.id === id) ?? visible.find((p) => p.id === heldId) ?? kept ?? visible[0]
    );
  };
  // The Post shown when the first Draft started, held while a Draft exists or
  // the Post edit is open (#187): a re-rank (a Like) must not move the article
  // and discard the Draft or close the edit. With no hold, the article follows
  // the ranking again. A held Post that leaves the list is no longer shown,
  // which is a forced discard.
  const heldPostId = createMemo<number | undefined>((held) =>
    guard.hasDraft() || postEditOn() !== undefined
      ? (held ?? untrack(() => selectedPostIn(selectedCategory(), undefined, false))?.id)
      : undefined,
  );
  const selectedPost = () => selectedPostIn(selectedCategory(), heldPostId(), true);

  // A move that keeps the selected Post unmounts no form, so it is no guarded
  // move.
  const guardPostChange = (nextPostId: number | undefined, move: () => void): void => {
    if (nextPostId === selectedPost()?.id) move();
    else guard.attempt(move);
  };

  // Truthy only when a real (non-"All") category filters every post away.
  const emptyCategoryLabel = (): string | undefined => {
    if (visiblePosts()?.length !== 0) return undefined;
    return filterCategory()?.name;
  };
  const selectPost = (id: number): void => {
    guardPostChange(id, () => setSelectedPostId(id));
  };
  // A User's own Category change does not keep a held Post outside the filter
  // (#187): it asks first, then moves.
  const setSelectedCategory = (index: number): void => {
    guardPostChange(selectedPostIn(index, heldPostId(), false)?.id, () => {
      setKeptPostId(undefined);
      setSelectedCategoryIndex(index);
    });
  };

  // Each result carries the Post id it was fetched for, so even an empty list
  // belongs to one Post (#185 review).
  const [topCaptions, { refetch: refetchCaptions }] = createResource(
    () => selectedPost()?.id,
    async (postId) => {
      const captions = await api.captions.listForPost(postId);
      if (!isServer) untrack(() => noteDeletedCaption(postId, captions));
      return { postId, captions };
    },
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

  // The Caption that its Comments panel is open on (#127). The view-model owns
  // this signal, as the hold below reads it; the Caption thread sets and clears
  // it.
  const captionThreadOpenOn = createSignal<number>();
  // The picked Caption; then the Caption its Comments panel is open on (#127):
  // a re-rank must not close a thread the User is reading; then the Caption its
  // edit is open on (#187); otherwise the winner. Self-resets on a post change:
  // the old ids are absent from the new captions.
  const selectedCaption = (): CaptionView | undefined => {
    const captions = selectedPostCaptions();
    const [heldId] = captionThreadOpenOn;
    return (
      captions?.find((c) => c.id === selectedCaptionId()) ??
      captions?.find((c) => c.id === heldId()) ??
      captions?.find((c) => c.id === captionEditOn()) ??
      winningCaption()
    );
  };
  // A pick of the Caption shown unmounts no form, so it is no guarded move. A
  // pick names both scopes that it unmounts: the edit and the thread (#187).
  const selectCaption = (id: number): void => {
    if (id === selectedCaption()?.id) setSelectedCaptionId(id);
    else
      guard.attempt(
        () => setSelectedCaptionId(id),
        [captionEdit.draftScope, captionComments.draftScope],
      );
  };

  // The Owner's edits (#187). Each is open on its subject's id, so a change of
  // the subject shown closes it, and a return does not reopen it.
  const editState = (
    openOn: Accessor<number | undefined>,
    setOpenOn: (id: number | undefined) => void,
    shownId: () => number | undefined,
    name: string,
  ): EditState => {
    // A memo, so a refetched subject with the same id does not close the edit.
    const shown = createMemo(shownId);
    createEffect(on(shown, () => setOpenOn(undefined), { defer: true }));
    return {
      open: () => openOn() !== undefined && openOn() === shown(),
      setOpen: (open) => setOpenOn(open ? shown() : undefined),
      draftScope: Symbol(name),
    };
  };
  const postEdit = editState(postEditOn, setPostEditOn, () => selectedPost()?.id, "post-edit");
  const captionEdit = editState(
    captionEditOn,
    setCaptionEditOn,
    () => selectedCaption()?.id,
    "caption-edit",
  );

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
  // close goes through the guard.
  const { thread: postComments, onEvent: onPostCommentEvent } = createCommentThread({
    parentId: () => selectedPost()?.id,
    api: api.comments,
    events: POST_COMMENT_EVENTS,
    guard,
  });
  // The shown Caption's Comment thread (#127), the same way.
  const { thread: captionComments, onEvent: onCaptionCommentEvent } = createCommentThread({
    parentId: () => selectedCaption()?.id,
    api: api.captionComments,
    events: CAPTION_COMMENT_EVENTS,
    openOn: captionThreadOpenOn,
    guard,
  });

  // A held Post that is not in the full list was deleted (#187): a forced
  // discard of every Draft on it. A viewer without a Draft hears it. A held
  // Post that the list moves out of the selected Category stays shown, and the
  // guard asks, once per leave, whether to keep the Drafts on it.
  const noteChangedPost = (list: PostView[]): void => {
    const shown = selectedPost();
    if (!shown || ownDeletedPosts.has(shown.id)) return;
    const next = list.find((p) => p.id === shown.id);
    if (!next) {
      if (!guard.discardIn(undefined, POST_DELETED_NOTICE)) {
        announce(POST_WAS_DELETED_ANNOUNCEMENT);
      }
      return;
    }
    const category = filterCategory();
    if (!category || heldPostId() !== shown.id) return;
    if (!inCategory(shown, category) || inCategory(next, category)) return;
    setKeptPostId(shown.id);
    // "Discard" also closes the Post edit, so the hold ends and the article
    // moves: no form stays open with text that the guard no longer holds.
    guard.ask(leftCategoryNotice(category.name), undefined, () => setPostEditOn(undefined));
  };
  // When the article moves off a Post that is no longer in the selected
  // Category, and the User did not change the Category, the live region says
  // why (#187).
  createEffect(
    on(
      () => [selectedPost()?.id, selectedCategory()] as const,
      ([id, categoryIndex], prev) => {
        if (!prev) return;
        const [prevId, prevCategoryIndex] = prev;
        if (prevId === undefined || id === prevId || categoryIndex !== prevCategoryIndex) return;
        const category = filterCategory(categoryIndex);
        const left = posts()?.find((p) => p.id === prevId);
        if (!category || !left || inCategory(left, category)) return;
        announce(leftCategoryAnnouncement(category.name));
      },
    ),
  );
  // A held Caption that is not in its Post's list was deleted (#187): a forced
  // discard of the Drafts in its Comments panel.
  const noteDeletedCaption = (postId: number, captions: CaptionView[]): void => {
    const shown = selectedCaption();
    if (!shown || shown.postId !== postId || ownDeletedCaptions.has(shown.id)) return;
    if (captions.some((c) => c.id === shown.id)) return;
    const scopes = [captionEdit.draftScope, captionComments.draftScope];
    if (!guard.discardIn(scopes, CAPTION_DELETED_NOTICE)) {
      announce(CAPTION_WAS_DELETED_ANNOUNCEMENT);
    }
  };

  // The Owner's own delete (#187). The Drafts on the subject go when the Owner
  // confirms, as the poke can arrive before the result (ADR-0016); a failed
  // delete holds them again. The refetch does not wait for the poke, which a
  // socket drop can lose.
  const deleteSubject = async (
    id: number,
    own: Set<number>,
    remove: (id: number) => Promise<void>,
    release: () => () => void,
  ): Promise<void> => {
    own.add(id);
    const restore = release();
    try {
      await remove(id);
    } catch (e) {
      own.delete(id);
      restore();
      throw e;
    }
  };
  const deletePost = async (): Promise<void> => {
    const post = selectedPost();
    if (!post) return;
    await deleteSubject(post.id, ownDeletedPosts, api.posts.remove, () => guard.release());
    announce(POST_DELETED_ANNOUNCEMENT);
    void refetchPosts();
  };
  const deleteCaption = async (): Promise<void> => {
    const caption = selectedCaption();
    if (!caption) return;
    await deleteSubject(caption.id, ownDeletedCaptions, api.captions.remove, () =>
      guard.release([captionComments.draftScope]),
    );
    announce(CAPTION_DELETED_ANNOUNCEMENT);
    void refetchCaptions();
  };

  // The Owner's own edits (#187). The refetch does not wait for the poke.
  const updatePost = async (id: number, changes: PostChanges): Promise<void> => {
    // A save that drops the selected Category keeps the Post shown: the
    // filter switches to "All" when the save is sent, as the poke can arrive
    // before the result.
    const category = filterCategory();
    const dropsCategory =
      changes.categoryIds !== undefined &&
      category !== undefined &&
      !changes.categoryIds.includes(category.id);
    if (dropsCategory) {
      selectPost(id);
      setSelectedCategory(0);
    }
    await api.posts.update(id, changes);
    announce(POST_SAVED_ANNOUNCEMENT);
    void refetchPosts();
  };
  const updateCaption = async (id: number, text: string): Promise<void> => {
    await api.captions.update(id, text);
    announce(CAPTION_SAVED_ANNOUNCEMENT);
    void refetchCaptions();
  };

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
    feed.subscribe(selectedChannel(postId, Channel.postCaption), () => void refetchCaptions());
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
    postComments,
    captionComments,
    postOwner: {
      edit: postEdit,
      save: updatePost,
      remove: deletePost,
      removeDiscardsDraft: () => guard.hasDraftIn(),
    },
    captionOwner: {
      edit: captionEdit,
      save: updateCaption,
      remove: deleteCaption,
      removeDiscardsDraft: () => guard.hasDraftIn([captionComments.draftScope]),
    },
    announcement,
    connectFeed,
  };
}
