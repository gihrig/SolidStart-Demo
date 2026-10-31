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

// The create mode opens on mount: its owner mounts it to open it (#214). Fill
// every text field from the draft; Categories stay unchecked so each test
// chooses its own.
async function openAndFill() {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(() => <PostDialog api={api} onClose={onClose} />);
  const dialog = screen.getByRole("dialog") as HTMLDialogElement;
  const form = within(dialog);
  await user.type(form.getByLabelText("Title"), DRAFT.title);
  await user.type(form.getByLabelText("Image URL"), DRAFT.imageSrc);
  await user.type(form.getByLabelText("Image description"), DRAFT.imageAlt);
  await user.type(form.getByLabelText("Photographer"), DRAFT.photographer);
  await user.type(form.getByLabelText("Photographer URL"), DRAFT.photographerUrl);
  await user.type(form.getByLabelText("Photo page URL"), DRAFT.sourceUrl);
  return { user, dialog, form, onClose };
}

describe("<PostDialog />", () => {
  it("opens as a modal on mount and loads the Categories to choose from", async () => {
    render(() => <PostDialog api={api} />);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveAccessibleName("New Post");
    const form = within(dialog);
    expect(await form.findByRole("checkbox", { name: "Landscape" })).toBeTruthy();
    expect(form.getByRole("checkbox", { name: "Animals" })).toBeTruthy();
  });

  it("opens under a <Suspense> while the Categories load (#123)", async () => {
    // The Post edit renders inside the route's <Suspense>. A suspending read
    // would swap the route for the fallback, which jumps the page to the top
    // and drops the open dialog.
    let answer!: (categories: JediCategory[]) => void;
    categoryListMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    render(() => (
      <Suspense fallback="Loading">
        <PostDialog api={api} />
      </Suspense>
    ));

    expect(screen.queryByText("Loading")).toBeNull();
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);

    answer(CATEGORIES);
    expect(await within(dialog).findByRole("checkbox", { name: "Animals" })).toBeTruthy();
    expect(dialog.open).toBe(true);
  });

  it("gives each dialog its own heading id, so two on one page keep their names", () => {
    render(() => (
      <>
        <PostDialog api={api} />
        <PostDialog api={api} />
      </>
    ));
    const ids = screen.getAllByRole("dialog").map((d) => d.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(document.getElementById(id!)).toHaveTextContent("New Post");
  });

  it("shows a failed Categories load and retries it (#120 review)", async () => {
    categoryListMock.mockRejectedValueOnce(new Error("RPC Error: down"));
    const user = userEvent.setup();
    render(() => <PostDialog api={api} />);
    const form = within(screen.getByRole("dialog"));

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

  it("submits the draft, then closes once the Post has landed", async () => {
    let land!: (post: PostView) => void;
    postCreateMock.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const { user, dialog, form, onClose } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));

    await user.click(form.getByRole("button", { name: "Post" }));

    expect(postCreateMock).toHaveBeenCalledWith(DRAFT);
    // Until the back-end answers, the dialog stays open and the submit is busy.
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(form.getByRole("button", { name: "Posting…" })).toHaveProperty("disabled", true);

    land(CREATED);

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("cannot be dismissed while the Post is in flight", async () => {
    let land!: (post: PostView) => void;
    postCreateMock.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const { user, dialog, form, onClose } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));
    await user.click(form.getByRole("button", { name: "Post" }));

    // Cancel is disabled, Esc (the dialog's `cancel` event) is refused, and a
    // browser close opens the dialog again.
    expect(form.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);
    const esc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    dialog.close();
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    land(CREATED);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("shows the back-end rejection and keeps the dialog open", async () => {
    postCreateMock.mockRejectedValue(new Error("RPC Error: unsafe URL"));
    const { user, dialog, form, onClose } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Landscape" }));

    await user.click(form.getByRole("button", { name: "Post" }));

    expect((await form.findByRole("alert")).textContent).toContain("unsafe URL");
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Tab and Shift+Tab keep focus in the dialog, and wrap (#210)", async () => {
    const user = userEvent.setup();
    render(() => (
      <>
        <button type="button">outside</button>
        <PostDialog api={api} onClose={vi.fn()} />
      </>
    ));
    const form = within(screen.getByRole("dialog"));
    await form.findByRole("checkbox", { name: "Animals" });
    const title = form.getByLabelText("Title");
    const submit = form.getByRole("button", { name: "Post" });

    title.focus();
    await user.tab({ shift: true });
    expect(submit).toHaveFocus();
    await user.tab();
    expect(title).toHaveFocus();
  });

  it('says "Could not add the Post" when the add fails with no message (#210)', async () => {
    postCreateMock.mockRejectedValue({ status: 500 });
    const { user, form } = await openAndFill();
    await user.click(await form.findByRole("checkbox", { name: "Landscape" }));

    await user.click(form.getByRole("button", { name: "Post" }));

    expect(await form.findByRole("alert")).toHaveTextContent("Could not add the Post");
  });

  it("Cancel, Esc and a browser close each close it", async () => {
    const { user, dialog, form, onClose } = await openAndFill();
    await user.click(form.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const esc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(esc);
    expect(esc.defaultPrevented, "the owner closes it, not the browser").toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);

    dialog.close();
    expect(onClose).toHaveBeenCalledTimes(3);
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
    const { dialog, onClose } = renderEdit();
    // Chrome closes a modal dialog on a second Escape, with no `cancel` event.
    dialog.close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Cancel, Escape and a browser close with a Draft ask; Discard closes (#214)", async () => {
    const { user, dialog, form, guard, onClose } = renderEdit();
    await user.type(input(form, "Photographer"), "!");

    await user.click(form.getByRole("button", { name: "Cancel" }));
    expect(guard.pending()).toBe(true);
    guard.cancelMove();

    const esc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(guard.pending()).toBe(true);
    guard.cancelMove();

    dialog.close();
    expect(dialog.open, "the dialog opens again").toBe(true);
    expect(guard.pending()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    guard.confirmMove();
    expect(onClose).toHaveBeenCalledOnce();
    expect(guard.hasDraft()).toBe(false);
  });

  it("a browser close during a Save reopens the dialog; a failed Save keeps the text (PR #216 review)", async () => {
    const { user, dialog, form, guard, onSave, onClose } = renderEdit();
    let fail!: (reason: unknown) => void;
    onSave.mockReturnValueOnce(new Promise<void>((_, reject) => (fail = reject)));
    await user.type(input(form, "Title"), "!");
    await user.click(form.getByRole("button", { name: "Save" }));

    // Chrome closes the dialog while the Save waits.
    dialog.close();
    expect(dialog.open, "the dialog opens again").toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    fail({ status: 500 });
    expect(await form.findByRole("alert")).toHaveTextContent("Could not edit the Post");
    expect(input(form, "Title").value).toBe(`${DRAFT.title}!`);
    expect(guard.hasDraft()).toBe(true);
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

  it("holds a Draft while a field differs from the saved Post; Discard drops it", async () => {
    const { user, form, guard, onClose } = renderEdit();
    expect(guard.hasDraft()).toBe(false);
    await user.type(input(form, "Photographer"), "!");
    expect(guard.hasDraft()).toBe(true);
    await user.type(input(form, "Photographer"), "{Backspace}");
    expect(guard.hasDraft(), "back to the saved value").toBe(false);

    await user.type(input(form, "Photographer"), "!");
    await user.click(form.getByRole("button", { name: "Cancel" }));
    guard.confirmMove();
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
});

describe("<PostDialog /> — the New Post Draft (#214)", () => {
  function renderCreate() {
    const guard = createDraftGuard();
    const onClose = vi.fn();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <PostDialog api={api} onClose={onClose} />
      </DraftGuardContext.Provider>
    ));
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    return { user: userEvent.setup(), dialog, form: within(dialog), guard, onClose };
  }

  it("holds a Draft while a text field is not blank after a trim; spaces alone are not one", async () => {
    const { user, form, guard } = renderCreate();
    expect(guard.hasDraft()).toBe(false);
    await user.type(form.getByLabelText("Photographer"), "   ");
    expect(guard.hasDraft(), "spaces alone").toBe(false);
    await user.type(form.getByLabelText("Photographer"), "x");
    expect(guard.hasDraft()).toBe(true);
    await user.clear(form.getByLabelText("Photographer"));
    expect(guard.hasDraft()).toBe(false);
  });

  it("holds a Draft while a Category is checked", async () => {
    const { user, form, guard } = renderCreate();
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));
    expect(guard.hasDraft()).toBe(true);
    await user.click(form.getByRole("checkbox", { name: "Animals" }));
    expect(guard.hasDraft()).toBe(false);
  });

  it("the Draft has no scope: a move that names scopes does not ask", async () => {
    const { user, form, guard } = renderCreate();
    await user.type(form.getByLabelText("Title"), "typed");
    expect(guard.hasDraftIn([Symbol("post-edit")])).toBe(false);
    expect(guard.hasDraftIn()).toBe(true);
  });

  it("a browser close with a Draft opens the dialog again and asks", async () => {
    const { user, dialog, form, guard, onClose } = renderCreate();
    await user.type(form.getByLabelText("Title"), "typed");
    dialog.close();
    expect(dialog.open).toBe(true);
    expect(guard.pending()).toBe(true);
    guard.cancelMove();
    expect(onClose).not.toHaveBeenCalled();
    expect(form.getByLabelText("Title")).toHaveValue("typed");
  });

  it("stops its Escape, so a document Escape listener does not get it", async () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    try {
      const { user, form } = renderCreate();
      await user.click(form.getByLabelText("Title"));
      await user.keyboard("{Escape}");
      expect(onDocumentKey).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    } finally {
      document.removeEventListener("keydown", onDocumentKey);
    }
  });
});
