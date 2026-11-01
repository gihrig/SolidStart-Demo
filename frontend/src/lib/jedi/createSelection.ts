import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  untrack,
  type Accessor,
  type Signal,
} from "solid-js";
import { isServer } from "solid-js/web";
import {
  createDraftScope,
  passThroughGuard,
  type DraftGuard,
  type DraftScope,
} from "~/lib/createDraftGuard";
import type { CaptionView, JediCategory, PostChanges, PostView } from "~/types/jedi";

/** One edit's open state (#187): the Post edit or the Caption edit. */
export interface EditState {
  /** Whether the edit is open on the subject shown. A change of the subject
   *  shown closes it. While it is open, it starts the Post hold or the
   *  Caption hold of its subject. */
  open: Accessor<boolean>;
  /** Open the edit on the subject shown, or close it. A close is the form's
   *  own Cancel or Save, so it is no guarded move. */
  setOpen: (open: boolean) => void;
}

/** The Owner's writes on one subject (#187): its edit, save and delete. */
export interface OwnerWrites<Changes> {
  /** The edit's open state. */
  edit: EditState;
  /** Save the Owner's edit of the subject `id`: only the changes. Refetches at
   *  once. Rejects on failure. */
  save: (id: number, changes: Changes) => Promise<void>;
  /** Delete the subject `id`, as its Owner: the one the delete question
   *  asked about. It must still be the subject shown, or nothing is deleted
   *  and it rejects (PR #216 review). It releases the Drafts on the subject
   *  first, as the poke can arrive before the result, and refetches at once.
   *  Rejects on failure, and the guard holds the Drafts again. */
  remove: (id: number) => Promise<void>;
  /** Whether `remove` would discard a Draft: the delete question says so. */
  removeDiscardsDraft: () => boolean;
}

/** The scopes of the Post shown and of the Caption shown (ADR-0030, #271).
 *  The Caption scope sits under the Post scope. */
export interface PostCardScopes {
  post: DraftScope;
  caption: DraftScope;
}

/** The back-end calls of the selection: the Captions read and the Owner's
 *  writes (#187). Each rejects on failure. */
export interface SelectionCalls {
  /** The Captions of the Post `postId`, ranked. */
  listCaptions: (postId: number) => Promise<CaptionView[]>;
  /** Save the Owner's changes of the Post `id`. */
  updatePost: (id: number, changes: PostChanges) => Promise<unknown>;
  /** Delete the Post `id`, as its Owner. */
  removePost: (id: number) => Promise<void>;
  /** Save the Owner's new text of the Caption `id`. */
  updateCaption: (id: number, text: string) => Promise<unknown>;
  /** Delete the Caption `id`, as its Owner. */
  removeCaption: (id: number) => Promise<void>;
}

/** The inputs of the selection: the Posts and the filter, which its owner
 *  keeps, the back-end calls, and the app's Draft guard. */
export interface SelectionDeps {
  /** The ranked Posts of every Category; undefined while they load. */
  posts: Accessor<PostView[] | undefined>;
  /** The ranked Posts that the filter at `categoryIndex` lists; undefined
   *  while they load. */
  visiblePostsIn: (categoryIndex: number) => PostView[] | undefined;
  /** The real Category that filters the Posts at `categoryIndex`; undefined
   *  for "All", and while the Categories load. */
  filterCategory: (categoryIndex: number) => JediCategory | undefined;
  /** The index of the selected Category. */
  categoryIndex: Accessor<number>;
  /** Set the selected Category at once: the filter's own write. */
  setCategoryIndex: (index: number) => void;
  /** Load the Posts again. The new list goes through `checkPosts` before the
   *  view sees it. */
  refetchPosts: () => void;
  /** The back-end calls. */
  calls: SelectionCalls;
  /** The app's Draft guard (ADR-0030). Defaults to the pass-through guard,
   *  which runs each move at once. */
  guard?: DraftGuard;
}

/** The Post and the Caption that the Post card shows (#271), and the moves
 *  and writes on them. */
export interface SelectionState {
  /** The Post shown in the Post card (#29). */
  selectedPost: Accessor<PostView | undefined>;
  /** Select a Post (a Top Photo click). A change of the Post shown goes
   *  through the Draft guard, in the Post scope. */
  selectPost: (id: number) => void;
  /** Select a Category by index. A change that changes the Post shown goes
   *  through the Draft guard; one that keeps it does not. */
  setSelectedCategory: (index: number) => void;
  /** What Top Captions renders: the Captions of the Post shown. Undefined
   *  while they load. Empty when no Post is shown (an empty Category), so the
   *  card clears with `<main>`. */
  visibleCaptions: Accessor<CaptionView[] | undefined>;
  /** The Caption shown under the Post (#33). */
  selectedCaption: Accessor<CaptionView | undefined>;
  /** Select a Caption (a Top Captions click). A change of the Caption shown
   *  closes its Comments panel and its edit, so it goes through the Draft
   *  guard, in the Caption scope (#127, #271). */
  selectCaption: (id: number) => void;
  /** The Owner's writes on the Post shown (#187). The edit is the Edit
   *  dialog. When a save's Categories drop the selected one, the filter
   *  switches to "All" when the save is sent, so the Post stays shown. A
   *  delete releases every Draft on the Post. */
  postOwner: OwnerWrites<PostChanges>;
  /** The Owner's writes on the Caption shown (#187). The edit is the form in
   *  the Caption line. A save rejects for a Caption that got a Like. A delete
   *  releases every Draft on the Caption: its edit's and its Comments panel's
   *  (#271). */
  captionOwner: OwnerWrites<string>;
  /** The scopes of the Post shown and of the Caption shown. */
  draftScopes: PostCardScopes;
  /** The message of the route's polite live region (#187): the result of the
   *  Owner's own save or delete, or a change by another User that discarded
   *  no Draft. Empty until the first message. */
  announcement: Accessor<string>;
  /** The subject that each Comments panel is open on: the signal that each
   *  thread gets through `openOn`. The Caption one starts a Caption hold. */
  threadOpenOn: {
    post: Signal<number | undefined>;
    caption: Signal<number | undefined>;
  };
  /** The cause check of a new Post list (#187). The owner of the Posts calls
   *  it before the view sees the list: a deleted Post is a forced discard of
   *  the Drafts on it, and a Post that left the Category asks. */
  checkPosts: (list: PostView[]) => void;
  /** Load the Captions of the Post shown again (a `post_caption` poke). */
  refetchCaptions: () => void;
}

/** The forced-discard notices of a deleted subject (#187, ADR-0030 addendum). */
const POST_DELETED_NOTICE = "This Post was deleted. Your unsaved changes were discarded.";
const CAPTION_DELETED_NOTICE = "This Caption was deleted. Your unsaved changes were discarded.";
/** The question when an Event moves a held Post out of the Category (T6). */
const leftCategoryNotice = (name: string) =>
  `This Post is no longer in ${name}. Your unsaved changes may not apply.`;

/** The error of a delete whose subject is no longer shown (PR #216 review). */
const POST_CHANGED_ERROR = "The Post shown changed. Nothing was deleted.";
const CAPTION_CHANGED_ERROR = "The Caption shown changed. Nothing was deleted.";

/** The live region's texts for the Owner's own write (T8). */
const POST_DELETED_ANNOUNCEMENT = "Post deleted.";
const CAPTION_DELETED_ANNOUNCEMENT = "Caption deleted.";
const POST_SAVED_ANNOUNCEMENT = "Post saved.";
const CAPTION_SAVED_ANNOUNCEMENT = "Caption saved.";
/** The live region's texts for a change by another User (T9). */
const POST_WAS_DELETED_ANNOUNCEMENT = "This Post was deleted.";
const CAPTION_WAS_DELETED_ANNOUNCEMENT = "This Caption was deleted.";
const leftCategoryAnnouncement = (name: string) => `This Post is no longer in ${name}.`;

/** Whether the Post is in the Category. */
const inCategory = (post: PostView, category: JediCategory): boolean =>
  post.categories.some((c) => c.id === category.id);

/**
 * The Post and the Caption that the Post card shows (#271, ADR-0030 addendum).
 * It owns the picks, the Post hold, the Caption hold, the guarded moves and the
 * change causes of #187. It also owns the Owner's own save and delete, and the
 * live region of the route.
 *
 * The Post shown is the clicked Post while the filter lists it, else the
 * top-ranked Post in the filter. A **Post hold** keeps the Post shown: a Draft
 * on the Post, an open Post edit or an open Comments panel starts it, and it
 * ends when the last of them ends. During a Post hold, a re-rank does not move
 * the Post card, and a Post that an Event moves out of the Category stays
 * shown. With a Draft, the guard asks whether to keep the Drafts on it.
 *
 * The Caption shown is the picked Caption, else the top-ranked Caption. A
 * **Caption hold** keeps the Caption shown: an open Caption edit or an open
 * Caption Comments panel starts it.
 *
 * The scopes: the Post scope, with the Caption scope under it. Each Post move
 * and Event names the Post scope, and a Caption pick names the Caption scope.
 * Each Comment thread makes its own scope under the scope of its parent.
 *
 * The Captions resource sits here, keyed on the Post shown: the memo of the
 * Caption edit reads the Captions when the module starts. A resource outside
 * would need a late binding, the ordering trap that #191 D1 removed. The Posts
 * resource stays with the owner, whose fetcher calls `checkPosts` before the
 * view sees the new list.
 */
export function createSelection(deps: SelectionDeps): SelectionState {
  const { posts, visiblePostsIn, filterCategory, categoryIndex, calls } = deps;
  const guard = deps.guard ?? passThroughGuard;
  const [selectedPostId, setSelectedPostId] = createSignal<number | undefined>();
  const [selectedCaptionId, setSelectedCaptionId] = createSignal<number | undefined>();
  // The scopes of the Post card's forms (#271, ADR-0030 addendum). The Post
  // thread scope and the Caption scope sit under the Post scope, and the
  // Caption thread scope under the Caption scope. Each Post move and Event
  // names the Post scope, so none touches a Draft outside the Post, such as
  // the New Post Draft (#214).
  const postScope = createDraftScope("post");
  const captionScope = createDraftScope("caption", postScope);

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
  // The subject each Comments panel is open on (#124, #127). This module owns
  // the signals, as the Post hold and the Caption hold read them; each thread
  // sets and clears its own.
  const postThreadOpenOn = createSignal<number>();
  const captionThreadOpenOn = createSignal<number>();
  // The held Post that an Event moved out of the selected Category (#187): it
  // stays shown while the Post hold lasts.
  const [keptPostId, setKeptPostId] = createSignal<number>();
  // The ids of the Owner's own deletes (#187): their absence from a list is no
  // Event cause, so it shows no notice.
  const ownDeletedPosts = new Set<number>();
  const ownDeletedCaptions = new Set<number>();

  // The featured Post is the ranked list's first element. It is the loading
  // fallback for `selectedPost`.
  const featured = (): PostView | undefined => posts()?.[0];

  // The clicked Post, but only while the filter still lists it; then the held
  // Post; then the held Post that an Event moved out of the filter, when
  // `keep` (#187); otherwise the top-ranked visible Post. `visible ===
  // undefined` is the loading state (fall back to `featured`); an empty array
  // is a real Category with no Posts, which stays undefined so `<main>` can
  // show the empty panel instead of a stale Post.
  const selectedPostIn = (
    index: number,
    heldId: number | undefined,
    keep: boolean,
  ): PostView | undefined => {
    const visible = visiblePostsIn(index);
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
  // Whether a Comments panel is open (#271): the Post's or the Caption's.
  const panelOpen = () =>
    postThreadOpenOn[0]() !== undefined || captionThreadOpenOn[0]() !== undefined;
  // The Post hold (#187, #271): the Post shown when it started, while a Draft
  // on the Post exists, the Post edit is open or a Comments panel is open. A
  // re-rank (a Like) must not move the Post card and discard the Draft, close
  // the edit or close a thread that the User reads. With no Post hold, the
  // Post card follows the ranking again. A held Post that leaves the list is
  // no longer shown, which is a forced discard. A Draft outside the Post
  // scope, such as the New Post Draft, does not start it (#214).
  const heldPostId = createMemo<number | undefined>((held) =>
    guard.hasDraftIn(postScope) || postEditOn() !== undefined || panelOpen()
      ? (held ?? untrack(() => selectedPostIn(categoryIndex(), undefined, false))?.id)
      : undefined,
  );
  const selectedPost = () => selectedPostIn(categoryIndex(), heldPostId(), true);

  // A move that keeps the Post shown unmounts no form, so it is no guarded
  // move. A move to another Post closes the Post's forms only (#214).
  const guardPostChange = (nextPostId: number | undefined, move: () => void): void => {
    if (nextPostId === selectedPost()?.id) move();
    else guard.attempt(move, postScope);
  };
  const selectPost = (id: number): void => {
    guardPostChange(id, () => setSelectedPostId(id));
  };
  // A User's own Category change does not keep a held Post outside the filter
  // (#187): it asks first, then moves.
  const setSelectedCategory = (index: number): void => {
    guardPostChange(selectedPostIn(index, heldPostId(), false)?.id, () => {
      setKeptPostId(undefined);
      deps.setCategoryIndex(index);
    });
  };

  // Each result carries the Post id it was fetched for, so even an empty list
  // belongs to one Post (#185 review).
  const [topCaptions, { refetch: refetchCaptions }] = createResource(
    () => selectedPost()?.id,
    async (postId) => {
      const captions = await calls.listCaptions(postId);
      if (!isServer) untrack(() => noteDeletedCaption(postId, captions));
      return { postId, captions };
    },
  );
  // Read `.latest`, not `topCaptions()`: a suspending read here re-triggered
  // Suspense on every Post re-key, reconciling the route subtree and blurring
  // the focused sidebar listbox to <body> (#35). `.latest` is non-suspending,
  // but during a refetch it still holds the PREVIOUS Post's Captions — for the
  // whole network round trip (#118). So only Captions of the Post shown count;
  // while the new Post's Captions load, there are none (`undefined`), never
  // stale ones. Match on the result's Post id, not on each Caption's:
  // `[].every(...)` is true, so the last Post's empty list would pass as this
  // Post's "none".
  const selectedPostCaptions = (): CaptionView[] | undefined => {
    const result = topCaptions.latest;
    return result?.postId === selectedPost()?.id ? result?.captions : undefined;
  };
  const winningCaption = () => selectedPostCaptions()?.[0];

  // `[]` when no Post is shown (an empty Category) so Top Captions clears: the
  // empty branch, not the resource, drives that clear.
  const visibleCaptions = (): CaptionView[] | undefined =>
    selectedPost() ? selectedPostCaptions() : [];

  // The picked Caption; then the Caption its Comments panel is open on (#127):
  // a re-rank must not close a thread the User is reading; then the Caption its
  // edit is open on (#187); otherwise the winner. These are the Caption hold.
  // Self-resets on a Post change: the old ids are absent from the new Captions.
  const selectedCaption = (): CaptionView | undefined => {
    const captions = selectedPostCaptions();
    const [threadOn] = captionThreadOpenOn;
    return (
      captions?.find((c) => c.id === selectedCaptionId()) ??
      captions?.find((c) => c.id === threadOn()) ??
      captions?.find((c) => c.id === captionEditOn()) ??
      winningCaption()
    );
  };
  // A pick of the Caption shown unmounts no form, so it is no guarded move. A
  // pick names the Caption scope: it closes the edit and the thread (#187).
  const selectCaption = (id: number): void => {
    if (id === selectedCaption()?.id) setSelectedCaptionId(id);
    else guard.attempt(() => setSelectedCaptionId(id), captionScope);
  };

  // The Owner's edits (#187). Each is open on its subject's id, so a change of
  // the subject shown closes it, and a return does not reopen it.
  const editState = (
    openOn: Accessor<number | undefined>,
    setOpenOn: (id: number | undefined) => void,
    shownId: () => number | undefined,
  ): EditState => {
    // A memo, so a refetched subject with the same id does not close the edit.
    const shown = createMemo(shownId);
    createEffect(on(shown, () => setOpenOn(undefined), { defer: true }));
    return {
      open: () => openOn() !== undefined && openOn() === shown(),
      setOpen: (open) => setOpenOn(open ? shown() : undefined),
    };
  };
  // The Post edit and the Add Caption form report in the Post scope, and the
  // Caption edit in the Caption scope (`DraftScopeContext`): no move closes
  // one of them alone.
  const postEdit = editState(postEditOn, setPostEditOn, () => selectedPost()?.id);
  const captionEdit = editState(captionEditOn, setCaptionEditOn, () => selectedCaption()?.id);

  // A held Post that is not in the full list was deleted (#187): a forced
  // discard of every Draft on it. A viewer without a Draft hears it. A held
  // Post that the list moves out of the selected Category stays shown, and the
  // guard asks, once per leave, whether to keep the Drafts on it.
  const checkPosts = (list: PostView[]): void => {
    const shown = selectedPost();
    if (!shown || ownDeletedPosts.has(shown.id)) return;
    const next = list.find((p) => p.id === shown.id);
    if (!next) {
      if (!guard.discardIn(postScope, POST_DELETED_NOTICE)) {
        announce(POST_WAS_DELETED_ANNOUNCEMENT);
      }
      return;
    }
    const category = filterCategory(categoryIndex());
    if (!category || heldPostId() !== shown.id) return;
    if (!inCategory(shown, category) || inCategory(next, category)) return;
    setKeptPostId(shown.id);
    // "Discard" also closes the Post edit and the Comments panels (#271), so
    // the Post hold ends and the Post card moves: no form stays open with text
    // that the guard no longer holds.
    guard.ask(leftCategoryNotice(category.name), postScope, () => {
      setPostEditOn(undefined);
      postThreadOpenOn[1](undefined);
      captionThreadOpenOn[1](undefined);
    });
  };
  // When the Post card moves off a Post that is no longer in the selected
  // Category, and the User did not change the Category, the live region says
  // why (#187).
  createEffect(
    on(
      () => [selectedPost()?.id, categoryIndex()] as const,
      ([id, index], prev) => {
        if (!prev) return;
        const [prevId, prevIndex] = prev;
        if (prevId === undefined || id === prevId || index !== prevIndex) return;
        const category = filterCategory(index);
        const left = posts()?.find((p) => p.id === prevId);
        if (!category || !left || inCategory(left, category)) return;
        announce(leftCategoryAnnouncement(category.name));
      },
    ),
  );
  // A held Caption that is not in its Post's list was deleted (#187): a forced
  // discard of the Drafts on it, in its edit and in its Comments panel.
  const noteDeletedCaption = (postId: number, captions: CaptionView[]): void => {
    const shown = selectedCaption();
    if (!shown || shown.postId !== postId || ownDeletedCaptions.has(shown.id)) return;
    if (captions.some((c) => c.id === shown.id)) return;
    if (!guard.discardIn(captionScope, CAPTION_DELETED_NOTICE)) {
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
  const deletePost = async (id: number): Promise<void> => {
    if (selectedPost()?.id !== id) throw new Error(POST_CHANGED_ERROR);
    await deleteSubject(id, ownDeletedPosts, calls.removePost, () => guard.release(postScope));
    announce(POST_DELETED_ANNOUNCEMENT);
    deps.refetchPosts();
  };
  const deleteCaption = async (id: number): Promise<void> => {
    if (selectedCaption()?.id !== id) throw new Error(CAPTION_CHANGED_ERROR);
    await deleteSubject(id, ownDeletedCaptions, calls.removeCaption, () =>
      guard.release(captionScope),
    );
    announce(CAPTION_DELETED_ANNOUNCEMENT);
    void refetchCaptions();
  };

  // The Owner's own edits (#187). The refetch does not wait for the poke.
  const updatePost = async (id: number, changes: PostChanges): Promise<void> => {
    // A save that drops the selected Category keeps the Post shown: the
    // filter switches to "All" when the save is sent, as the poke can arrive
    // before the result.
    const category = filterCategory(categoryIndex());
    const dropsCategory =
      changes.categoryIds !== undefined &&
      category !== undefined &&
      !changes.categoryIds.includes(category.id);
    if (dropsCategory) {
      selectPost(id);
      setSelectedCategory(0);
    }
    await calls.updatePost(id, changes);
    announce(POST_SAVED_ANNOUNCEMENT);
    deps.refetchPosts();
  };
  const updateCaption = async (id: number, text: string): Promise<void> => {
    await calls.updateCaption(id, text);
    announce(CAPTION_SAVED_ANNOUNCEMENT);
    void refetchCaptions();
  };

  return {
    selectedPost,
    selectPost,
    setSelectedCategory,
    visibleCaptions,
    selectedCaption,
    selectCaption,
    postOwner: {
      edit: postEdit,
      save: updatePost,
      remove: deletePost,
      removeDiscardsDraft: () => guard.hasDraftIn(postScope),
    },
    captionOwner: {
      edit: captionEdit,
      save: updateCaption,
      remove: deleteCaption,
      removeDiscardsDraft: () => guard.hasDraftIn(captionScope),
    },
    draftScopes: { post: postScope, caption: captionScope },
    announcement,
    threadOpenOn: { post: postThreadOpenOn, caption: captionThreadOpenOn },
    checkPosts,
    refetchCaptions: () => void refetchCaptions(),
  };
}
