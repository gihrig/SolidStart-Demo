import { createEffect, createMemo, createSignal, on, onMount, Show, untrack } from "solid-js";
import { hygieneLength } from "~/lib/hygieneLength";
import type { HygieneCaps } from "~/types/backend";
import type { CaptionView } from "~/types/jedi";
import { useDraftForm } from "~/components/DraftGuardContext";

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
  /** When given, the form offers a Cancel button that calls it. */
  onCancel?: () => void;
  /** Focus the input on mount — set when a click opened the form. */
  autofocus?: boolean;
  /** Runs each time the form starts a Draft (#271). The owner of the add form
   *  that shows at once then keeps it open, as after a click on Add. */
  onDraft?: () => void;
  /** The Caption to edit (#187). With it, the form is the edit mode, filled
   *  from the Caption text. The mode is fixed for the form's life: its owner
   *  keys an edit on the Caption id. */
  caption?: CaptionView;
  /** Save the text: the add mode adds a Caption (the view-model's
   *  `addCaption`, #283), the edit mode saves the new text (its
   *  `captionOwner.save`). Rejects on failure. */
  onSave?: (text: string) => Promise<unknown>;
  /** Called once the save has committed. */
  onSaved?: () => void;
}

/**
 * The one Caption form on a Post: the add form (#121) and the Caption edit
 * (#187), for a logged-in User. The submit never reloads the page.
 *
 * The add mode saves through `onSave` and clears the input once the back-end
 * has committed the Caption. The owner's save refetches the Captions at once,
 * so the new Caption does not wait for the `post_caption` poke (#283). It
 * reports a Draft to the app's guard while its text is not blank (ADR-0030).
 *
 * The edit mode fills the input from the Caption text. It holds a Draft while
 * the text differs from the saved Caption, and Save stays disabled until then.
 * A remote edit shows while the User has not changed the text.
 *
 * In both modes, the form builds on `useDraftForm` (#270): a Cancel with a
 * Draft asks first, Escape is the Cancel of a form with one, and the form
 * reports its write to the guard (#214).
 */
export default function CaptionForm(props: CaptionFormProps) {
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
  createEffect(
    on(dirty, (isDirty) => {
      if (isDirty) untrack(() => props.onDraft?.());
    }),
  );
  // The owner can change `onCancel` while the form is open, so `close` is an
  // accessor: the hook reads it at each Cancel.
  const base = {
    dirty,
    close: () => props.onCancel,
    fallbackError: text.error,
  };
  // Both modes save through `onSave` (#283). The add clears its input after
  // the save.
  const form = useDraftForm({
    ...base,
    write: async () => {
      await props.onSave?.(value());
    },
    onSaved: () => {
      if (!editing) setValue("");
      props.onSaved?.();
    },
  });

  onMount(() => {
    if (props.autofocus) inputRef?.focus();
  });

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (overLimit()) return;
    await form.submit();
  };

  return (
    <form onSubmit={handleSubmit} on:keydown={form.keydown} class="space-y-2">
      <Show when={form.error()}>
        <div role="alert" class="rounded bg-red-100 p-2 text-red-700">
          {form.error()}
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
            disabled={form.pending()}
            onClick={form.cancel}
            class="theme-button shrink-0 disabled:opacity-50"
          >
            Cancel
          </button>
        </Show>
        <button
          type="submit"
          disabled={form.pending() || overLimit() || (editing && !dirty())}
          class="theme-button-primary shrink-0 disabled:opacity-50"
        >
          {form.pending() ? text.pending : text.submit}
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
