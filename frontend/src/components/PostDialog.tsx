import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  createUniqueId,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import type { DraftScope } from "~/lib/createDraftGuard";
import { createRpcAction } from "~/lib/createRpcAction";
import { jediApi, type JediApi } from "~/lib/jedi/jedi-api";
import type { HygieneCaps } from "~/types/backend";
import type { PostChanges, PostDraft, PostView } from "~/types/jedi";
import { useDraft } from "~/components/DraftGuardContext";

// The draft's text fields, in form order. Each `maxLength` mirrors the back-end
// cap (`PostBmc::hygiene_rules`) and pins to it with `satisfies`, so a changed
// cap fails `tsc` (ADR-0029); the back-end stays the authoritative check.
type PostCaps = HygieneCaps["post"];
const TEXT_FIELDS = [
  {
    name: "title",
    label: "Title",
    type: "text",
    maxLength: 36 satisfies PostCaps["title"],
  },
  {
    name: "imageSrc",
    label: "Image URL",
    type: "url",
    maxLength: 1024 satisfies PostCaps["image_src"],
  },
  {
    name: "imageAlt",
    label: "Image description",
    type: "text",
    maxLength: 200 satisfies PostCaps["image_alt"],
  },
  {
    name: "photographer",
    label: "Photographer",
    type: "text",
    maxLength: 120 satisfies PostCaps["photographer"],
  },
  {
    name: "photographerUrl",
    label: "Photographer URL",
    type: "url",
    maxLength: 1024 satisfies PostCaps["photographer_url"],
  },
  {
    name: "sourceUrl",
    label: "Photo page URL",
    type: "url",
    maxLength: 1024 satisfies PostCaps["source_url"],
  },
] as const;

// The text fields an edit can change (#187): every field but the photo. The
// Post _is_ the photo, so the photo never changes.
const EDIT_FIELDS = ["title", "imageAlt", "photographer", "photographerUrl", "sourceUrl"] as const;

/** The text of each mode (#187). */
const MODE_TEXT = {
  create: {
    heading: "New Post",
    submit: "Post",
    pending: "Posting…",
    error: "Could not create the Post",
  },
  edit: {
    heading: "Edit Post",
    submit: "Save",
    pending: "Saving…",
    error: "Could not edit the Post",
  },
} as const;

const emptyDraft = (): PostDraft => ({
  title: "",
  imageSrc: "",
  imageAlt: "",
  photographer: "",
  photographerUrl: "",
  sourceUrl: "",
  categoryIds: [],
});

// The saved values of a Post, in the form's shape.
const draftOf = (post: PostView): PostDraft => ({
  title: post.title,
  imageSrc: post.imageSrc,
  imageAlt: post.imageAlt,
  photographer: post.photographer,
  photographerUrl: post.photographerUrl,
  sourceUrl: post.sourceUrl,
  categoryIds: post.categories.map((c) => c.id),
});

// The Categories are one field: a change of order is no change.
const sameIds = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export interface PostDialogProps {
  /** The Jedi seam slice the dialog uses. Defaults to the real `jediApi`; a test
   *  injects an in-memory stand-in (the inject-or-default idiom). */
  api?: {
    categories: Pick<JediApi["categories"], "list">;
    posts: Pick<JediApi["posts"], "create">;
  };
  /** The trigger button's text. Default "New Post" (the Nav); the Post line on
   *  the Jedi page uses "Add" (#123). Create mode only. */
  triggerLabel?: string;
  /** The trigger's accessible name, when it differs from its text ("Add Post"). */
  triggerAriaLabel?: string;
  /** The Post to edit (#187). With it, the dialog is the edit mode: it has no
   *  trigger and opens on mount, so its owner mounts it to open it, keyed on
   *  the Post id. The mode is fixed for the dialog's life. */
  post?: PostView;
  /** Edit mode: save the changed fields (the view-model's `postOwner.save`).
   *  Rejects on failure. */
  onSave?: (changes: PostChanges) => Promise<void>;
  /** Edit mode: called on Cancel and after a save. */
  onClose?: () => void;
  /** Edit mode: the scope of the edit's Draft (ADR-0030). */
  draftScope?: DraftScope;
}

/**
 * The one Post dialog: the create overlay (#120) and the Post edit (#187).
 *
 * The create mode is a "New Post" button that opens a modal `<dialog>` form.
 * The submit never reloads the page; the dialog stays open until the back-end
 * has committed the Post, then closes. The new Post reaches the feed through
 * the `posts` poke the back-end fires on commit, not through this form. It
 * reports no Draft: the Nav keeps it mounted across a route move (#214).
 *
 * The edit mode fills every field from the Post, with its Categories checked.
 * The photo URL shows, disabled: Save never sends it. The edit holds a Draft
 * while a field differs from the saved Post, and Save stays disabled until
 * then. Save sends only the changed fields; the Categories count as one field.
 * A remote edit of the Post shows in each field that the User did not change.
 */
export default function PostDialog(props: PostDialogProps) {
  const api = props.api ?? jediApi;
  // The mode is fixed: the owner keys an edit on its Post id.
  const editing = props.post !== undefined;
  const text = MODE_TEXT[editing ? "edit" : "create"];
  // One id per instance: the Nav and the Post line can both render this dialog.
  const uid = createUniqueId();
  const headingId = `${uid}-heading`;
  const photoHintId = `${uid}-photo-hint`;
  let dialogRef: HTMLDialogElement | undefined;

  // The saved Post's values (edit mode); undefined in create mode.
  const saved = createMemo(() => (props.post ? draftOf(props.post) : undefined));
  const initial = saved() ?? emptyDraft();
  const [values, setValues] = createStore<PostDraft>({
    ...initial,
    categoryIds: [...initial.categoryIds],
  });
  // A remote edit shows in each field that the User did not change (#187).
  createEffect(
    on(saved, (next, prev) => {
      if (!next || !prev) return;
      for (const name of EDIT_FIELDS) {
        if (values[name] === prev[name]) setValues({ [name]: next[name] });
      }
      if (sameIds(values.categoryIds, prev.categoryIds)) {
        setValues("categoryIds", [...next.categoryIds]);
      }
    }),
  );
  // The edit's changed fields; none in create mode.
  const changes = (): PostChanges => {
    const base = saved();
    const changed: PostChanges = {};
    if (!base) return changed;
    for (const name of EDIT_FIELDS) {
      if (values[name] !== base[name]) changed[name] = values[name];
    }
    if (!sameIds(values.categoryIds, base.categoryIds))
      changed.categoryIds = [...values.categoryIds];
    return changed;
  };
  const dirty = () => Object.keys(changes()).length > 0;
  const draft = editing ? useDraft({ dirty, scope: props.draftScope }) : undefined;

  // The taxonomy loads on the first open, not on mount: the Nav renders this on
  // every page, and most visits never open it. An edit opens on mount.
  const [categoriesWanted, setCategoriesWanted] = createSignal(editing);
  const [categories, { refetch: refetchCategories }] = createResource(categoriesWanted, () =>
    api.categories.list(),
  );
  const [categoryError, setCategoryError] = createSignal<string | null>(null);
  const create = createRpcAction((post: PostDraft) => api.posts.create(post), {
    fallbackError: MODE_TEXT.create.error,
  });
  const save = createRpcAction(
    async (edit: PostChanges) => {
      await props.onSave?.(edit);
      return true;
    },
    { fallbackError: MODE_TEXT.edit.error },
  );
  const pending = () => create.pending() || save.pending();

  const openDialog = () => {
    setCategoriesWanted(true);
    setCategoryError(null);
    create.reset();
    dialogRef?.showModal();
  };
  onMount(() => {
    if (editing) dialogRef?.showModal();
  });

  // A Save can outlive its edit: a browser close unmounts the edit while the
  // Save waits. A stale result must not close the next edit (PR #216 review).
  // The Post itself is still saved.
  let unmounted = false;
  onCleanup(() => (unmounted = true));

  // The edit's Cancel drops its Draft: the close then shows no notice.
  const closeEdit = () => {
    draft?.clear();
    props.onClose?.();
  };

  const toggleCategory = (id: number, checked: boolean) =>
    setValues("categoryIds", (ids) => (checked ? [...ids, id] : ids.filter((c) => c !== id)));

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    // A native `required` cannot say "at least one of this group".
    if (values.categoryIds.length === 0) {
      setCategoryError("Choose at least one Category");
      return;
    }
    setCategoryError(null);
    if (editing) {
      if ((await save.run(changes())) && !unmounted) closeEdit();
      return;
    }
    const created = await create.run({
      title: values.title,
      imageSrc: values.imageSrc,
      imageAlt: values.imageAlt,
      photographer: values.photographer,
      photographerUrl: values.photographerUrl,
      sourceUrl: values.sourceUrl,
      categoryIds: [...values.categoryIds],
    });
    if (created) {
      setValues(emptyDraft());
      dialogRef?.close();
    }
  };

  const error = () => categoryError() ?? create.error() ?? save.error();

  return (
    <>
      <Show when={!editing}>
        <button
          type="button"
          onClick={openDialog}
          class="theme-button"
          aria-label={props.triggerAriaLabel}
        >
          {props.triggerLabel ?? "New Post"}
        </button>
      </Show>

      <dialog
        ref={(el) => (dialogRef = el)}
        // Esc fires `cancel`: refuse it while the write is in flight, so the
        // result (the close, or the rejection) stays visible. The edit's owner
        // closes it, so an Esc there is its Cancel.
        onCancel={(e) => {
          if (pending()) return e.preventDefault();
          if (editing) {
            e.preventDefault();
            closeEdit();
          }
        }}
        // A browser can still close it (Chrome closes on a second Escape). The
        // edit's owner must hear it, or the edit stays open with no dialog.
        // While the write is in flight, it opens again, as Esc is refused, so
        // a failed Save keeps the text and shows its error (PR #216 review).
        onClose={() => {
          if (!editing) return;
          if (pending()) return dialogRef?.showModal();
          closeEdit();
        }}
        aria-labelledby={headingId}
        class="theme-dialog max-w-md"
      >
        <form onSubmit={handleSubmit} class="space-y-4">
          <h2 id={headingId} class="text-xl font-bold">
            {text.heading}
          </h2>

          <Show when={error()}>
            <div role="alert" class="rounded bg-red-100 p-2 text-red-700">
              {error()}
            </div>
          </Show>

          <For each={TEXT_FIELDS}>
            {(field) => {
              // The photo cannot change (#187): an edit shows it, disabled.
              const photo = editing && field.name === "imageSrc";
              return (
                <div>
                  <label for={`${uid}-${field.name}`} class="block text-sm font-medium">
                    {field.label}
                  </label>
                  <input
                    id={`${uid}-${field.name}`}
                    name={field.name}
                    type={field.type}
                    maxLength={field.maxLength}
                    required
                    disabled={photo}
                    aria-describedby={photo ? photoHintId : undefined}
                    value={values[field.name]}
                    onInput={(e) => setValues({ [field.name]: e.currentTarget.value })}
                    class="theme-input mt-1 disabled:opacity-50"
                  />
                  <Show when={photo}>
                    <p id={photoHintId} class="mt-1 text-sm text-(--theme-muted)">
                      The photo cannot change.
                    </p>
                  </Show>
                </div>
              );
            }}
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
            {/* Read the list only once it is ready. A read while it loads suspends:
                inside the route's <Suspense> (the Post line's Add, #123) that
                swaps the route for the fallback and drops the open dialog. */}
            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <For each={categories.state === "ready" ? categories() : undefined}>
                {(category) => (
                  <label class="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name="categoryIds"
                      value={category.id}
                      checked={values.categoryIds.includes(category.id)}
                      onChange={(e) => toggleCategory(category.id, e.currentTarget.checked)}
                    />
                    {category.name}
                  </label>
                )}
              </For>
            </div>
          </fieldset>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              disabled={pending()}
              onClick={() => (editing ? closeEdit() : dialogRef?.close())}
              class="theme-button disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending() || (editing && !dirty())}
              class="theme-button-primary disabled:opacity-50"
            >
              {pending() ? text.pending : text.submit}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
