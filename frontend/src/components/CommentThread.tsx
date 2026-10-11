import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { DRAFT_DISCARDED_NOTICE } from "~/lib/createDraftGuard";
import { createRpcAction } from "~/lib/createRpcAction";
import { hygieneLength } from "~/lib/hygieneLength";
import type { PostComments } from "~/lib/jedi/createPostComments";
import type { HygieneCaps } from "~/types/backend";
import type { CommentView } from "~/types/jedi";
import Avatar from "~/components/Avatar";
import { useDraft } from "~/components/DraftGuardContext";

// Mirrors the back-end cap (`PostCommentBmc::hygiene_rules`), counted the
// back-end's way (`hygieneLength`). `satisfies` pins it to the cap, so a changed
// cap fails `tsc` (ADR-0029); the back-end stays the authoritative check.
const COMMENT_MAX_LENGTH = 2000 satisfies HygieneCaps["post_comment"]["content"];

export interface CommentThreadProps {
  /** The panel's element id; the ids inside the thread derive from it. */
  id: string;
  /** The selected Post's thread (`createJediFeed().postComments`). */
  postComments: PostComments;
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

// A Comment's time, as absolute local time: "Oct 11, 2026, 9:14 AM" in US
// English (#125). The thread renders in the browser only, so the viewer's
// locale applies.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatTime = (time: string) => TIME_FORMAT.format(new Date(time));
// The `<time datetime>` value. HTML allows at most 3 decimal places of a
// second, and the wire can carry 6.
const isoTime = (time: string) => new Date(time).toISOString();

/** The text of each `CommentForm` mode. */
const FORM_TEXT = {
  compose: {
    label: "Your comment",
    submit: "Post Comment",
    pending: "Posting…",
    error: "Could not post the Comment",
  },
  edit: {
    label: "Edit your comment",
    submit: "Save",
    pending: "Saving…",
    error: "Could not edit the Comment",
  },
} as const;

// The forced-discard notice of an edit whose Comment was deleted (ADR-0030).
const COMMENT_DELETED_NOTICE = "This Comment was deleted. Your unsaved changes were discarded.";

interface CommentFormProps {
  /** The textarea's element id; the count's id derives from it. */
  id: string;
  postComments: PostComments;
  /** The Comment to edit. Without it, the form composes a new Comment. */
  comment?: CommentView;
  /** Called on Cancel, and after a saved write. An edit closes on it. */
  onClose?: () => void;
}

/**
 * The one Comment form: the compose box, and the edit of one Comment. It holds
 * the write as an RPC action, so each form shows its own error. A saved write
 * clears the compose box; an edit closes.
 *
 * It reports its Draft to the app's guard (ADR-0030): a compose box holds one
 * while its text is not blank, and an edit while its text differs from the
 * saved Comment. A remote edit of a Comment the user has not changed shows the
 * new text in the edit.
 */
function CommentForm(props: CommentFormProps) {
  const text = () => FORM_TEXT[props.comment ? "edit" : "compose"];
  const saved = () => props.comment?.content ?? "";
  const [value, setValue] = createSignal(saved());
  const length = createMemo(() => hygieneLength(value()));
  // An effect, as the edit follows an outside change: an unchanged edit takes
  // the new saved text, and a changed one keeps the user's text. The first run
  // has no previous text, so it changes nothing. Not `defer`: a deferred `on`
  // does not record the first input as the previous one.
  createEffect(
    on(saved, (next, previous) => {
      if (value() === previous) setValue(next);
    }),
  );
  // An edit holds a Draft while its text differs from the saved Comment; the
  // compose box while its text is not blank.
  const dirty = () => (props.comment ? value() !== saved() : value().trim() !== "");
  const draft = useDraft({
    dirty,
    scope: props.postComments.draftScope,
    notice: () =>
      props.comment && props.postComments.deleted(props.comment.id)
        ? COMMENT_DELETED_NOTICE
        : DRAFT_DISCARDED_NOTICE,
  });
  const write = createRpcAction(
    async (content: string) => {
      if (props.comment) await props.postComments.update(props.comment.id, content);
      else await props.postComments.add(content);
      return true;
    },
    { fallbackError: text().error },
  );
  const countId = () => `${props.id}-count`;

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!sendable(length())) return;
    if (await write.run(value())) {
      setValue(saved());
      props.onClose?.();
    }
  };
  const handleCancel = () => {
    draft.clear();
    props.onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-2">
      <ErrorAlert error={write.error()} />
      <label for={props.id} class={props.comment ? "sr-only" : "block font-medium"}>
        {text().label}
      </label>
      <textarea
        id={props.id}
        name="content"
        rows={3}
        required
        aria-describedby={countId()}
        aria-invalid={length() > COMMENT_MAX_LENGTH}
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        class="theme-input"
      />
      <div class="flex items-center justify-end gap-2">
        <LengthCount id={countId()} length={length()} />
        <Show when={props.comment}>
          <button
            type="button"
            disabled={write.pending()}
            onClick={handleCancel}
            class="theme-button disabled:opacity-50"
          >
            Cancel
          </button>
        </Show>
        <button
          type="submit"
          disabled={write.pending() || !dirty() || !sendable(length())}
          class="theme-button-primary shrink-0 disabled:opacity-50"
        >
          {write.pending() ? text().pending : text().submit}
        </button>
      </div>
    </form>
  );
}

interface CommentItemProps {
  comment: CommentView;
  postComments: PostComments;
  isOwner: boolean;
}

/**
 * One Comment, in the chat layout (#125): the avatar in a left column; at its
 * right, the name line and then the body. The name line holds the name, the
 * time, the "(edited)" mark and, for the Owner, Edit and Delete. An open edit
 * replaces only the body, and the buttons hide. The body is a text node, never
 * HTML: `content` is the raw text.
 */
function CommentItem(props: CommentItemProps) {
  const [editing, setEditing] = createSignal(false);
  // Only the Owner edits: a logoff closes an open edit.
  const editOpen = () => editing() && props.isOwner;
  // A create writes one time to both; an edit moves `mtime`.
  const edited = () => Date.parse(props.comment.mtime) !== Date.parse(props.comment.ctime);
  const remove = createRpcAction(
    async () => {
      await props.postComments.remove(props.comment.id);
      return true;
    },
    { fallbackError: "Could not delete the Comment" },
  );

  return (
    <li class="flex gap-2 border-b border-(--theme-muted) py-2 last:border-b-0">
      <div class="shrink-0">
        <Avatar
          src={props.comment.author.avatarUrl}
          name={props.comment.author.name}
          alt=""
          data-testid="comment-initials"
        />
      </div>
      <div class="min-w-0 grow space-y-1">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <span class="font-bold">{props.comment.author.name}</span>
          <time datetime={isoTime(props.comment.ctime)} class="text-sm text-(--theme-muted)">
            {formatTime(props.comment.ctime)}
          </time>
          <Show when={edited()}>
            <span
              title={`Edited ${formatTime(props.comment.mtime)}`}
              class="text-sm text-(--theme-muted)"
            >
              (edited)
            </span>
          </Show>
          <Show when={props.isOwner && !editOpen()}>
            <div class="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                class="theme-button"
                aria-label="Edit comment"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove.run(undefined)}
                disabled={remove.pending()}
                class="theme-button disabled:opacity-50"
                aria-label="Delete comment"
              >
                Delete
              </button>
            </div>
          </Show>
        </div>
        <Show
          when={editOpen()}
          fallback={<p class="whitespace-pre-wrap break-words">{props.comment.content}</p>}
        >
          <CommentForm
            id={`comment-${props.comment.id}-edit`}
            postComments={props.postComments}
            comment={props.comment}
            onClose={() => setEditing(false)}
          />
        </Show>
        <ErrorAlert error={remove.error()} />
      </div>
    </li>
  );
}

/**
 * A Post's Comment thread (#124), the content of the inline panel in
 * `FeaturedPost`, which owns the panel element. Everyone reads it; a logged-in
 * User posts, and edits or deletes their own Comments. The thread lists the
 * newest Comment first, so the compose box sits above the list (#125). The
 * body is plain text (markdown lands in #126). The compose box sits outside
 * the list, and the rows come from a store keyed by id, so a live Event or a
 * reload never wipes a draft.
 */
export default function CommentThread(props: CommentThreadProps) {
  return (
    <>
      <Show when={props.loggedIn}>
        <CommentForm id={`${props.id}-compose`} postComments={props.postComments} />
      </Show>
      <ErrorAlert error={props.postComments.error()} />
      <Show
        when={props.postComments.comments()}
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
                    postComments={props.postComments}
                    isOwner={
                      props.loggedIn === true &&
                      props.userId !== undefined &&
                      props.userId === comment.author.id
                    }
                  />
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
    </>
  );
}
