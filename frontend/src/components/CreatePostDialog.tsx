import { createResource, createSignal, For, Show } from "solid-js";
import { createRpcAction } from "~/lib/createRpcAction";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";
import type { PostDraft } from "~/types/jedi";

// The draft's text fields, in form order. Each `maxLength` mirrors the back-end
// cap (`PostBmc::hygiene_rules`); the back-end stays the authoritative check.
const TEXT_FIELDS = [
  { name: "title", label: "Title", type: "text", maxLength: 36 },
  { name: "imageSrc", label: "Image URL", type: "url", maxLength: 1024 },
  { name: "imageAlt", label: "Image description", type: "text", maxLength: 200 },
  { name: "photographer", label: "Photographer", type: "text", maxLength: 120 },
  { name: "photographerUrl", label: "Photographer URL", type: "url", maxLength: 1024 },
  { name: "sourceUrl", label: "Photo page URL", type: "url", maxLength: 1024 },
] as const;

type TextFieldName = (typeof TEXT_FIELDS)[number]["name"];

export interface CreatePostDialogProps {
  /** The Jedi seam slice the dialog uses. Defaults to the real `jediApi`; a test
   *  injects an in-memory stand-in (the inject-or-default idiom). */
  api?: {
    categories: Pick<JediApi["categories"], "list">;
    posts: Pick<JediApi["posts"], "create">;
  };
}

/**
 * The create-Post overlay (#120): a "New Post" button that opens a modal
 * `<dialog>` form. The submit never reloads the page; the dialog stays open until
 * the back-end has committed the Post, then closes. The new Post reaches the feed
 * through the `posts` poke the back-end fires on commit, not through this form.
 */
export default function CreatePostDialog(props: CreatePostDialogProps) {
  const api = props.api ?? jediApi;
  let dialogRef: HTMLDialogElement | undefined;

  // The taxonomy loads on the first open, not on mount: the Nav renders this on
  // every page, and most visits never open it.
  const [categoriesWanted, setCategoriesWanted] = createSignal(false);
  const [categories, { refetch: refetchCategories }] = createResource(categoriesWanted, () =>
    api.categories.list(),
  );
  const [categoryError, setCategoryError] = createSignal<string | null>(null);
  const create = createRpcAction((draft: PostDraft) => api.posts.create(draft), {
    fallbackError: "Could not create the Post",
  });

  const openDialog = () => {
    setCategoriesWanted(true);
    setCategoryError(null);
    dialogRef?.showModal();
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const categoryIds = data.getAll("categoryIds").map(Number);
    // A native `required` cannot say "at least one of this group".
    if (categoryIds.length === 0) {
      setCategoryError("Choose at least one Category");
      return;
    }
    setCategoryError(null);
    const text = (name: TextFieldName) => {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    };
    const created = await create.run({
      title: text("title"),
      imageSrc: text("imageSrc"),
      imageAlt: text("imageAlt"),
      photographer: text("photographer"),
      photographerUrl: text("photographerUrl"),
      sourceUrl: text("sourceUrl"),
      categoryIds,
    });
    if (created) {
      form.reset();
      dialogRef?.close();
    }
  };

  const error = () => categoryError() ?? create.error();

  return (
    <>
      <button type="button" onClick={openDialog} class="theme-button">
        New Post
      </button>

      <dialog
        ref={(el) => (dialogRef = el)}
        // Esc fires `cancel`: refuse it while the Post is in flight, so the result
        // (the close, or the rejection) stays visible.
        onCancel={(e) => create.pending() && e.preventDefault()}
        aria-labelledby="create-post-heading"
        class="m-auto w-full max-w-md rounded-2xl p-6 shadow-lg bg-(--theme-card-bg) text-(--theme-card-fg) backdrop:bg-black/50"
      >
        <form onSubmit={handleSubmit} class="space-y-4">
          <h2 id="create-post-heading" class="text-xl font-bold">
            New Post
          </h2>

          <Show when={error()}>
            <div role="alert" class="rounded bg-red-100 p-2 text-red-700">
              {error()}
            </div>
          </Show>

          <For each={TEXT_FIELDS}>
            {(field) => (
              <div>
                <label for={`create-post-${field.name}`} class="block text-sm font-medium">
                  {field.label}
                </label>
                <input
                  id={`create-post-${field.name}`}
                  name={field.name}
                  type={field.type}
                  maxLength={field.maxLength}
                  required
                  class="mt-1 block w-full rounded border border-(--theme-muted) bg-(--theme-background) px-3 py-2 text-(--theme-foreground)"
                />
              </div>
            )}
          </For>

          <fieldset>
            <legend class="text-sm font-medium">Categories</legend>
            {/* A failed load must not be read: reading an errored resource throws,
                and the Nav sits above every error boundary. Show it with a retry. */}
            <Show when={categories.error}>
              <div
                role="alert"
                class="mt-1 flex items-center gap-2 rounded bg-red-100 p-2 text-red-700"
              >
                Could not load the Categories.
                <button type="button" onClick={() => void refetchCategories()} class="underline">
                  Retry
                </button>
              </div>
            </Show>
            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <For each={categories.error ? undefined : categories()}>
                {(category) => (
                  <label class="flex items-center gap-1">
                    <input type="checkbox" name="categoryIds" value={category.id} />
                    {category.name}
                  </label>
                )}
              </For>
            </div>
          </fieldset>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              disabled={create.pending()}
              onClick={() => dialogRef?.close()}
              class="theme-button disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.pending()}
              class="rounded-full px-3 py-1 text-white bg-(--theme-btn-primary) hover:bg-(--theme-btn-primary-hover) disabled:opacity-50"
            >
              {create.pending() ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
