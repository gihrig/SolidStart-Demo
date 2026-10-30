import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import type { DraftScope } from "~/lib/createDraftGuard";
import { createRpcAction } from "~/lib/createRpcAction";
import { hygieneLength } from "~/lib/hygieneLength";
import { isImeKey } from "~/lib/isImeKey";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";
import type { HygieneCaps } from "~/types/backend";
import type { CaptionView } from "~/types/jedi";
import { useDraft } from "~/components/DraftGuardContext";

// Mirrors the back-end cap (`CaptionBmc::hygiene_rules`), counted the back-end's
// way (`hygieneLength`). `satisfies` pins it to the cap, so a changed cap fails
// `tsc` (ADR-0029); the back-end stays the authoritative check.
const CAPTION_MAX_LENGTH = 36 satisfies HygieneCaps["caption"]["text"];

/** The text of each mode (#187). */
const MODE_TEXT = {
  add: {
    id: "add-caption",
    label: "Your caption",
    submit: "Add Caption",
    pending: "Adding…",
    error: "Could not add the Caption",
  },
  edit: {
    id: "edit-caption",
    label: "Edit your caption",
    submit: "Save",
    pending: "Saving…",
    error: "Could not edit the Caption",
  },
} as const;

export interface CaptionFormProps {
  /** The Post the Caption competes on. */
  postId: number;
  /** Called with the new Caption once the back-end has committed it. */
  onAdded?: (caption: CaptionView) => void;
  /** When given, the form offers a Cancel button that calls it. */
  onCancel?: () => void;
  /** Focus the input on mount — set when a click opened the form. */
  autofocus?: boolean;
  /** The Jedi seam slice the form uses. Defaults to the real `jediApi`; a test
   *  injects an in-memory stand-in (the inject-or-default idiom). */
  api?: { captions: Pick<JediApi["captions"], "add"> };
  /** The Caption to edit (#187). With it, the form is the edit mode, filled
   *  from the Caption text. The mode is fixed for the form's life: its owner
   *  keys an edit on the Caption id. */
  caption?: CaptionView;
  /** Edit mode: save the new text (the view-model's `captionOwner.save`). Rejects
   *  on failure. */
  onSave?: (text: string) => Promise<void>;
  /** Edit mode: called once the save has committed. */
  onSaved?: () => void;
  /** The scope of the form's Draft (ADR-0030): the add form's or the edit's. */
  draftScope?: DraftScope;
}

/**
 * The one Caption form on a Post: the add form (#121) and the Caption edit
 * (#187), for a logged-in User. The submit never reloads the page.
 *
 * The add mode clears the input once the back-end has committed the Caption.
 * The new Caption reaches Top Captions through the `post_caption` poke the
 * back-end fires on commit, not through this form. It reports a Draft to the
 * app's guard while its text is not blank (ADR-0030).
 *
 * The edit mode fills the input from the Caption text. It holds a Draft while
 * the text differs from the saved Caption, and Save stays disabled until then.
 * A remote edit shows while the User has not changed the text.
 *
 * In both modes, a Cancel with a Draft asks first, and Escape is the Cancel of
 * a form with one. The form reports its write to the guard (#214).
 */
export default function CaptionForm(props: CaptionFormProps) {
  const api = props.api ?? jediApi;
  // The mode is fixed: the owner keys an edit on its Caption id.
  const editing = props.caption !== undefined;
  const text = MODE_TEXT[editing ? "edit" : "add"];
  let inputRef: HTMLInputElement | undefined;
  // The saved text: "" for the add form; for an edit, the Caption's text.
  const saved = () => props.caption?.text ?? "";
  const [value, setValue] = createSignal(saved());
  // A remote edit shows while the User has not changed the text (#187).
  createEffect(
    on(saved, (next, prev) => {
      if (prev !== undefined && value() === prev) setValue(next);
    }),
  );
  // The live count. Not the input's `maxLength`, which counts UTF-16 units and
  // so cut an emoji caption short of the back-end's cap (#185 review).
  const length = createMemo(() => hygieneLength(value()));
  const overLimit = () => length() > CAPTION_MAX_LENGTH;
  const dirty = () => (editing ? value() !== saved() : value().trim() !== "");
  const add = createRpcAction((caption: string) => api.captions.add(props.postId, caption), {
    fallbackError: MODE_TEXT.add.error,
  });
  const save = createRpcAction(
    async (caption: string) => {
      await props.onSave?.(caption);
      return true;
    },
    { fallbackError: MODE_TEXT.edit.error },
  );
  const pending = () => add.pending() || save.pending();
  const error = () => add.error() ?? save.error();
  const draft = useDraft({ dirty, scope: props.draftScope, busy: pending });

  onMount(() => {
    if (props.autofocus) inputRef?.focus();
  });
  // A submit can outlive its form: the owner remounts the form for a new Post.
  // A stale result must not report, or it would close the next Post's form and
  // move focus (#185 review). The Caption itself is still saved.
  let unmounted = false;
  onCleanup(() => (unmounted = true));

  // The Cancel asks first while the form holds a Draft (#214).
  const cancel = () => draft.cancel(() => props.onCancel?.());
  // Escape is the Cancel of a form that has one (#214). The form stops it, so
  // a document listener (`useDismiss`) does not close a menu or the sidebar. An
  // Escape that runs the Cancel also cancels the browser's own Escape action,
  // which would close the question that the Cancel opens (#210).
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (isImeKey(e) || !props.onCancel || pending()) return;
    e.preventDefault();
    cancel();
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (overLimit()) return;
    if (editing) {
      if ((await save.run(value())) && !unmounted) {
        draft.clear();
        props.onSaved?.();
      }
      return;
    }
    const added = await add.run(value());
    if (added && !unmounted) {
      setValue("");
      props.onAdded?.(added);
    }
  };

  return (
    <form onSubmit={handleSubmit} on:keydown={handleKeyDown} class="space-y-2">
      <Show when={error()}>
        <div role="alert" class="rounded bg-red-100 p-2 text-red-700">
          {error()}
        </div>
      </Show>
      <label for={`${text.id}-text`} class="block text-sm font-medium">
        {text.label}
      </label>
      <div class="flex gap-2">
        <input
          ref={(el) => (inputRef = el)}
          id={`${text.id}-text`}
          name="text"
          type="text"
          required
          aria-describedby={`${text.id}-count`}
          aria-invalid={overLimit()}
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          class="theme-input"
        />
        <Show when={props.onCancel}>
          <button
            type="button"
            disabled={pending()}
            onClick={cancel}
            class="theme-button shrink-0 disabled:opacity-50"
          >
            Cancel
          </button>
        </Show>
        <button
          type="submit"
          disabled={pending() || overLimit() || (editing && !dirty())}
          class="theme-button-primary shrink-0 disabled:opacity-50"
        >
          {pending() ? text.pending : text.submit}
        </button>
      </div>
      <p
        id={`${text.id}-count`}
        class={`text-right text-sm ${overLimit() ? "font-bold text-red-700" : "text-(--theme-muted)"}`}
      >
        {length()}/{CAPTION_MAX_LENGTH}
      </p>
    </form>
  );
}
