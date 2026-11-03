import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  type Accessor,
  type Signal,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  createDraftScope,
  passThroughGuard,
  type DraftGuard,
  type DraftScope,
} from "~/lib/createDraftGuard";
import { toCommentView, type CommentApi } from "~/lib/jedi/jedi-api";
import { Channel } from "~/lib/channel";
import type { Feed, FeedHandler } from "~/lib/feed";
import type { CommentView } from "~/types/jedi";

/** One Comment target (#124, #127): the Channel of a parent's thread, and the
 *  label of the thread's Draft scope. */
export interface CommentTarget {
  name: "post_comment" | "caption_comment";
  channel: (parentId: number) => Channel;
}

/** The target of a Post's thread. */
export const POST_COMMENT_TARGET: CommentTarget = {
  name: "post_comment",
  channel: Channel.postComment,
};

/** The target of a Caption's thread (#127). */
export const CAPTION_COMMENT_TARGET: CommentTarget = {
  name: "caption_comment",
  channel: Channel.captionComment,
};

/** The inputs of one Comment thread: the parent shown (a Post or a Caption),
 *  its back-end calls, and its Comment target. */
export interface CommentThreadDeps {
  /** The id of the parent shown; undefined for none. */
  parentId: Accessor<number | undefined>;
  /** The target's Comment calls: `jediApi.comments` for a Post,
   *  `jediApi.captionComments` for a Caption. A test injects an in-memory
   *  stand-in. */
  api: CommentApi;
  /** The target: the Channel the thread holds, and its Draft scope label. */
  target: CommentTarget;
  /** The id of the parent that the panel is open on, as a signal the caller
   *  owns, when the caller reads it: the Caption hold (#127, ADR-0030
   *  addendum). Defaults to a signal of the thread's own. */
  openOn?: Signal<number | undefined>;
  /** The app's Draft guard (ADR-0030). Defaults to the pass-through guard,
   *  which runs each move at once. */
  guard?: DraftGuard;
  /** The scope of the parent shown, which the thread's scope sits under
   *  (#271): a move that names it also closes the thread's forms. None: the
   *  thread's scope has no parent. */
  parentScope?: DraftScope;
}

/** The Comment thread of the parent shown (#124, #127), and its actions. */
export interface CommentThreadState {
  /** Whether the Comments panel is open. The thread loads only while it is
   *  open: a closed panel makes no read and merges no Event. A change of the
   *  parent shown closes it. */
  open: Accessor<boolean>;
  /** Open or close the Comments panel on the parent shown. A close unmounts
   *  the panel's forms, so it goes through the Draft guard, in `draftScope`. */
  setOpen: (open: boolean) => void;
  /** The scope of the panel's forms (ADR-0030): a close asks only about their
   *  Drafts. */
  draftScope: DraftScope;
  /** The parent's Comments, newest first. Undefined while they load, while
   *  the panel is closed, and while no parent is shown. Each row keeps its
   *  identity across a reload. */
  comments: Accessor<CommentView[] | undefined>;
  /** Whether the shown thread dropped the Comment: the thread is loaded and
   *  does not list it. False while no thread shows. */
  deleted: (id: number) => boolean;
  /** A thread load failure, else undefined. */
  error: Accessor<string | undefined>;
  /** Add a Comment to the parent shown. Resolves once the back-end has
   *  committed it, and the thread shows it at once. Rejects on failure. */
  add: (content: string) => Promise<void>;
  /** Edit the viewer's own Comment. The thread shows the edit at once. */
  update: (id: number, content: string) => Promise<void>;
  /** Delete the viewer's own Comment. The thread drops it at once. */
  remove: (id: number) => Promise<void>;
  /** Read the stored text of the viewer's own Comment, for its edit form
   *  (#126). Rejects on failure, and for a Comment the viewer does not own. */
  source: (id: number) => Promise<string>;
}

// Newest first, as the back-end orders a thread (#125): `ctime` descending,
// then `id` descending. It compares `Date.parse`, as the wire trims trailing
// zeros, so string order is not time order. `Date.parse` keeps milliseconds
// only, so a tie inside one millisecond falls to `id`. The back-end sorts by
// microseconds, so its order can differ until the next load.
const newestFirst = (a: CommentView, b: CommentView): number =>
  Date.parse(b.ctime) - Date.parse(a.ctime) || b.id - a.id;

/**
 * The Comment thread of the parent shown (#124, #127): the thread load, the
 * live merge of pushed Events and of the viewer's own writes, and the race
 * guard. One factory serves both Comment targets, the Post and the Caption.
 * The rows live in a store and reconcile by id, so a reload does not recreate
 * them: a row's DOM, and any input in it, survives (`reconcile`).
 *
 * It returns the public thread, `thread`, and `connectFeed`, which holds the
 * thread's Subscription on its target's Channel for the parent shown, while
 * the panel is open (ADR-0028). An upsert adds or edits a row, a removal drops
 * one, and the resync call reloads the thread. With no Feed, as on the
 * anonymous landing page, the thread still loads and writes.
 */
export function createCommentThread(deps: CommentThreadDeps): {
  thread: CommentThreadState;
  /** Hold the thread's Subscription on the Feed (#120): the Channel of the
   *  parent shown, while the panel is open. The caller's scope releases it. */
  connectFeed: (feed: Feed) => void;
} {
  // A memo, so a refetched parent with the same id (a `posts` or
  // `post_caption` poke) does not reload the thread.
  const parentId = createMemo(deps.parentId);
  const { api, target } = deps;
  const guard = deps.guard ?? passThroughGuard;
  const draftScope: DraftScope = createDraftScope(`${target.name}-thread`, deps.parentScope);
  // The parent the panel was opened on. A change of the parent shown closes
  // the panel at once, and the effect clears it, so a return does not reopen it.
  const [openOn, setOpenOn] = deps.openOn ?? createSignal<number>();
  const open = (): boolean => openOn() !== undefined && openOn() === parentId();
  const setOpen = (value: boolean): void => {
    if (value) setOpenOn(parentId());
    else guard.attempt(() => setOpenOn(undefined), draftScope);
  };
  createEffect(on(parentId, () => setOpenOn(undefined), { defer: true }));
  // The parent whose thread is shown: the parent shown while the panel is open.
  const shownParentId = createMemo(() => (open() ? parentId() : undefined));
  // `parentId` names the parent the rows belong to, so a reload for another
  // parent never shows the previous parent's rows.
  const [store, setStore] = createStore<{ parentId?: number; rows: CommentView[] }>({
    rows: [],
  });
  const [error, setError] = createSignal<string>();

  // `loads` drops every load but the latest. `changes` counts the rows changed
  // since a load was sent: a list read before a change may miss it, so that
  // load is not applied, and the thread loads again.
  let loads = 0;
  let changes = 0;
  const load = (id: number): void => {
    const thisLoad = ++loads;
    const changesAtSend = changes;
    api.list(id).then(
      (rows) => {
        if (thisLoad !== loads) return;
        if (changes !== changesAtSend) return load(id);
        batch(() => {
          setError(undefined);
          setStore("parentId", id);
          setStore("rows", reconcile(rows, { key: "id" }));
        });
      },
      () => {
        if (thisLoad === loads) setError("Could not load the Comments");
      },
    );
  };
  // An effect, so the thread loads in the browser only, after hydration. A
  // close drops the load in flight and the rows, so a reopen shows no stale
  // rows, and an Event that comes while closed has no thread to merge into.
  createEffect(
    on(shownParentId, (id) => {
      if (id !== undefined) return load(id);
      loads++;
      setStore({ parentId: undefined, rows: [] });
    }),
  );

  const comments = (): CommentView[] | undefined => {
    const id = shownParentId();
    return id !== undefined && store.parentId === id ? store.rows : undefined;
  };

  const deleted = (id: number): boolean => comments()?.every((c) => c.id !== id) === true;

  // The ids removed while this thread lives. Ids are never reused, so a write
  // response that arrives after its Comment's removal does not bring it back
  // (PR #216 review).
  const removed = new Set<number>();
  // The one merge point for pushed Events and the viewer's own writes: a row
  // id already shown is edited in place, so a push of the viewer's own write
  // never adds it twice. An edit older than the row shown is a late response,
  // so it does not overwrite a newer edit. A new row goes to its place in the
  // newest-first order, so a late push of an older Comment goes below a newer
  // one.
  const upsertRow = (comment: CommentView): void => {
    changes++;
    if (comment.parentId !== store.parentId || removed.has(comment.id)) return;
    const index = store.rows.findIndex((c) => c.id === comment.id);
    if (index !== -1) {
      if (Date.parse(comment.mtime) < Date.parse(store.rows[index].mtime)) return;
      return setStore("rows", index, reconcile(comment));
    }
    const found = store.rows.findIndex((c) => newestFirst(comment, c) < 0);
    const at = found === -1 ? store.rows.length : found;
    setStore("rows", (rows) => [...rows.slice(0, at), comment, ...rows.slice(at)]);
  };
  const removeRow = (id: number): void => {
    changes++;
    removed.add(id);
    setStore("rows", (rows) => rows.filter((c) => c.id !== id));
  };

  // Only the held Channel reaches the handler (ADR-0028), so it needs no
  // check of the target: each upsert kind adds or edits a row, each removal
  // kind drops one, and the resync call reloads the thread.
  const handleEvent: FeedHandler = (event) => {
    if (event === undefined) {
      const id = shownParentId();
      if (id !== undefined) load(id);
      return;
    }
    switch (event.event_type) {
      case "post_comment":
      case "caption_comment":
        upsertRow(toCommentView(event.payload));
        break;
      case "post_comment_removal":
      case "caption_comment_removal":
        removeRow(event.payload.id);
        break;
    }
  };

  const connectFeed = (feed: Feed): void => {
    feed.subscribe(() => {
      const id = shownParentId();
      return id === undefined ? undefined : target.channel(id);
    }, handleEvent);
  };

  const add = async (content: string): Promise<void> => {
    const id = parentId();
    if (id === undefined) return;
    upsertRow(await api.add(id, content));
  };
  const update = async (id: number, content: string): Promise<void> => {
    upsertRow(await api.update(id, content));
  };
  const remove = async (id: number): Promise<void> => {
    await api.remove(id);
    removeRow(id);
  };

  return {
    thread: {
      open,
      setOpen,
      draftScope,
      comments,
      deleted,
      error,
      add,
      update,
      remove,
      source: api.source,
    },
    connectFeed,
  };
}
