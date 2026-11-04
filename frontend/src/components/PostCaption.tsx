import { Match, Show, Switch } from "solid-js";
import type { DraftScope } from "~/lib/createDraftGuard";
import type { CaptionView } from "~/types/jedi";
import CaptionForm from "~/components/CaptionForm";
import { DraftScopeContext } from "~/components/DraftGuardContext";

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
  /** Called when the add form starts a Draft (#271). The owner then sets
   *  `adding`, so a Caption that arrives does not close the form. */
  onAddDraft?: () => void;
  /** Add a Caption with `text` to the Post `postId` (#283). Rejects on
   *  failure. */
  onAdd?: (postId: number, text: string) => Promise<unknown>;
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
  /** The Caption scope (#271): the Caption edit reports its Draft in it. The
   *  add form reports in the scope where the line mounts, the Post scope. */
  captionScope: DraftScope;
}

/**
 * The Caption line on the Post card (#121), full width: it shows the caption, or
 * the caption-submit form in the same place. The owner holds `adding` (its Add
 * Caption button sits in the Caption actions). A Post with no caption shows the
 * form directly — but only once its captions have loaded, so the form never
 * flashes during a load. At its first Draft, that form becomes an opened Add
 * Caption form, as after a click on Add (#271): a Caption that arrives then
 * does not close it. Without a Draft, the Caption replaces it. The Owner's
 * Caption edit (#187) takes the place of the Caption text, keyed on the
 * Caption id, so a refetch keeps its text.
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
            <DraftScopeContext.Provider value={props.captionScope}>
              <CaptionForm
                caption={props.caption}
                autofocus
                onSave={(text) => props.onSaveEdit?.(id, text) ?? Promise.resolve()}
                onSaved={props.onEditClose}
                onCancel={props.onEditClose}
              />
            </DraftScopeContext.Provider>
          )}
        </Match>
        <Match when={showForm()}>
          {/* Keyed on the Post id, so a new selection starts a fresh draft; a poke
              refetch keeps the id, so it never clears a draft mid-typing. */}
          <Show when={props.postId} keyed>
            {(postId) => (
              <CaptionForm
                autofocus={props.adding}
                onDraft={props.onAddDraft}
                onSave={(text) => props.onAdd?.(postId, text) ?? Promise.resolve()}
                onSaved={props.onClose}
                onCancel={onCancel()}
              />
            )}
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
