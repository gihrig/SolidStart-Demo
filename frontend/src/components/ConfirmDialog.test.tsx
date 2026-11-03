import { describe, it, expect, vi, beforeAll } from "vite-plus/test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { stubDialogModal } from "~/lib/test-utils";
import ConfirmDialog from "./ConfirmDialog";

beforeAll(stubDialogModal);

const dialog = () => screen.getByRole("dialog") as HTMLDialogElement;
const shown = () => screen.queryByRole("dialog", { hidden: true });

function renderConfirm() {
  const [open, setOpen] = createSignal(false);
  const onConfirm = vi.fn(() => setOpen(false));
  const onCancel = vi.fn(() => setOpen(false));
  render(() => (
    <ConfirmDialog
      open={open()}
      message="You have unsaved changes. Discard them?"
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  ));
  return { setOpen, onConfirm, onCancel };
}

describe("<ConfirmDialog />", () => {
  it("opens as a modal while `open`, named by its message", () => {
    const { setOpen } = renderConfirm();
    expect(shown()).toBeNull();
    setOpen(true);
    expect(dialog().open).toBe(true);
    expect(dialog()).toHaveAccessibleName("You have unsaved changes. Discard them?");
    setOpen(false);
    expect(shown()).toBeNull();
  });

  it("each open shows a fresh dialog, and the owner's close closes it in the browser (#214)", () => {
    // Chromium closes a reused modal dialog that opens with no user gesture
    // over another one, such as the route-move question after the browser's
    // Back over the New Post dialog. The browser's close returns focus.
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    try {
      const { setOpen } = renderConfirm();
      setOpen(true);
      const first = dialog();
      setOpen(false);
      expect(close).toHaveBeenCalledOnce();
      expect(close.mock.contexts[0]).toBe(first);
      setOpen(true);
      expect(dialog()).not.toBe(first);
    } finally {
      close.mockRestore();
    }
  });

  it("focuses the cancel button, the default", () => {
    const { setOpen } = renderConfirm();
    setOpen(true);
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });

  it("reports each result: confirm and cancel", async () => {
    const user = userEvent.setup();
    const { setOpen, onConfirm, onCancel } = renderConfirm();
    setOpen(true);
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onCancel).toHaveBeenCalledOnce();

    setOpen(true);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(shown()).toBeNull();
  });

  it("treats Escape as cancel, and the owner closes it", () => {
    const { setOpen, onConfirm, onCancel } = renderConfirm();
    setOpen(true);
    // A browser fires `cancel` on Escape.
    const notClosed = fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(notClosed, "the dialog does not close itself").toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(shown()).toBeNull();
  });

  it("without a cancelLabel, shows one OK button and works as a notice", () => {
    const onConfirm = vi.fn();
    render(() => (
      <ConfirmDialog
        open
        message="This Comment was deleted. Your unsaved changes were discarded."
        confirmLabel="OK"
        onConfirm={onConfirm}
      />
    ));
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["OK"]);
    expect(buttons[0]).toHaveFocus();

    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(onConfirm, "Escape means OK").toHaveBeenCalledOnce();
  });
});
