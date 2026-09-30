import { createEffect, createSignal, on, Show } from "solid-js";
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
  /** Passed through to the form (the inject-or-default idiom). */
  api?: AddCaptionFormProps["api"];
}

/**
 * The caption line on a Post (#121): it shows the caption, or the caption-submit
 * form in the same place. A logged-in User sees an Add Caption button beside the
 * caption; a click swaps the caption for the form, and Cancel or a commit swaps
 * it back. A Post with no caption shows the form directly — but only once its
 * captions have loaded, so the form never flashes during a load.
 */
export default function PostCaption(props: PostCaptionProps) {
  const [adding, setAdding] = createSignal(false);
  let addButtonRef: HTMLButtonElement | undefined;

  // A new Post starts on its caption, not on a form left open for the last one.
  createEffect(
    on(
      () => props.postId,
      () => setAdding(false),
      { defer: true },
    ),
  );

  const showForm = () => props.canAdd && (adding() || (props.captionsLoaded && !props.caption));
  // Return focus to the button the form replaced.
  const close = () => {
    setAdding(false);
    addButtonRef?.focus();
  };

  return (
    <div class="mb-10 px-4">
      <Show
        when={showForm()}
        fallback={
          <div class="flex items-start justify-between gap-4">
            <p class="text-5xl font-hero">{props.caption?.text ?? ""}</p>
            <Show when={props.canAdd && props.caption}>
              <button
                ref={(el) => (addButtonRef = el)}
                type="button"
                onClick={() => setAdding(true)}
                class="theme-button shrink-0"
              >
                Add Caption
              </button>
            </Show>
          </div>
        }
      >
        {/* Keyed on the Post id, so a new selection starts a fresh draft; a poke
            refetch keeps the id, so it never clears a draft mid-typing. */}
        <Show when={props.postId} keyed>
          {(postId) => (
            <AddCaptionForm
              postId={postId}
              api={props.api}
              autofocus={adding()}
              onAdded={close}
              onCancel={props.caption ? close : undefined}
            />
          )}
        </Show>
      </Show>
    </div>
  );
}
