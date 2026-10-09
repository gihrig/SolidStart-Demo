import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createRpcAction } from "~/lib/createRpcAction";
import { hygieneLength } from "~/lib/hygieneLength";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";
import type { HygieneCaps } from "~/types/backend";
import type { CaptionView } from "~/types/jedi";

// Mirrors the back-end cap (`CaptionBmc::hygiene_rules`), counted the back-end's
// way (`hygieneLength`). `satisfies` pins it to the cap, so a changed cap fails
// `tsc` (ADR-0029); the back-end stays the authoritative check.
const CAPTION_MAX_LENGTH = 36 satisfies HygieneCaps["caption"]["text"];

export interface AddCaptionFormProps {
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
}

/**
 * The caption-submit form on a Post (#121), for a logged-in User. The submit
 * never reloads the page; the input clears once the back-end has committed the
 * Caption. The new Caption reaches Top Captions through the `post_caption` poke
 * the back-end fires on commit, not through this form.
 */
export default function AddCaptionForm(props: AddCaptionFormProps) {
  const api = props.api ?? jediApi;
  let inputRef: HTMLInputElement | undefined;
  // The live count. Not the input's `maxLength`, which counts UTF-16 units and
  // so cut an emoji caption short of the back-end's cap (#185 review).
  const [length, setLength] = createSignal(0);
  const overLimit = () => length() > CAPTION_MAX_LENGTH;
  const add = createRpcAction((text: string) => api.captions.add(props.postId, text), {
    fallbackError: "Could not add the Caption",
  });

  onMount(() => {
    if (props.autofocus) inputRef?.focus();
  });
  // A submit can outlive its form: the owner remounts the form for a new Post.
  // A stale result must not report, or it would close the next Post's form and
  // move focus (#185 review). The Caption itself is still saved.
  let unmounted = false;
  onCleanup(() => (unmounted = true));

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (overLimit()) return;
    const form = e.currentTarget as HTMLFormElement;
    const text = new FormData(form).get("text");
    const added = await add.run(typeof text === "string" ? text : "");
    if (added && !unmounted) {
      form.reset();
      setLength(0);
      props.onAdded?.(added);
    }
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-2">
      <Show when={add.error()}>
        <div role="alert" class="rounded bg-red-100 p-2 text-red-700">
          {add.error()}
        </div>
      </Show>
      <label for="add-caption-text" class="block text-sm font-medium">
        Your caption
      </label>
      <div class="flex gap-2">
        <input
          ref={(el) => (inputRef = el)}
          id="add-caption-text"
          name="text"
          type="text"
          required
          aria-describedby="add-caption-count"
          aria-invalid={overLimit()}
          onInput={(e) => setLength(hygieneLength(e.currentTarget.value))}
          class="block w-full rounded border border-(--theme-muted) bg-(--theme-background) px-3 py-2 text-(--theme-foreground)"
        />
        <Show when={props.onCancel}>
          <button
            type="button"
            disabled={add.pending()}
            onClick={() => props.onCancel?.()}
            class="theme-button shrink-0 disabled:opacity-50"
          >
            Cancel
          </button>
        </Show>
        <button
          type="submit"
          disabled={add.pending() || overLimit()}
          class="shrink-0 rounded-full px-3 py-1 text-white bg-(--theme-btn-primary) hover:bg-(--theme-btn-primary-hover) disabled:opacity-50"
        >
          {add.pending() ? "Adding…" : "Add Caption"}
        </button>
      </div>
      <p
        id="add-caption-count"
        class={`text-right text-sm ${overLimit() ? "font-bold text-red-700" : "text-(--theme-muted)"}`}
      >
        {length()}/{CAPTION_MAX_LENGTH}
      </p>
    </form>
  );
}
