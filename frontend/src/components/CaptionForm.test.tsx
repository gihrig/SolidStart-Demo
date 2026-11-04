import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import { createDraftGuard, createDraftScope } from "~/lib/createDraftGuard";
import type { CaptionView } from "~/types/jedi";
import CaptionForm, { type CaptionFormProps } from "./CaptionForm";
import { DraftGuardContext, DraftScopeContext } from "./DraftGuardContext";

const ADDED: CaptionView = {
  id: 99,
  postId: 1,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("") },
  text: "Use the Force, Kitty",
  likeCount: 0,
  commentCount: 0,
};

// The add mode's save (the view-model's `addCaption`, through its owner, #283).
const onSaveMock = vi.fn<(text: string) => Promise<CaptionView>>();

beforeEach(() => {
  onSaveMock.mockReset();
});

function renderForm(props: Partial<CaptionFormProps> = {}) {
  const user = userEvent.setup();
  render(() => <CaptionForm onSave={onSaveMock} {...props} />);
  return { user, input: screen.getByLabelText("Your caption") as HTMLInputElement };
}

describe("<CaptionForm />", () => {
  it("submits the text for the Post, then clears the input (#121)", async () => {
    onSaveMock.mockResolvedValue(ADDED);
    const { user, input } = renderForm();

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(onSaveMock).toHaveBeenCalledWith(ADDED.text);
    await waitFor(() => expect(input.value).toBe(""));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the back-end rejection and keeps the text", async () => {
    onSaveMock.mockRejectedValue(new Error("text: too long"));
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
    onSaveMock.mockResolvedValue({ ...ADDED, text: caption });
    const { user, input } = renderForm();
    expect(input.maxLength).toBe(-1); // no UTF-16 cap on the input

    await user.click(input);
    await user.paste(caption);
    expect(screen.getByText("36/36")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(onSaveMock).toHaveBeenCalledWith(caption);
  });

  it("over the cap: flags the count and the input, and blocks the submit", async () => {
    const { user, input } = renderForm();

    await user.click(input);
    await user.paste("a".repeat(37));
    expect(screen.getByText("37/36")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Add Caption" })).toBeDisabled();

    await user.keyboard("{Enter}");
    expect(onSaveMock).not.toHaveBeenCalled();
  });

  it("resets the count after a committed submit", async () => {
    onSaveMock.mockResolvedValue(ADDED);
    const { user, input } = renderForm();

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));
    await waitFor(() => expect(screen.getByText("0/36")).toBeInTheDocument());
  });

  it("calls onSaved once the back-end commits the new Caption", async () => {
    onSaveMock.mockResolvedValue(ADDED);
    const onSaved = vi.fn();
    const { user, input } = renderForm({ onSaved });

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it("does not call onSaved when the back-end rejects the Caption", async () => {
    onSaveMock.mockRejectedValue(new Error("text: too long"));
    const onSaved = vi.fn();
    const { user, input } = renderForm({ onSaved });

    await user.type(input, "rejected");
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    await screen.findByRole("alert");
    expect(onSaved).not.toHaveBeenCalled();
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
    onSaveMock.mockReturnValue(new Promise((r) => (resolve = r)));
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
  const scope = createDraftScope("caption-edit");

  function renderEdit() {
    const [caption, setCaption] = createSignal(ADDED);
    const onSave = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    const guard = createDraftGuard();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <DraftScopeContext.Provider value={scope}>
          <CaptionForm caption={caption()} onSave={onSave} onSaved={onSaved} onCancel={onCancel} />
        </DraftScopeContext.Provider>
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
  });

  it("holds a Draft in its scope while the text differs; Cancel asks, and Discard drops it", async () => {
    const { user, input, guard, onCancel } = renderEdit();
    expect(guard.hasDraftIn(scope)).toBe(false);
    await user.type(input, "!");
    expect(guard.hasDraftIn(scope)).toBe(true);

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
  const scope = createDraftScope("add-caption");

  function renderGuarded(props: Partial<CaptionFormProps> = {}) {
    const guard = createDraftGuard();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <DraftScopeContext.Provider value={scope}>
          <CaptionForm onSave={onSaveMock} {...props} />
        </DraftScopeContext.Provider>
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
});
