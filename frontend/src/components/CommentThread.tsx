import { batch, createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { DRAFT_DISCARDED_NOTICE } from "~/lib/createDraftGuard";
import { createRpcAction } from "~/lib/createRpcAction";
import { hygieneLength } from "~/lib/hygieneLength";
import type { CommentThreadState } from "~/lib/jedi/createCommentThread";
import { sanitizeCommentHtml } from "~/lib/sanitizeCommentHtml";
import type { HygieneCaps } from "~/types/backend";
import type { CommentView } from "~/types/jedi";
import Avatar from "~/components/Avatar";
import { useDraft } from "~/components/DraftGuardContext";

// Mirrors the back-end caps (`PostCommentBmc::hygiene_rules` and
// `CaptionCommentBmc::hygiene_rules`, #127), counted the back-end's way
// (`hygieneLength`). `satisfies` pins it to both caps, so a change of either
// fails `tsc` (ADR-0029); the back-end stays the authoritative check.
// Two `satisfies`, not one intersection: both caps are the type `2000`, and the
// lint fix drops a redundant intersection member.
const COMMENT_MAX_LENGTH =
  2000 satisfies HygieneCaps["post_comment"]["content"] satisfies HygieneCaps["caption_comment"]["content"];

export interface CommentThreadProps {
  /** The panel's element id; the ids inside the thread derive from it. */
  id: string;
  /** The thread to show (`createCommentThread`). */
  thread: CommentThreadState;
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

// A Comment's time, as absolute local time in the viewer's locale (#125). US
// English shows "Oct 11, 2026, 9:14 AM". The rows load in the browser only,
// after hydration, so the server's locale never applies.
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
  thread: CommentThreadState;
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
 * An edit loads the stored text with `get_post_comment` (#126): the view
 * carries no raw text. Until the text loads, the textarea is disabled and shows
 * "Loading…". A failed load shows the form's alert, and Save stays disabled
 * until a later load succeeds: a save could overwrite a remote edit that the
 * form did not load.
 *
 * It reports its Draft to the app's guard (ADR-0030): a compose box holds one
 * while its text is not blank, and an edit while its text differs from the
 * saved Comment. An edit holds none until its text loads. A remote edit moves
 * the row's `mtime`, so the edit loads the text again: an unchanged edit shows
 * the new text, and a changed one keeps the user's text. An edit's Cancel with
 * a Draft asks first, and Escape is its Cancel; the form reports its write to
 * the guard (#214).
 */
function CommentForm(props: CommentFormProps) {
  const text = () => FORM_TEXT[props.comment ? "edit" : "compose"];
  // The saved text: "" for the compose box; for an edit, the stored text, and
  // undefined until it loads.
  const [saved, setSaved] = createSignal<string | undefined>(props.comment ? undefined : "");
  const [loadError, setLoadError] = createSignal<string>();
  const [value, setValue] = createSignal("");
  const loaded = () => saved() !== undefined;
  const length = createMemo(() => hygieneLength(value()));
  // An effect, so the edit loads its text when it opens, and again when the
  // row's `mtime` moves (Decision 1). Only the latest load applies.
  let loads = 0;
  createEffect(
    on(
      () => props.comment?.mtime,
      () => {
        const comment = props.comment;
        if (!comment) return;
        const thisLoad = ++loads;
        props.thread.source(comment.id).then(
          (next) => {
            if (thisLoad !== loads) return;
            batch(() => {
              if (value() === (saved() ?? "")) setValue(next);
              setSaved(next);
              setLoadError(undefined);
            });
          },
          (e: unknown) => {
            if (thisLoad === loads)
              setLoadError(e instanceof Error ? e.message : "Could not load the Comment");
          },
        );
      },
    ),
  );
  // An edit holds a Draft while its loaded text differs from the saved
  // Comment; the compose box while its text is not blank.
  const dirty = () => (props.comment ? loaded() && value() !== saved() : value().trim() !== "");
  const write = createRpcAction(
    async (content: string) => {
      if (props.comment) await props.thread.update(props.comment.id, content);
      else await props.thread.add(content);
      return true;
    },
    { fallbackError: text().error },
  );
  const draft = useDraft({
    dirty,
    scope: props.thread.draftScope,
    busy: write.pending,
    notice: () =>
      props.comment && props.thread.deleted(props.comment.id)
        ? COMMENT_DELETED_NOTICE
        : DRAFT_DISCARDED_NOTICE,
  });
  const countId = () => `${props.id}-count`;

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!sendable(length())) return;
    if (await write.run(value())) {
      setValue(saved() ?? "");
      props.onClose?.();
    }
  };
  // The edit's Cancel asks first while it holds a Draft, about this form only
  // (#214): the compose box and the other edits share its scope.
  const handleCancel = () => draft.cancel(() => props.onClose?.());
  // Escape is the edit's Cancel; the compose box has no Cancel, so it ignores
  // Escape (#214). The form stops it, so a document listener (`useDismiss`)
  // does not close a menu or the sidebar.
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (!e.isComposing && props.comment && !write.pending()) handleCancel();
  };

  return (
    <form onSubmit={handleSubmit} on:keydown={handleKeyDown} class="space-y-2">
      <ErrorAlert error={write.error() ?? loadError()} />
      <label for={props.id} class={props.comment ? "sr-only" : "block font-medium"}>
        {text().label}
      </label>
      <textarea
        id={props.id}
        name="content"
        rows={3}
        required
        disabled={!loaded()}
        placeholder={loaded() ? undefined : "Loading…"}
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
          disabled={write.pending() || !dirty() || !sendable(length()) || !!loadError()}
          class="theme-button-primary shrink-0 disabled:opacity-50"
        >
          {write.pending() ? text().pending : text().submit}
        </button>
      </div>
    </form>
  );
}

interface CommentItemProps {
  /** The thread's element id. The edit form's id derives from it, so two open
   *  threads never share an id (#127): a Post Comment and a Caption Comment
   *  can have the same Comment id. */
  threadId: string;
  comment: CommentView;
  thread: CommentThreadState;
  isOwner: boolean;
}

/**
 * One Comment, in the chat layout (#125): the avatar in a left column; at its
 * right, the name line and then the body. The name line holds the name, the
 * time, the "(edited)" mark and, for the Owner, Edit and Delete. An open edit
 * replaces only the body, and the buttons hide. The body is the server's
 * sanitized render, injected as HTML only after the `sanitizeCommentHtml`
 * backstop (#126); `.comment-body` styles it.
 */
function CommentItem(props: CommentItemProps) {
  const [editing, setEditing] = createSignal(false);
  // After the edit closes, focus returns to its Edit button (#214).
  let editRef: HTMLButtonElement | undefined;
  const closeEdit = () => {
    setEditing(false);
    editRef?.focus();
  };
  // Only the Owner edits: a logoff closes an open edit.
  const editOpen = () => editing() && props.isOwner;
  // A create writes one time to both; an edit moves `mtime`.
  const edited = () => Date.parse(props.comment.mtime) !== Date.parse(props.comment.ctime);
  const remove = createRpcAction(
    async () => {
      await props.thread.remove(props.comment.id);
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
                ref={(el) => (editRef = el)}
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
          fallback={
            <div
              class="comment-body wrap-break-word"
              innerHTML={sanitizeCommentHtml(props.comment.contentHtml)}
            />
          }
        >
          <CommentForm
            id={`${props.threadId}-comment-${props.comment.id}-edit`}
            thread={props.thread}
            comment={props.comment}
            onClose={closeEdit}
          />
        </Show>
        <ErrorAlert error={remove.error()} />
      </div>
    </li>
  );
}

/**
 * A Post's or a Caption's Comment thread (#124, #127), the content of an
 * inline panel in `FeaturedPost`, which owns the panel element. Everyone reads it; a logged-in
 * User posts, and edits or deletes their own Comments. The thread lists the
 * newest Comment first, so the compose box sits above the list (#125). Each
 * body is rendered markdown (#126). The compose box sits outside
 * the list, and the rows come from a store keyed by id, so a live Event or a
 * reload never wipes a draft.
 */
export default function CommentThread(props: CommentThreadProps) {
  return (
    <>
      <Show when={props.loggedIn}>
        <CommentForm id={`${props.id}-compose`} thread={props.thread} />
      </Show>
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
                    threadId={props.id}
                    comment={comment}
                    thread={props.thread}
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
