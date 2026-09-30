import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, Show } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { CaptionView } from "~/types/jedi";
import AddCaptionForm, { type AddCaptionFormProps } from "./AddCaptionForm";

const ADDED: CaptionView = {
  id: 99,
  postId: 1,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("") },
  text: "Use the Force, Kitty",
  likeCount: 0,
};

const captionAddMock = vi.fn<JediApi["captions"]["add"]>();
const api = { captions: { add: captionAddMock } };

beforeEach(() => {
  captionAddMock.mockReset();
});

function renderForm(props: Partial<AddCaptionFormProps> = {}) {
  const user = userEvent.setup();
  render(() => <AddCaptionForm postId={1} api={api} {...props} />);
  return { user, input: screen.getByLabelText("Your caption") as HTMLInputElement };
}

describe("<AddCaptionForm />", () => {
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

  it("caps the input at the back-end limit of 36 characters", () => {
    const { input } = renderForm();
    expect(input.maxLength).toBe(36);
    expect(input.required).toBe(true);
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
        <AddCaptionForm postId={1} api={api} onAdded={onAdded} />
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
