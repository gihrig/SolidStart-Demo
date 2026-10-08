import { Show } from "solid-js";
import type { CaptionView } from "~/types/jedi";
import AddCaptionForm, { type AddCaptionFormProps } from "~/components/AddCaptionForm";

export interface PostCaptionProps {
  /** The Post the caption belongs to. */
  postId: number;
  /** The caption shown on the Post; undefined while loading or when it has none. */
  caption?: CaptionView;
  /** False while the Post's captions load, so a missing caption is not yet "none". */
  captionsLoaded: boolean;
  /** Whether the viewer may add a Caption (a logged-in User). */
  canAdd: boolean;
  /** True once the viewer has asked to add a Caption (the Add Caption button). */
  adding: boolean;
  /** Called when the form closes: on Cancel, or once the back-end commits. */
  onClose: () => void;
  /** Passed through to the form (the inject-or-default idiom). */
  api?: AddCaptionFormProps["api"];
}

/**
 * The caption line on a Post (#121), full width: it shows the caption, or the
 * caption-submit form in the same place. The owner holds `adding` (its Add
 * Caption button sits on the categories line). A Post with no caption shows the
 * form directly — but only once its captions have loaded, so the form never
 * flashes during a load.
 */
export default function PostCaption(props: PostCaptionProps) {
  const showForm = () => props.canAdd && (props.adding || (props.captionsLoaded && !props.caption));
  // A function, not a ternary in the JSX prop: the compiler wraps a ternary
  // prop's condition in a memo on each read, and the form reads `onCancel` in
  // its click handler, which has no owner, so each Cancel leaked one memo.
  const onCancel = () => (props.caption ? props.onClose : undefined);

  return (
    <div class="mb-10 px-4">
      <Show
        when={showForm()}
        fallback={<p class="text-5xl font-hero">{props.caption?.text ?? ""}</p>}
      >
        {/* Keyed on the Post id, so a new selection starts a fresh draft; a poke
            refetch keeps the id, so it never clears a draft mid-typing. */}
        <Show when={props.postId} keyed>
          {(postId) => (
            <AddCaptionForm
              postId={postId}
              api={props.api}
              autofocus={props.adding}
              onAdded={props.onClose}
              onCancel={onCancel()}
            />
          )}
        </Show>
      </Show>
    </div>
  );
}
