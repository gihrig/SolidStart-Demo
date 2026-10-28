import { batch, createEffect, createMemo, createSignal, For, on, onMount, Show } from "solid-js";
import { DRAFT_DISCARDED_NOTICE } from "~/lib/createDraftGuard";
import { createRpcAction } from "~/lib/createRpcAction";
import { hygieneLength } from "~/lib/hygieneLength";
import { isImeKey } from "~/lib/isImeKey";
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
  /** The compose box's heading, which names its text field (#210): "Post
   *  Comment" or "Caption Comment". */
  composeLabel: string;
  /** Close the panel that holds the thread, as its toggle does (#210). Escape
   *  in the empty compose box calls it. */
  onClosePanel?: () => void;
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

/** Whether a plain Enter submits a Comment form (#246). With a touch pointer,
 *  Enter adds a new line, and only the button submits. The server cannot know
 *  the pointer, so it is false until mount. */
function useEnterSubmits() {
  const [enterSubmits, setEnterSubmits] = createSignal(false);
  onMount(() => setEnterSubmits(!window.matchMedia("(pointer: coarse)").matches));
  return enterSubmits;
}

/** The text of each `CommentForm` mode. The compose box's heading comes from
 *  the thread's owner (#210). */
const FORM_TEXT = {
  compose: {
    submit: "Add Comment",
    pending: "Adding…",
    error: "Could not add the Comment",
    hint: "Enter = add Comment. Shift+Enter = new line.",
  },
  edit: {
    label: "Edit your comment",
    submit: "Save",
    pending: "Saving…",
    error: "Could not edit the Comment",
    hint: "Enter = save. Shift+Enter = new line.",
  },
} as const;

// The forced-discard notice of an edit whose Comment was deleted (ADR-0030).
const COMMENT_DELETED_NOTICE = "This Comment was deleted. Your unsaved changes were discarded.";

interface CommentFormProps {
  /** The textarea's element id; the count's id derives from it. */
  id: string;
  thread: CommentThreadState;
  /** The compose box's heading (#210). An edit has its own hidden label. */
  label?: string;
  /** The Comment to edit. Without it, the form composes a new Comment. */
  comment?: CommentView;
  /** Called on an edit's Cancel, and after a saved write. An edit closes on
   *  it. */
  onClose?: () => void;
  /** The compose box's: close the Comments panel (#210). */
  onClosePanel?: () => void;
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
 * the new text, and a changed one keeps the user's text. A Cancel with a Draft
 * asks first, and Escape is the Cancel; the form reports its write to the
 * guard (#214). An edit's Cancel closes it. The compose box stays, so its
 * Cancel empties it (#210).
 */
function CommentForm(props: CommentFormProps) {
  const text = () => FORM_TEXT[props.comment ? "edit" : "compose"];
  let textRef: HTMLTextAreaElement | undefined;
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
  const hintId = () => `${props.id}-hint`;
  // The submit button and the Enter key both obey it (#246).
  const canSubmit = () => !write.pending() && dirty() && sendable(length()) && !loadError();
  const enterSubmits = useEnterSubmits();

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!canSubmit()) return;
    if (await write.run(value())) {
      setValue(saved() ?? "");
      props.onClose?.();
    }
  };
  // The Cancel asks first while the form holds a Draft, about this form only
  // (#214): the compose box and the edits share one scope. The compose box's
  // Cancel empties it, and focus moves to its text field (#210).
  const handleCancel = () =>
    draft.cancel(() => {
      if (props.comment) props.onClose?.();
      else {
        setValue("");
        textRef?.focus();
      }
    });
  // The Cancel is disabled while the form writes, and the compose box's while
  // it is empty (#210).
  const composeEmpty = () => !props.comment && value() === "";
  const cancelDisabled = () => write.pending() || composeEmpty();
  // Escape is the Cancel (#214). In the empty compose box, it closes the
  // Comments panel instead, as the toggle does (#210). While the form writes,
  // it does nothing. The form stops it, so a document listener (`useDismiss`)
  // does not close a menu or the sidebar. An Escape that acts also cancels the
  // browser's own Escape action, which would close the question that the
  // action opens (#210).
  //
  // A plain Enter in the text field submits, and Shift+Enter adds a new line
  // (#246). If the form cannot submit, the Enter does nothing. An IME's Enter,
  // a modified Enter, any Enter with a touch pointer, and a button's Enter
  // keep the browser's own action.
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.target !== textRef || !enterSubmits() || isImeKey(e)) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (canSubmit()) (e.currentTarget as HTMLFormElement).requestSubmit();
      return;
    }
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (e.isComposing || write.pending()) return;
    const act = composeEmpty() ? props.onClosePanel : handleCancel;
    if (!act) return;
    e.preventDefault();
    act();
  };

  return (
    <form onSubmit={handleSubmit} on:keydown={handleKeyDown} class="space-y-2">
      <ErrorAlert error={write.error() ?? loadError()} />
      <label for={props.id} class={props.comment ? "sr-only" : "block font-medium"}>
        {props.comment ? FORM_TEXT.edit.label : props.label}
      </label>
      <textarea
        ref={(el) => (textRef = el)}
        id={props.id}
        name="content"
        rows={3}
        required
        disabled={!loaded()}
        placeholder={loaded() ? undefined : "Loading…"}
        aria-describedby={enterSubmits() ? `${hintId()} ${countId()}` : countId()}
        aria-invalid={length() > COMMENT_MAX_LENGTH}
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        class="theme-input text-base"
      />
      <div class="flex items-center justify-end gap-2">
        <Show when={enterSubmits()}>
          <p id={hintId()} class="mr-auto text-sm text-(--theme-muted)">
            {text().hint}
          </p>
        </Show>
        <LengthCount id={countId()} length={length()} />
        <button
          type="button"
          disabled={cancelDisabled()}
          onClick={handleCancel}
          class="theme-button disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit()}
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
      <Avatar
        src={props.comment.author.avatarUrl}
        name={props.comment.author.name}
        alt=""
        data-testid="comment-initials"
      />
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
        <CommentForm
          id={`${props.id}-compose`}
          thread={props.thread}
          label={props.composeLabel}
          onClosePanel={props.onClosePanel}
        />
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
