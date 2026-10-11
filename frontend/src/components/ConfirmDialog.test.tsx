import { describe, it, expect, vi, beforeAll } from "vite-plus/test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { stubDialogModal } from "~/lib/test-utils";
import ConfirmDialog from "./ConfirmDialog";

beforeAll(stubDialogModal);

const dialog = () => screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;

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
    expect(dialog().open).toBe(false);
    setOpen(true);
    expect(dialog().open).toBe(true);
    expect(dialog()).toHaveAccessibleName("You have unsaved changes. Discard them?");
    setOpen(false);
    expect(dialog().open).toBe(false);
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
    expect(dialog().open).toBe(false);
  });

  it("treats Escape as cancel, and the owner closes it", () => {
    const { setOpen, onConfirm, onCancel } = renderConfirm();
    setOpen(true);
    // A browser fires `cancel` on Escape.
    const notClosed = fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(notClosed, "the dialog does not close itself").toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dialog().open).toBe(false);
  });

  it("a close by the browser itself reports a cancel", () => {
    const { setOpen, onCancel } = renderConfirm();
    setOpen(true);
    dialog().close();
    fireEvent(dialog(), new Event("close"));
    expect(onCancel).toHaveBeenCalledOnce();

    // A close by the owner reports nothing.
    setOpen(true);
    setOpen(false);
    fireEvent(dialog(), new Event("close"));
    expect(onCancel).toHaveBeenCalledOnce();
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
