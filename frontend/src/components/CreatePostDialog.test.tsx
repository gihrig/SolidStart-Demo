import { describe, it, expect, vi, beforeAll, beforeEach } from "vite-plus/test";
import { render, screen, within, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Suspense } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { JediCategory, PostDraft, PostView } from "~/types/jedi";
import CreatePostDialog from "./CreatePostDialog";

// jsdom has `HTMLDialogElement` but not its modal methods; this minimal stand-in
// toggles the `open` attribute, the state a browser's `showModal` / `close` set.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

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
  render(() => <CreatePostDialog api={api} />);
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

describe("<CreatePostDialog />", () => {
  it("opens as a modal and loads the Categories to choose from", async () => {
    const user = userEvent.setup();
    render(() => <CreatePostDialog api={api} />);
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
    render(() => <CreatePostDialog api={api} triggerLabel="Add" triggerAriaLabel="Add Post" />);
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
        <CreatePostDialog api={api} triggerLabel="Add" triggerAriaLabel="Add Post" />
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
        <CreatePostDialog api={api} />
        <CreatePostDialog api={api} triggerLabel="Add" triggerAriaLabel="Add Post" />
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
    render(() => <CreatePostDialog api={api} />);
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
});
