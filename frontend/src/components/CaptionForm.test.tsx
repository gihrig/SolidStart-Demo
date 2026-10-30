import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor, fireEvent } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, Show } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import { createDraftGuard } from "~/lib/createDraftGuard";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { CaptionView } from "~/types/jedi";
import CaptionForm, { type CaptionFormProps } from "./CaptionForm";
import { DraftGuardContext } from "./DraftGuardContext";

const ADDED: CaptionView = {
  id: 99,
  postId: 1,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("") },
  text: "Use the Force, Kitty",
  likeCount: 0,
  commentCount: 0,
};

const captionAddMock = vi.fn<JediApi["captions"]["add"]>();
const api = { captions: { add: captionAddMock } };

beforeEach(() => {
  captionAddMock.mockReset();
});

function renderForm(props: Partial<CaptionFormProps> = {}) {
  const user = userEvent.setup();
  render(() => <CaptionForm postId={1} api={api} {...props} />);
  return { user, input: screen.getByLabelText("Your caption") as HTMLInputElement };
}

describe("<CaptionForm />", () => {
  it("submits the text for the Post, then clears the input (#121)", async () => {
    captionAddMock.mockResolvedValue(ADDED);
    const { user, input } = renderForm();

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(captionAddMock).toHaveBeenCalledWith(1, ADDED.text);
    await waitFor(() => expect(input.value).toBe(""));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the back-end rejection and keeps the text", async () => {
    captionAddMock.mockRejectedValue(new Error("text: too long"));
    const { user, input } = renderForm();

    await user.type(input, "rejected");
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("text: too long");
    expect(input.value).toBe("rejected");
  });

  it("shows a live count against the 36-character cap", async () => {
    const { user, input } = renderForm();
    expect(screen.getByText("0/36")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-describedby", screen.getByText("0/36").id);
    expect(input.required).toBe(true);

    await user.type(input, "hello");
    expect(screen.getByText("5/36")).toBeInTheDocument();
  });

  it("counts as the back-end does: 36 emoji fit (#185 review)", async () => {
    // `maxLength` counted UTF-16 units, so it stopped this caption at 18 emoji.
    const caption = "😀".repeat(36);
    captionAddMock.mockResolvedValue({ ...ADDED, text: caption });
    const { user, input } = renderForm();
    expect(input.maxLength).toBe(-1); // no UTF-16 cap on the input

    await user.click(input);
    await user.paste(caption);
    expect(screen.getByText("36/36")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(captionAddMock).toHaveBeenCalledWith(1, caption);
  });

  it("over the cap: flags the count and the input, and blocks the submit", async () => {
    const { user, input } = renderForm();

    await user.click(input);
    await user.paste("a".repeat(37));
    expect(screen.getByText("37/36")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Add Caption" })).toBeDisabled();

    await user.keyboard("{Enter}");
    expect(captionAddMock).not.toHaveBeenCalled();
  });

  it("resets the count after a committed submit", async () => {
    captionAddMock.mockResolvedValue(ADDED);
    const { user, input } = renderForm();

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));
    await waitFor(() => expect(screen.getByText("0/36")).toBeInTheDocument());
  });

  it("calls onAdded with the new Caption once the back-end commits it", async () => {
    captionAddMock.mockResolvedValue(ADDED);
    const onAdded = vi.fn();
    const { user, input } = renderForm({ onAdded });

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(ADDED));
  });

  it("does not call onAdded when the back-end rejects the Caption", async () => {
    captionAddMock.mockRejectedValue(new Error("text: too long"));
    const onAdded = vi.fn();
    const { user, input } = renderForm({ onAdded });

    await user.type(input, "rejected");
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    await screen.findByRole("alert");
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("does not call onAdded when it resolves after the form unmounted (#185 review)", async () => {
    let resolve!: (c: CaptionView) => void;
    captionAddMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const onAdded = vi.fn();
    const [shown, setShown] = createSignal(true);
    const user = userEvent.setup();
    render(() => (
      <Show when={shown()}>
        <CaptionForm postId={1} api={api} onAdded={onAdded} />
      </Show>
    ));

    await user.type(screen.getByLabelText("Your caption"), ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));
    setShown(false);
    resolve(ADDED);
    await new Promise((r) => setTimeout(r, 0));

    expect(onAdded).not.toHaveBeenCalled();
  });

  it("offers Cancel only when onCancel is given", async () => {
    const onCancel = vi.fn();
    const { user } = renderForm({ onCancel });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("has no Cancel without onCancel", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("focuses the input on mount only when autofocus is set", () => {
    const { input } = renderForm({ autofocus: true });
    expect(input).toHaveFocus();
  });

  it("disables the submit and Cancel while the Caption is in flight", async () => {
    let resolve!: (c: CaptionView) => void;
    captionAddMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user, input } = renderForm({ onCancel: vi.fn() });

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    resolve(ADDED);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Caption" })).toBeEnabled());
  });
});

describe("<CaptionForm /> — the edit mode (#187)", () => {
  const scope = Symbol("caption-edit");

  function renderEdit() {
    const [caption, setCaption] = createSignal(ADDED);
    const onSave = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    const guard = createDraftGuard();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <CaptionForm
          postId={1}
          api={api}
          caption={caption()}
          draftScope={scope}
          onSave={onSave}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      </DraftGuardContext.Provider>
    ));
    const input = screen.getByLabelText("Edit your caption") as HTMLInputElement;
    return { user: userEvent.setup(), input, onSave, onSaved, onCancel, guard, setCaption };
  }

  it("fills the text and keeps Save disabled until it changes; Save sends the text", async () => {
    const { user, input, onSave, onSaved } = renderEdit();
    expect(input.value).toBe(ADDED.text);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(input, "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(`${ADDED.text}!`);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(captionAddMock).not.toHaveBeenCalled();
  });

  it("holds a Draft in its scope while the text differs; Cancel asks, and Discard drops it", async () => {
    const { user, input, guard, onCancel } = renderEdit();
    expect(guard.hasDraftIn([scope])).toBe(false);
    await user.type(input, "!");
    expect(guard.hasDraftIn([scope])).toBe(true);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(guard.pending()).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    guard.confirmMove();
    expect(guard.hasDraft()).toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows a remote change while the text is unchanged, and keeps a changed text", async () => {
    const { user, input, setCaption } = renderEdit();
    setCaption({ ...ADDED, text: "Remote" });
    expect(input.value).toBe("Remote");

    await user.type(input, "!");
    setCaption({ ...ADDED, text: "Remote again" });
    expect(input.value).toBe("Remote!");
  });

  it("shows the save error and stays open", async () => {
    const { user, input, onSave, onSaved } = renderEdit();
    // A rejection that is not an Error shows the fallback text.
    onSave.mockRejectedValueOnce({ status: 500 });
    await user.type(input, "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not edit the Caption");
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("<CaptionForm /> — Cancel and Escape (#214)", () => {
  const scope = Symbol("add-caption");

  function renderGuarded(props: Partial<CaptionFormProps> = {}) {
    const guard = createDraftGuard();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <CaptionForm postId={1} api={api} draftScope={scope} {...props} />
      </DraftGuardContext.Provider>
    ));
    const input = screen.getByLabelText("Your caption") as HTMLInputElement;
    return { user: userEvent.setup(), input, guard };
  }

  it("Cancel and Escape with a Draft ask; Keep editing keeps the text", async () => {
    const onCancel = vi.fn();
    const { user, input, guard } = renderGuarded({ onCancel });
    await user.type(input, "draft");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(guard.pending()).toBe(true);
    guard.cancelMove();
    expect(input.value).toBe("draft");

    await user.click(input);
    await user.keyboard("{Escape}");
    expect(guard.pending()).toBe(true);
    guard.confirmMove();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(guard.hasDraft()).toBe(false);
  });

  it("an Escape that runs the Cancel cancels the browser's own Escape action (#210)", async () => {
    const { user, input, guard } = renderGuarded({ onCancel: vi.fn() });
    await user.type(input, "draft");
    // The browser would close the question on the same Escape.
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(guard.pending()).toBe(true);
  });

  it("Escape without a Draft closes at once", async () => {
    const onCancel = vi.fn();
    const { user, input, guard } = renderGuarded({ onCancel });
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(guard.pending()).toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("a form without a Cancel ignores Escape", async () => {
    const { user, input, guard } = renderGuarded();
    await user.type(input, "draft");
    await user.keyboard("{Escape}");
    expect(guard.pending()).toBe(false);
    expect(input.value).toBe("draft");
  });

  it("an Escape that ends an IME composition is no Cancel", async () => {
    const onCancel = vi.fn();
    const { input, guard } = renderGuarded({ onCancel });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(guard.pending()).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // Safari can send a composition key with `isComposing` false and `keyCode`
  // 229 (WebKit bug 165004).
  it("Safari's composition Escape (keyCode 229, isComposing false) is no Cancel (#251)", async () => {
    const onCancel = vi.fn();
    const { input, guard } = renderGuarded({ onCancel });
    fireEvent.keyDown(input, { key: "Escape", isComposing: false, keyCode: 229 });
    expect(guard.pending()).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("a document Escape listener does not get the form's Escape", async () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    try {
      const { user, input } = renderGuarded({ onCancel: vi.fn() });
      await user.click(input);
      await user.keyboard("{Escape}");
      expect(onDocumentKey).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onDocumentKey);
    }
  });

  it("during the write, Escape does nothing and a move in its scope does nothing", async () => {
    let resolve!: (c: CaptionView) => void;
    captionAddMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const onCancel = vi.fn();
    const { user, input, guard } = renderGuarded({ onCancel });
    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    await user.click(input);
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    const move = vi.fn();
    guard.attempt(move, [scope]);
    expect(move).not.toHaveBeenCalled();
    expect(guard.pending()).toBe(false);

    resolve(ADDED);
    await waitFor(() => expect(guard.busyIn([scope])).toBe(false));
  });
});
