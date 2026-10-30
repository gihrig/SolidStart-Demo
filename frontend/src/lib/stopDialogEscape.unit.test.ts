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
    const press = (init: KeyboardEventInit & { keyCode?: number }) => {
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

  it("an Escape that ends an IME composition is not a Cancel: the browser fires no `cancel`", () => {
    const { press, onDocumentKey, teardown } = setup();
    const e = press({ key: "Escape", isComposing: true });
    expect(onDocumentKey).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    teardown();
  });

  // Safari can send a composition key with `isComposing` false and `keyCode`
  // 229 (WebKit bug 165004).
  it("Safari's composition Escape (keyCode 229, isComposing false) is not a Cancel (#251)", () => {
    const { press, onDocumentKey, teardown } = setup();
    const e = press({ key: "Escape", isComposing: false, keyCode: 229 });
    expect(onDocumentKey).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
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
