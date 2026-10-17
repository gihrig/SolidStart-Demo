import { createEffect, createSignal, on, Show } from "solid-js";
import type { AuthorRef } from "~/types/jedi";
import ConfirmDialog from "~/components/ConfirmDialog";

// The delete question's addition when the delete discards a Draft (#187, T3).
const DRAFT_WARNING = "Your unsaved changes will be discarded.";

export interface OwnerActionsProps {
  /** What the actions act on, in the button labels: "Post" or "caption". */
  noun: string;
  /** The author of the Post or the Caption; undefined when there is none yet. */
  author?: AuthorRef;
  /** Only a logged-in User sees the buttons; a visitor sees none. */
  loggedIn?: boolean;
  /** The logged-in User's id; undefined when logged out or still loading. */
  userId?: number;
  /** The id of the Post or the Caption shown. The delete question records it,
   *  and a change of it closes the question (PR #216 review). */
  subjectId?: number;
  /** The delete question, which names what the delete removes (#187). */
  deleteQuestion?: string;
  /** Whether the delete would discard a Draft; read when the question opens.
   *  The question then says so. */
  deleteDiscardsDraft?: () => boolean;
  /** Called when the Owner confirms the delete, with the id asked about. */
  onDelete?: (id: number) => void;
  /** Disables Delete, such as while a delete runs. */
  deleteDisabled?: boolean;
  /** Called when the Owner clicks Edit (#187). */
  onEdit?: () => void;
  /** Disables Edit, such as while another form is open in the line. */
  editDisabled?: boolean;
  /** The Edit button, which takes focus back after an edit closes. */
  editRef?: (el: HTMLButtonElement) => void;
}

/**
 * Edit and Delete (#123). A logged-in User always sees both; they are enabled
 * only for the Owner, and stay disabled until the viewer's id loads. This only
 * gates buttons; the back-end owns enforcement. Delete asks first (#187), with
 * "Cancel" the default; Escape cancels. The question exists only while it is
 * open, and focus then returns to Delete. It is about one subject: a change of
 * the subject shown, such as a live re-rank, closes it. Edit calls `onEdit`
 * (#187).
 */
export default function OwnerActions(props: OwnerActionsProps) {
  const isOwner = () => props.userId !== undefined && props.userId === props.author?.id;
  const label = (action: string) =>
    props.author ? `${action} ${props.noun} by ${props.author.name}` : `${action} ${props.noun}`;
  // The question while it is open, with the subject it asks about, else
  // undefined.
  const [question, setQuestion] = createSignal<{ message: string; id: number }>();
  let deleteRef: HTMLButtonElement | undefined;
  const close = () => {
    setQuestion(undefined);
    deleteRef?.focus();
  };
  const ask = () => {
    const id = props.subjectId;
    if (id === undefined) return;
    const base = props.deleteQuestion ?? `Delete this ${props.noun}?`;
    const message = props.deleteDiscardsDraft?.() ? `${base} ${DRAFT_WARNING}` : base;
    setQuestion({ message, id });
  };
  const confirmDelete = () => {
    const asked = question();
    close();
    if (asked) props.onDelete?.(asked.id);
  };
  createEffect(
    on(
      () => props.subjectId,
      () => {
        if (question()) close();
      },
      { defer: true },
    ),
  );

  return (
    <Show when={props.loggedIn}>
      <button
        ref={props.editRef}
        type="button"
        onClick={() => props.onEdit?.()}
        disabled={!isOwner() || props.editDisabled}
        class="theme-button disabled:opacity-50"
        aria-label={label("Edit")}
      >
        Edit
      </button>
      <button
        ref={(el) => (deleteRef = el)}
        type="button"
        onClick={ask}
        disabled={!isOwner() || props.deleteDisabled}
        class="theme-button disabled:opacity-50"
        aria-label={label("Delete")}
      >
        Delete
      </button>
      <Show when={question()}>
        {(asked) => (
          <ConfirmDialog
            open
            message={asked().message}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            onConfirm={confirmDelete}
            onCancel={close}
          />
        )}
      </Show>
    </Show>
  );
}
