import { describe, it, expect, vi, beforeAll, beforeEach } from "vite-plus/test";
import { render, screen, within, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, Suspense } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import { createDraftGuard } from "~/lib/createDraftGuard";
import { stubDialogModal } from "~/lib/test-utils";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { JediCategory, PostChanges, PostDraft, PostView } from "~/types/jedi";
import PostDialog from "./PostDialog";
import { DraftGuardContext } from "./DraftGuardContext";

beforeAll(stubDialogModal);

const CATEGORIES: JediCategory[] = [
  { id: 1, name: "Landscape", icon: "landscape" },
  { id: 3, name: "Animals", icon: "dog" },
];

const DRAFT: PostDraft = {
  title: "New arrival",
  imageSrc: "https://live.staticflickr.com/1/2_b.jpg",
  imageAlt: "A cat",
  photographer: "Felicity",
  photographerUrl: "https://www.flickr.com/photos/f/",
  sourceUrl: "https://www.flickr.com/photos/f/2/",
  categoryIds: [3],
};

const CREATED: PostView = {
  id: 5,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("") },
  title: DRAFT.title,
  imageSrc: trustedUrl(DRAFT.imageSrc),
  imageAlt: DRAFT.imageAlt,
  photographer: DRAFT.photographer,
  photographerUrl: trustedUrl(DRAFT.photographerUrl),
  sourceUrl: trustedUrl(DRAFT.sourceUrl),
  categories: [CATEGORIES[1]],
  likeCount: 0,
  commentCount: 0,
};

const categoryListMock = vi.fn<JediApi["categories"]["list"]>();
const postCreateMock = vi.fn<JediApi["posts"]["create"]>();
const api = {
  categories: { list: categoryListMock },
  posts: { create: postCreateMock },
};

beforeEach(() => {
  categoryListMock.mockReset();
  categoryListMock.mockResolvedValue(CATEGORIES);
  postCreateMock.mockReset();
});

// Open the dialog and fill every text field from the draft; Categories stay
// unchecked so each test chooses its own.
async function openAndFill() {
  const user = userEvent.setup();
  render(() => <PostDialog api={api} />);
  await user.click(screen.getByRole("button", { name: "New Post" }));
  const dialog = screen.getByRole("dialog", { hidden: true });
  const form = within(dialog);
  await user.type(form.getByLabelText("Title"), DRAFT.title);
  await user.type(form.getByLabelText("Image URL"), DRAFT.imageSrc);
  await user.type(form.getByLabelText("Image description"), DRAFT.imageAlt);
  await user.type(form.getByLabelText("Photographer"), DRAFT.photographer);
  await user.type(form.getByLabelText("Photographer URL"), DRAFT.photographerUrl);
  await user.type(form.getByLabelText("Photo page URL"), DRAFT.sourceUrl);
  return { user, dialog, form };
}

describe("<PostDialog />", () => {
  it("opens as a modal and loads the Categories to choose from", async () => {
    const user = userEvent.setup();
    render(() => <PostDialog api={api} />);
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(categoryListMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "New Post" }));

    expect(dialog.open).toBe(true);
    const form = within(dialog);
    expect(await form.findByRole("checkbox", { name: "Landscape" })).toBeTruthy();
    expect(form.getByRole("checkbox", { name: "Animals" })).toBeTruthy();
  });

  it("opens from a custom trigger: 'Add', named 'Add Post' (the Post line, #123)", async () => {
    const user = userEvent.setup();
    render(() => <PostDialog api={api} triggerLabel="Add" triggerAriaLabel="Add Post" />);
    const trigger = screen.getByRole("button", { name: "Add Post" });
    expect(trigger).toHaveTextContent(/^Add$/);

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
  });

  it("opens on the first click under a <Suspense>, while the Categories load (#123)", async () => {
    // The Post line renders this dialog inside the route's <Suspense>. The first
    // open loads the Categories; a suspending read would swap the route for the
    // fallback, which jumps the page to the top and drops the open dialog.
    let answer!: (categories: JediCategory[]) => void;
    categoryListMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    render(() => (
      <Suspense fallback="Loading">
        <PostDialog api={api} triggerLabel="Add" triggerAriaLabel="Add Post" />
      </Suspense>
    ));

    await user.click(screen.getByRole("button", { name: "Add Post" }));

    expect(screen.queryByText("Loading")).toBeNull();
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);

    answer(CATEGORIES);
    expect(await within(dialog).findByRole("checkbox", { name: "Animals" })).toBeTruthy();
    expect(dialog.open).toBe(true);
  });

  it("gives each dialog its own heading id, so two on one page keep their names", () => {
    render(() => (
      <>
        <PostDialog api={api} />
        <PostDialog api={api} triggerLabel="Add" triggerAriaLabel="Add Post" />
      </>
    ));
    const ids = screen
      .getAllByRole("dialog", { hidden: true })
      .map((d) => d.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(document.getElementById(id!)).toHaveTextContent("New Post");
  });

  it("shows a failed Categories load and retries it (#120 review)", async () => {
    categoryListMock.mockRejectedValueOnce(new Error("RPC Error: down"));
    const user = userEvent.setup();
    render(() => <PostDialog api={api} />);
    await user.click(screen.getByRole("button", { name: "New Post" }));
    const form = within(screen.getByRole("dialog", { hidden: true }));

    expect((await form.findByRole("alert")).textContent).toContain("Could not load the Categories");

    await user.click(form.getByRole("button", { name: "Retry" }));

    expect(await form.findByRole("checkbox", { name: "Landscape" })).toBeTruthy();
    expect(categoryListMock).toHaveBeenCalledTimes(2);
    expect(form.queryByRole("alert")).toBeNull();
  });

  it("blocks a submit with no Category and does not call the RPC", async () => {
    const { user, form } = await openAndFill();
    await form.findByRole("checkbox", { name: "Animals" });

    await user.click(form.getByRole("button", { name: "Post" }));

    expect(form.getByRole("alert").textContent).toContain("Choose at least one Category");
    expect(postCreateMock).not.toHaveBeenCalled();
  });

  it("submits the draft, then closes and clears the form once the Post has landed", async () => {
    let land!: (post: PostView) => void;
    postCreateMock.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const { user, dialog, form } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));

    await user.click(form.getByRole("button", { name: "Post" }));

    expect(postCreateMock).toHaveBeenCalledWith(DRAFT);
    // Until the back-end answers, the dialog stays open and the submit is busy.
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(form.getByRole("button", { name: "Posting…" })).toHaveProperty("disabled", true);

    land(CREATED);

    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect((form.getByLabelText("Title") as HTMLInputElement).value).toBe("");
  });

  it("cannot be dismissed while the Post is in flight", async () => {
    let land!: (post: PostView) => void;
    postCreateMock.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const { user, dialog, form } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));
    await user.click(form.getByRole("button", { name: "Post" }));

    // Cancel is disabled, and Esc (the dialog's `cancel` event) is refused.
    expect(form.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);
    const esc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);

    land(CREATED);
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
  });

  it("shows the back-end rejection and keeps the dialog open", async () => {
    postCreateMock.mockRejectedValue(new Error("RPC Error: unsafe URL"));
    const { user, dialog, form } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Landscape" }));

    await user.click(form.getByRole("button", { name: "Post" }));

    expect((await form.findByRole("alert")).textContent).toContain("unsafe URL");
    expect((dialog as HTMLDialogElement).open).toBe(true);
  });

  it("shows no old rejection when it opens again (#128)", async () => {
    postCreateMock.mockRejectedValue(new Error("RPC Error: unsafe URL"));
    const { user, dialog, form } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Landscape" }));
    await user.click(form.getByRole("button", { name: "Post" }));
    expect((await form.findByRole("alert")).textContent).toContain("unsafe URL");

    await user.click(form.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "New Post" }));

    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(form.queryByRole("alert")).toBeNull();
  });
});

describe("<PostDialog /> — the edit mode (#187)", () => {
  // The edit opens on mount: the owner mounts it to open it.
  function renderEdit(post = CREATED) {
    const [shown, setShown] = createSignal(post);
    const onSave = vi.fn<(changes: PostChanges) => Promise<void>>(() => Promise.resolve());
    const onClose = vi.fn();
    const guard = createDraftGuard();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <PostDialog api={api} post={shown()} onSave={onSave} onClose={onClose} />
      </DraftGuardContext.Provider>
    ));
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    return {
      user: userEvent.setup(),
      dialog,
      form: within(dialog),
      onSave,
      onClose,
      guard,
      setShown,
    };
  }
  const input = (form: ReturnType<typeof within>, label: string) =>
    form.getByLabelText(label) as HTMLInputElement;

  it("opens as 'Edit Post', every field and the Categories filled from the Post", async () => {
    const { dialog, form } = renderEdit();
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveAccessibleName("Edit Post");
    expect(input(form, "Title").value).toBe(DRAFT.title);
    expect(input(form, "Image description").value).toBe(DRAFT.imageAlt);
    expect(input(form, "Photographer").value).toBe(DRAFT.photographer);
    expect(input(form, "Photographer URL").value).toBe(DRAFT.photographerUrl);
    expect(input(form, "Photo page URL").value).toBe(DRAFT.sourceUrl);
    expect(await form.findByRole("checkbox", { name: "Animals" })).toBeChecked();
    expect(form.getByRole("checkbox", { name: "Landscape" })).not.toBeChecked();
  });

  it("a close by the browser is the edit's Cancel (PR #216 review)", async () => {
    const { user, dialog, form, guard, onClose } = renderEdit();
    await user.type(input(form, "Photographer"), "!");
    expect(guard.hasDraft()).toBe(true);

    // Chrome closes a modal dialog on a second Escape, with no `cancel` event.
    dialog.close();
    expect(onClose).toHaveBeenCalledOnce();
    expect(guard.hasDraft()).toBe(false);
  });

  it("shows the photo URL, disabled, with the hint", () => {
    const { form } = renderEdit();
    const imageUrl = input(form, "Image URL");
    expect(imageUrl.value).toBe(DRAFT.imageSrc);
    expect(imageUrl).toBeDisabled();
    expect(imageUrl).toHaveAccessibleDescription("The photo cannot change.");
  });

  it("keeps Save disabled until a field changes, and sends only the changed fields", async () => {
    const { user, form, onSave, onClose } = renderEdit();
    expect(form.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(input(form, "Title"));
    await user.type(input(form, "Title"), "Big Jedi");
    await user.click(await form.findByRole("checkbox", { name: "Landscape" }));
    await user.click(form.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ title: "Big Jedi", categoryIds: [3, 1] });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("holds a Draft while a field differs from the saved Post; Cancel drops it", async () => {
    const { user, form, guard, onClose } = renderEdit();
    expect(guard.hasDraft()).toBe(false);
    await user.type(input(form, "Photographer"), "!");
    expect(guard.hasDraft()).toBe(true);
    await user.type(input(form, "Photographer"), "{Backspace}");
    expect(guard.hasDraft(), "back to the saved value").toBe(false);

    await user.type(input(form, "Photographer"), "!");
    await user.click(form.getByRole("button", { name: "Cancel" }));
    expect(guard.hasDraft()).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("an unchanged field shows a remote change; a changed field keeps the User's value", async () => {
    const { user, form, setShown } = renderEdit();
    await user.clear(input(form, "Title"));
    await user.type(input(form, "Title"), "Mine");

    setShown({ ...CREATED, title: "Theirs", imageAlt: "A remote cat" });

    expect(input(form, "Title").value).toBe("Mine");
    expect(input(form, "Image description").value).toBe("A remote cat");
  });

  it("blocks a save with no Category", async () => {
    const { user, form, onSave } = renderEdit();
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));
    await user.click(form.getByRole("button", { name: "Save" }));
    expect(form.getByRole("alert")).toHaveTextContent("Choose at least one Category");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the save error and stays open", async () => {
    const { user, form, onSave, onClose } = renderEdit();
    // A rejection that is not an Error shows the fallback text.
    onSave.mockRejectedValueOnce({ status: 500 });
    await user.type(input(form, "Title"), "!");
    await user.click(form.getByRole("button", { name: "Save" }));
    expect(await form.findByRole("alert")).toHaveTextContent("Could not edit the Post");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the create mode reports no Draft (#214)", async () => {
    const guard = createDraftGuard();
    const user = userEvent.setup();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <PostDialog api={api} />
      </DraftGuardContext.Provider>
    ));
    await user.click(screen.getByRole("button", { name: "New Post" }));
    await user.type(screen.getByLabelText("Title"), "typed");
    expect(guard.hasDraft()).toBe(false);
  });
});
