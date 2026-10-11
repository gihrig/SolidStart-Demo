import { createSignal, For, Show } from "solid-js";
import { createRpcAction } from "~/lib/createRpcAction";
import { hygieneLength } from "~/lib/hygieneLength";
import type { PostComments } from "~/lib/jedi/createPostComments";
import type { HygieneCaps } from "~/types/backend";
import type { PostComment } from "~/types/jedi";

// Mirrors the back-end cap (`PostCommentBmc::hygiene_rules`), counted the
// back-end's way (`hygieneLength`). `satisfies` pins it to the cap, so a changed
// cap fails `tsc` (ADR-0029); the back-end stays the authoritative check.
const COMMENT_MAX_LENGTH = 2000 satisfies HygieneCaps["post_comment"]["content"];

export interface CommentThreadProps {
  /** The panel's element id, for the toggle's `aria-controls`. */
  id: string;
  /** The selected Post's thread (`createJediFeed().postComments`). */
  thread: Omit<PostComments, "onEvent">;
  /** Only a logged-in User sees the compose box and the Edit / Delete buttons. */
  loggedIn?: boolean;
  /** The logged-in User's id: Edit / Delete show on the User's own Comments
   *  only. This only gates buttons; the back-end owns enforcement. */
  userId?: number;
}

interface ErrorAlertProps {
  error: string | null | undefined;
}

function ErrorAlert(props: ErrorAlertProps) {
  return (
    <Show when={props.error}>
      <div role="alert" class="rounded bg-red-100 p-2 text-red-700 text-sm">
        {props.error}
      </div>
    </Show>
  );
}

interface LengthCountProps {
  id: string;
  length: number;
}

function LengthCount(props: LengthCountProps) {
  return (
    <p
      id={props.id}
      class={`text-right text-sm ${props.length > COMMENT_MAX_LENGTH ? "font-bold text-red-700" : "text-(--theme-muted)"}`}
    >
      {props.length}/{COMMENT_MAX_LENGTH}
    </p>
  );
}

/** Whether a length can be sent: not empty after trim, and within the cap. */
const sendable = (length: number) => length > 0 && length <= COMMENT_MAX_LENGTH;

interface CommentItemProps {
  comment: PostComment;
  thread: CommentThreadProps["thread"];
  isOwner: boolean;
}

/** One Comment: its plain-text body, and, for the Owner, Edit and Delete. */
function CommentItem(props: CommentItemProps) {
  const [editing, setEditing] = createSignal(false);
  const [length, setLength] = createSignal(0);
  const update = createRpcAction(
    async (content: string) => {
      await props.thread.update(props.comment.id, content);
      return true;
    },
    { fallbackError: "Could not edit the Comment" },
  );
  const remove = createRpcAction(
    async () => {
      await props.thread.remove(props.comment.id);
      return true;
    },
    { fallbackError: "Could not delete the Comment" },
  );
  const countId = () => `comment-${props.comment.id}-count`;

  const startEdit = () => {
    setLength(hygieneLength(props.comment.content));
    setEditing(true);
  };
  const handleSave = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!sendable(length())) return;
    const content = new FormData(e.currentTarget as HTMLFormElement).get("content");
    if (await update.run(typeof content === "string" ? content : "")) setEditing(false);
  };

  return (
    <li class="space-y-1 border-b border-(--theme-muted) py-2 last:border-b-0">
      <Show
        when={editing()}
        fallback={
          <div class="flex items-start gap-2">
            <p class="grow whitespace-pre-wrap break-words">{props.comment.content}</p>
            <Show when={props.isOwner}>
              <button
                type="button"
                onClick={startEdit}
                class="theme-button shrink-0"
                aria-label="Edit comment"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove.run(undefined)}
                disabled={remove.pending()}
                class="theme-button shrink-0 disabled:opacity-50"
                aria-label="Delete comment"
              >
                Delete
              </button>
            </Show>
          </div>
        }
      >
        <form onSubmit={handleSave} class="space-y-2">
          <textarea
            name="content"
            rows={3}
            required
            aria-label="Edit your comment"
            aria-describedby={countId()}
            aria-invalid={length() > COMMENT_MAX_LENGTH}
            onInput={(e) => setLength(hygieneLength(e.currentTarget.value))}
            class="theme-input"
          >
            {props.comment.content}
          </textarea>
          <div class="flex items-center justify-end gap-2">
            <LengthCount id={countId()} length={length()} />
            <button
              type="button"
              disabled={update.pending()}
              onClick={() => setEditing(false)}
              class="theme-button disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={update.pending() || !sendable(length())}
              class="theme-button-primary shrink-0 disabled:opacity-50"
            >
              {update.pending() ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Show>
      <ErrorAlert error={update.error() ?? remove.error()} />
    </li>
  );
}

/**
 * A Post's Comment thread (#124), the inline panel in `FeaturedPost`. Everyone
 * reads it; a logged-in User posts, and edits or deletes their own Comments.
 * The body is plain text (author display and markdown land in #125 / #126).
 * The compose box sits outside the list, and the rows come from a store keyed
 * by id, so a live Event or a reload never wipes a draft.
 */
export default function CommentThread(props: CommentThreadProps) {
  const [length, setLength] = createSignal(0);
  const add = createRpcAction(
    async (content: string) => {
      await props.thread.add(content);
      return true;
    },
    { fallbackError: "Could not post the Comment" },
  );
  const countId = () => `${props.id}-count`;
  const composeId = () => `${props.id}-compose`;

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!sendable(length())) return;
    const form = e.currentTarget as HTMLFormElement;
    const content = new FormData(form).get("content");
    if (await add.run(typeof content === "string" ? content : "")) {
      form.reset();
      setLength(0);
    }
  };

  return (
    <section id={props.id} aria-label="Comments" class="mb-4 space-y-2 px-2 text-sm">
      <ErrorAlert error={props.thread.error()} />
      <Show
        when={props.thread.comments()}
        fallback={<p class="text-(--theme-muted)">Loading Comments…</p>}
      >
        {(comments) => (
          <Show
            when={comments().length > 0}
            fallback={<p class="text-(--theme-muted)">No Comments yet</p>}
          >
            <ul>
              <For each={comments()}>
                {(comment) => (
                  <CommentItem
                    comment={comment}
                    thread={props.thread}
                    isOwner={
                      props.loggedIn === true &&
                      props.userId !== undefined &&
                      props.userId === comment.ownerId
                    }
                  />
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
      <Show when={props.loggedIn}>
        <form onSubmit={handleSubmit} class="space-y-2">
          <ErrorAlert error={add.error()} />
          <label for={composeId()} class="block font-medium">
            Your comment
          </label>
          <textarea
            id={composeId()}
            name="content"
            rows={3}
            required
            aria-describedby={countId()}
            aria-invalid={length() > COMMENT_MAX_LENGTH}
            onInput={(e) => setLength(hygieneLength(e.currentTarget.value))}
            class="theme-input"
          />
          <div class="flex items-center justify-end gap-2">
            <LengthCount id={countId()} length={length()} />
            <button
              type="submit"
              disabled={add.pending() || !sendable(length())}
              class="theme-button-primary shrink-0 disabled:opacity-50"
            >
              {add.pending() ? "Posting…" : "Post Comment"}
            </button>
          </div>
        </form>
      </Show>
    </section>
  );
}
