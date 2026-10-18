import { Match, Show, Switch } from "solid-js";
import type { DraftScope } from "~/lib/createDraftGuard";
import type { CaptionView } from "~/types/jedi";
import CaptionForm, { type CaptionFormProps } from "~/components/CaptionForm";

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
  api?: CaptionFormProps["api"];
  /** The line's element, which takes focus after the Owner's Caption delete
   *  (#187). */
  ref?: (el: HTMLDivElement) => void;
  /** True while the Owner's Caption edit is open (#187): the edit form takes
   *  the place of the Caption text. */
  editing?: boolean;
  /** Save the edited text of the Caption `id`. Rejects on failure. */
  onSaveEdit?: (id: number, text: string) => Promise<void>;
  /** Called when the edit closes: on Cancel, or once the save commits. */
  onEditClose?: () => void;
  /** The scope of the edit's Draft (ADR-0030). */
  editScope?: DraftScope;
  /** The scope of the add form's Draft (#214). */
  addScope?: DraftScope;
}

/**
 * The caption line on a Post (#121), full width: it shows the caption, or the
 * caption-submit form in the same place. The owner holds `adding` (its Add
 * Caption button sits on the categories line). A Post with no caption shows the
 * form directly — but only once its captions have loaded, so the form never
 * flashes during a load. The Owner's Caption edit (#187) takes the place of the
 * Caption text, keyed on the Caption id, so a refetch keeps its text.
 */
export default function PostCaption(props: PostCaptionProps) {
  const showForm = () => props.canAdd && (props.adding || (props.captionsLoaded && !props.caption));
  // A function, not a ternary in the JSX prop: the compiler wraps a ternary
  // prop's condition in a memo on each read, and the form reads `onCancel` in
  // its click handler, which has no owner, so each Cancel leaked one memo.
  const onCancel = () => (props.caption ? props.onClose : undefined);

  return (
    <div ref={props.ref} tabindex="-1" class="mb-10 px-4">
      <Switch fallback={<p class="text-5xl font-hero">{props.caption?.text ?? ""}</p>}>
        <Match when={props.editing && props.caption?.id} keyed>
          {(id) => (
            <CaptionForm
              postId={props.postId}
              caption={props.caption}
              autofocus
              draftScope={props.editScope}
              onSave={(text) => props.onSaveEdit?.(id, text) ?? Promise.resolve()}
              onSaved={props.onEditClose}
              onCancel={props.onEditClose}
            />
          )}
        </Match>
        <Match when={showForm()}>
          {/* Keyed on the Post id, so a new selection starts a fresh draft; a poke
              refetch keeps the id, so it never clears a draft mid-typing. */}
          <Show when={props.postId} keyed>
            {(postId) => (
              <CaptionForm
                postId={postId}
                api={props.api}
                autofocus={props.adding}
                draftScope={props.addScope}
                onAdded={props.onClose}
                onCancel={onCancel()}
              />
            )}
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
