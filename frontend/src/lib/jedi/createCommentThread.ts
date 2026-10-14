import { batch, createEffect, createMemo, createSignal, on, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { passThroughGuard, type DraftGuard, type DraftScope } from "~/lib/createDraftGuard";
import { jediApi, toCommentView, type JediApi } from "~/lib/jedi/jedi-api";
import type { FeedHandler } from "~/lib/feed";
import type { CommentView } from "~/types/jedi";

/** The inputs of one Comment thread: the Post shown, and its back-end calls. */
export interface CommentThreadDeps {
  /** The id of the Post shown; undefined for none. */
  postId: Accessor<number | undefined>;
  /** The Comment calls. Defaults to the real `jediApi.comments`; a test
   *  injects an in-memory stand-in (the inject-or-default idiom). */
  api?: JediApi["comments"];
  /** The app's Draft guard (ADR-0030). Defaults to the pass-through guard,
   *  which runs each move at once. */
  guard?: DraftGuard;
}

/** The selected Post's Comment thread (#124), and its actions. */
export interface CommentThreadState {
  /** Whether the Comments panel is open. The thread loads only while it is
   *  open: a closed panel makes no read and merges no Event. A change of the
   *  selected Post closes it. */
  open: Accessor<boolean>;
  /** Open or close the Comments panel on the selected Post. A close unmounts
   *  the panel's forms, so it goes through the Draft guard, in `draftScope`. */
  setOpen: (open: boolean) => void;
  /** The scope of the panel's forms (ADR-0030): a close asks only about their
   *  Drafts. */
  draftScope: DraftScope;
  /** The selected Post's Comments, newest first. Undefined while they load,
   *  while the panel is closed, and while no Post is selected. Each row keeps
   *  its identity across a reload. */
  comments: Accessor<CommentView[] | undefined>;
  /** Whether the shown thread dropped the Comment: the thread is loaded and
   *  does not list it. False while no thread shows. */
  deleted: (id: number) => boolean;
  /** A thread load failure, else undefined. */
  error: Accessor<string | undefined>;
  /** Add a Comment to the selected Post. Resolves once the back-end has
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
 * The Comment thread of the selected Post (#124): the thread load, the live
 * merge of pushed Events and of the viewer's own writes, and the race guard.
 * The rows live in a store and reconcile by id, so a reload does not recreate
 * them: a row's DOM, and any input in it, survives (`reconcile`).
 *
 * It returns the public thread, `thread`, and its Feed handler,
 * `onEvent`. Only `createJediFeed` holds `onEvent`, for the Subscription on the
 * selected Post's `post_comment` Channel. An upsert adds or edits a row, a
 * removal drops one, and the resync call reloads the thread.
 */
export function createCommentThread(deps: CommentThreadDeps): {
  thread: CommentThreadState;
  onEvent: FeedHandler;
} {
  // A memo, so a refetched Post with the same id (a `posts` poke) does not
  // reload the thread.
  const postId = createMemo(deps.postId);
  const api = deps.api ?? jediApi.comments;
  const guard = deps.guard ?? passThroughGuard;
  const draftScope: DraftScope = Symbol("post-comments");
  // The Post the panel was opened on. A change of the selected Post closes the
  // panel at once, and the effect clears it, so a return does not reopen it.
  const [openOn, setOpenOn] = createSignal<number>();
  const open = (): boolean => openOn() !== undefined && openOn() === postId();
  const setOpen = (value: boolean): void => {
    if (value) setOpenOn(postId());
    else guard.attempt(() => setOpenOn(undefined), draftScope);
  };
  createEffect(on(postId, () => setOpenOn(undefined), { defer: true }));
  // The Post whose thread is shown: the selected Post while the panel is open.
  const shownPostId = createMemo(() => (open() ? postId() : undefined));
  // `postId` names the Post the rows belong to, so a reload for another Post
  // never shows the previous Post's rows.
  const [store, setStore] = createStore<{ postId?: number; rows: CommentView[] }>({
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
    api.listForPost(id).then(
      (rows) => {
        if (thisLoad !== loads) return;
        if (changes !== changesAtSend) return load(id);
        batch(() => {
          setError(undefined);
          setStore("postId", id);
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
    on(shownPostId, (id) => {
      if (id !== undefined) return load(id);
      loads++;
      setStore({ postId: undefined, rows: [] });
    }),
  );

  const comments = (): CommentView[] | undefined => {
    const id = shownPostId();
    return id !== undefined && store.postId === id ? store.rows : undefined;
  };

  const deleted = (id: number): boolean => comments()?.every((c) => c.id !== id) === true;

  // The one merge point for pushed Events and the viewer's own writes: a row
  // id already shown is edited in place, so a push of the viewer's own write
  // never adds it twice. A new row goes to its place in the newest-first
  // order, so a late push of an older Comment goes below a newer one.
  const upsertRow = (comment: CommentView): void => {
    changes++;
    if (comment.parentId !== store.postId) return;
    const index = store.rows.findIndex((c) => c.id === comment.id);
    if (index !== -1) return setStore("rows", index, reconcile(comment));
    const found = store.rows.findIndex((c) => newestFirst(comment, c) < 0);
    const at = found === -1 ? store.rows.length : found;
    setStore("rows", (rows) => [...rows.slice(0, at), comment, ...rows.slice(at)]);
  };
  const removeRow = (id: number): void => {
    changes++;
    setStore("rows", (rows) => rows.filter((c) => c.id !== id));
  };

  const onEvent: FeedHandler = (event) => {
    if (event === undefined) {
      const id = shownPostId();
      if (id !== undefined) load(id);
    } else if (event.event_type === "post_comment") {
      upsertRow(toCommentView(event.payload));
    } else if (event.event_type === "post_comment_removal") {
      removeRow(event.payload.id);
    }
  };

  const add = async (content: string): Promise<void> => {
    const id = postId();
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
    onEvent,
  };
}
