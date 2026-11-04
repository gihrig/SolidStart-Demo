import { describe, it, expect, vi, beforeAll } from "vite-plus/test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, Show } from "solid-js";
import { stubDialogModal } from "~/lib/test-utils";
import ModalDialog from "./ModalDialog";

beforeAll(stubDialogModal);

const dialog = () => screen.getByRole("dialog") as HTMLDialogElement;
const shown = () => screen.queryByRole("dialog", { hidden: true });

// A small test dialog. Its owner holds the open state, and its Cancel
// unmounts it, unless `keepOnCancel` is set.
function renderTestDialog(options: { keepOnCancel?: boolean } = {}) {
  const [open, setOpen] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [reopen, setReopen] = createSignal(false);
  // The dialog's state when the Cancel runs.
  const openAtCancel: boolean[] = [];
  const onCancel = vi.fn(() => {
    openAtCancel.push((shown() as HTMLDialogElement).open);
    if (!options.keepOnCancel) setOpen(false);
  });
  render(() => (
    <>
      <button type="button">outside</button>
      <Show when={open()}>
        <ModalDialog
          onCancel={onCancel}
          busy={busy()}
          reopen={reopen()}
          labelledBy="test-heading"
          class="max-w-sm"
        >
          <h2 id="test-heading">Test dialog</h2>
          <input aria-label="Name" />
          <button type="button">First</button>
          <button type="button" autofocus>
            Default
          </button>
        </ModalDialog>
      </Show>
    </>
  ));
  return { setOpen, setBusy, setReopen, onCancel, openAtCancel };
}

// A browser fires `cancel` on Escape. After repeated Escape, its `cancel` is
// not cancelable, and a `close` comes next (measured 2026-11-02, #278).
const escape = () => {
  const e = new Event("cancel", { cancelable: true });
  dialog().dispatchEvent(e);
  return e;
};

describe("<ModalDialog />", () => {
  it("opens as a modal on mount, named by `labelledBy`, with its class", () => {
    renderTestDialog();
    expect(dialog().open).toBe(true);
    expect(dialog()).toHaveAccessibleName("Test dialog");
    expect(dialog()).toHaveClass("theme-dialog", "max-w-sm");
  });

  it("closes in the browser on unmount, and runs no Cancel", () => {
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    try {
      const { setOpen, onCancel } = renderTestDialog();
      const first = dialog();
      setOpen(false);
      expect(close).toHaveBeenCalledOnce();
      expect(close.mock.contexts[0]).toBe(first);
      expect(shown()).toBeNull();
      expect(onCancel).not.toHaveBeenCalled();
    } finally {
      close.mockRestore();
    }
  });

  it("gives the first focus to the `autofocus` element", () => {
    renderTestDialog();
    expect(screen.getByRole("button", { name: "Default" })).toHaveFocus();
  });

  it("Escape runs the Cancel; the module stops the `cancel`, so the owner closes it", () => {
    const { onCancel } = renderTestDialog();
    const e = escape();
    expect(e.defaultPrevented, "the dialog does not close itself").toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(shown()).toBeNull();
  });

  it("with `busy`, Escape does nothing", () => {
    const { setBusy, onCancel } = renderTestDialog();
    setBusy(true);
    const e = escape();
    expect(e.defaultPrevented).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
  });

  it("a `cancel` that cannot be stopped does nothing; the browser close then runs the Cancel once", () => {
    const { onCancel } = renderTestDialog({ keepOnCancel: true });
    dialog().dispatchEvent(new Event("cancel", { cancelable: false }));
    expect(onCancel).not.toHaveBeenCalled();
    dialog().close();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("a browser close runs the Cancel, and does not open the dialog again", () => {
    const { onCancel, openAtCancel } = renderTestDialog({ keepOnCancel: true });
    dialog().close();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(openAtCancel).toEqual([false]);
    expect((shown() as HTMLDialogElement).open).toBe(false);
  });

  it("with `busy`, a browser close opens the dialog again and runs no Cancel", () => {
    const { setBusy, onCancel } = renderTestDialog();
    setBusy(true);
    dialog().close();
    expect(dialog().open).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("with `reopen`, a browser close opens the dialog again before the Cancel", () => {
    const { setReopen, onCancel, openAtCancel } = renderTestDialog({ keepOnCancel: true });
    setReopen(true);
    dialog().close();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(openAtCancel, "the Cancel's question shows over the dialog").toEqual([true]);
    expect(dialog().open).toBe(true);
  });

  it("stops its Escape, so a document Escape listener does not get it", () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    try {
      renderTestDialog();
      const e = fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
      expect(onDocumentKey).not.toHaveBeenCalled();
      expect(e, "the browser still fires `cancel`").toBe(true);
    } finally {
      document.removeEventListener("keydown", onDocumentKey);
    }
  });

  it("lets another key through to the document", () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    try {
      renderTestDialog();
      fireEvent.keyDown(screen.getByLabelText("Name"), { key: "a" });
      expect(onDocumentKey).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener("keydown", onDocumentKey);
    }
  });

  it("an Escape that ends an IME composition is not a Cancel: the browser fires no `cancel`", () => {
    renderTestDialog();
    const notPrevented = fireEvent.keyDown(screen.getByLabelText("Name"), {
      key: "Escape",
      isComposing: true,
    });
    expect(notPrevented).toBe(false);
  });

  // Safari can send a composition key with `isComposing` false and `keyCode`
  // 229 (WebKit bug 165004).
  it("Safari's composition Escape (keyCode 229, isComposing false) is not a Cancel (#251)", () => {
    renderTestDialog();
    const notPrevented = fireEvent.keyDown(screen.getByLabelText("Name"), {
      key: "Escape",
      isComposing: false,
      keyCode: 229,
    });
    expect(notPrevented).toBe(false);
  });

  it("Tab and Shift+Tab keep focus in the dialog, and wrap (#210)", async () => {
    const user = userEvent.setup();
    renderTestDialog();
    const name = screen.getByLabelText("Name");
    const defaultButton = screen.getByRole("button", { name: "Default" });

    await user.tab();
    expect(name).toHaveFocus();
    await user.tab({ shift: true });
    expect(defaultButton).toHaveFocus();
  });
});
