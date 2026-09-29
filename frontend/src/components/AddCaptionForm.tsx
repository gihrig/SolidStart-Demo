import { Show } from "solid-js";
import { createRpcAction } from "~/lib/createRpcAction";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";

// Mirrors the back-end cap (`CaptionBmc::hygiene_rules`); the back-end stays the
// authoritative check.
const CAPTION_MAX_LENGTH = 36;

export interface AddCaptionFormProps {
  /** The Post the Caption competes on. */
  postId: number;
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
  const add = createRpcAction((text: string) => api.captions.add(props.postId, text), {
    fallbackError: "Could not add the Caption",
  });

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const text = new FormData(form).get("text");
    const added = await add.run(typeof text === "string" ? text : "");
    if (added) form.reset();
  };

  return (
    <form onSubmit={handleSubmit} class="card-style mt-4 p-4 space-y-2">
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
          id="add-caption-text"
          name="text"
          type="text"
          maxLength={CAPTION_MAX_LENGTH}
          required
          class="block w-full rounded border border-(--theme-muted) bg-(--theme-background) px-3 py-2 text-(--theme-foreground)"
        />
        <button
          type="submit"
          disabled={add.pending()}
          class="shrink-0 rounded-full px-3 py-1 text-white bg-(--theme-btn-primary) hover:bg-(--theme-btn-primary-hover) disabled:opacity-50"
        >
          {add.pending() ? "Adding…" : "Add Caption"}
        </button>
      </div>
    </form>
  );
}
