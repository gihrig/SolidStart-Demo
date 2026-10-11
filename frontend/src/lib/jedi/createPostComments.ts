import { batch, createEffect, createMemo, createSignal, on, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { jediApi, toPostComment, type JediApi } from "~/lib/jedi/jedi-api";
import type { FeedHandler } from "~/lib/feed";
import type { PostComment } from "~/types/jedi";

/** The inputs of one Comment thread: the Post shown, and its back-end calls. */
export interface PostCommentsDeps {
  /** The id of the Post shown; undefined for none. */
  postId: Accessor<number | undefined>;
  /** The Comment calls. Defaults to the real `jediApi.comments`; a test
   *  injects an in-memory stand-in (the inject-or-default idiom). */
  api?: JediApi["comments"];
}

/** The selected Post's Comment thread (#124), and its actions. */
export interface PostComments {
  /** The selected Post's Comments, oldest first. Undefined while they load, and
   *  while no Post is selected. Each row keeps its identity across a reload. */
  comments: Accessor<PostComment[] | undefined>;
  /** A thread load failure, else undefined. */
  error: Accessor<string | undefined>;
  /** Add a Comment to the selected Post. Resolves once the back-end has
   *  committed it, and the thread shows it at once. Rejects on failure. */
  add: (content: string) => Promise<void>;
  /** Edit the viewer's own Comment. The thread shows the edit at once. */
  update: (id: number, content: string) => Promise<void>;
  /** Delete the viewer's own Comment. The thread drops it at once. */
  remove: (id: number) => Promise<void>;
}

/**
 * The Comment thread of the selected Post (#124): the thread load, the live
 * merge of pushed Events and of the viewer's own writes, and the race guard.
 * The rows live in a store and reconcile by id, so a reload does not recreate
 * them: a row's DOM, and any input in it, survives (`reconcile`).
 *
 * It returns the public thread, `postComments`, and its Feed handler,
 * `onEvent`. Only `createJediFeed` holds `onEvent`, for the Subscription on the
 * selected Post's `post_comment` Channel. An upsert adds or edits a row, a
 * removal drops one, and the resync call reloads the thread.
 */
export function createPostComments(deps: PostCommentsDeps): {
  postComments: PostComments;
  onEvent: FeedHandler;
} {
  // A memo, so a refetched Post with the same id (a `posts` poke) does not
  // reload the thread.
  const postId = createMemo(deps.postId);
  const api = deps.api ?? jediApi.comments;
  // `postId` names the Post the rows belong to, so a reload for another Post
  // never shows the previous Post's rows.
  const [thread, setThread] = createStore<{ postId?: number; rows: PostComment[] }>({
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
          setThread("postId", id);
          setThread("rows", reconcile(rows, { key: "id" }));
        });
      },
      () => {
        if (thisLoad === loads) setError("Could not load the Comments");
      },
    );
  };
  // An effect, so the thread loads in the browser only, after hydration.
  createEffect(
    on(postId, (id) => {
      if (id === undefined) loads++;
      else load(id);
    }),
  );

  const comments = (): PostComment[] | undefined => {
    const id = postId();
    return id !== undefined && thread.postId === id ? thread.rows : undefined;
  };

  // The one merge point for pushed Events and the viewer's own writes: a row
  // id already shown is edited in place, so a push of the viewer's own write
  // never adds it twice.
  const upsertRow = (comment: PostComment): void => {
    changes++;
    if (comment.postId !== thread.postId) return;
    const index = thread.rows.findIndex((c) => c.id === comment.id);
    if (index === -1) setThread("rows", thread.rows.length, comment);
    else setThread("rows", index, reconcile(comment));
  };
  const removeRow = (id: number): void => {
    changes++;
    setThread("rows", (rows) => rows.filter((c) => c.id !== id));
  };

  const onEvent: FeedHandler = (event) => {
    if (event === undefined) {
      const id = postId();
      if (id !== undefined) load(id);
    } else if (event.event_type === "post_comment") {
      upsertRow(toPostComment(event.payload));
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

  return { postComments: { comments, error, add, update, remove }, onEvent };
}
