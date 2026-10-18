import { describe, it, expect, vi } from "vite-plus/test";
import { stopDialogEscape } from "./stopDialogEscape";

// A dialog's Escape stops at the dialog, so a document listener (`useDismiss`)
// does not get it (#214).
describe("stopDialogEscape", () => {
  // The handler on a dialog, and a listener on the document.
  function setup() {
    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    dialog.addEventListener("keydown", stopDialogEscape);
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    const press = (init: KeyboardEventInit) => {
      const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      dialog.dispatchEvent(e);
      return e;
    };
    const teardown = () => {
      document.removeEventListener("keydown", onDocumentKey);
      dialog.remove();
    };
    return { press, onDocumentKey, teardown };
  }

  it("stops an Escape and leaves its default action", () => {
    const { press, onDocumentKey, teardown } = setup();
    const e = press({ key: "Escape" });
    expect(onDocumentKey).not.toHaveBeenCalled();
    expect(e.defaultPrevented, "the browser still fires `cancel`").toBe(false);
    teardown();
  });

  it("lets another key through", () => {
    const { press, onDocumentKey, teardown } = setup();
    const e = press({ key: "a" });
    expect(onDocumentKey).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(false);
    teardown();
  });
});
