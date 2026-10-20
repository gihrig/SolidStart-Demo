import { describe, it, expect } from "vite-plus/test";
import { keepDialogFocus } from "./keepDialogFocus";

// A modal dialog keeps Tab inside: Tab and Shift+Tab move focus between its
// enabled controls, and wrap (#210).
describe("keepDialogFocus", () => {
  // An open dialog with its controls in page order: a text field, a disabled
  // field, a hidden field, a checkbox, a heading that takes focus only by
  // script, and a button.
  function setup() {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    dialog.innerHTML = `
      <input id="title" />
      <input id="photo" disabled />
      <input id="secret" type="hidden" />
      <input id="cute" type="checkbox" />
      <h2 id="heading" tabindex="-1">New Post</h2>
      <button id="post" type="button">Post</button>`;
    document.body.append(dialog);
    dialog.addEventListener("keydown", keepDialogFocus);
    const control = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`)!;
    // A key press on the focused element; it bubbles to the dialog.
    const press = (init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
        ...init,
      });
      (document.activeElement ?? dialog).dispatchEvent(e);
      return e;
    };
    return { dialog, control, press, teardown: () => dialog.remove() };
  }

  it("Tab moves to the next enabled control, and wraps from the last to the first", () => {
    const { control, press, teardown } = setup();
    control("title").focus();
    expect(press().defaultPrevented, "the browser does not move focus").toBe(true);
    expect(document.activeElement).toBe(control("cute"));
    press();
    expect(document.activeElement).toBe(control("post"));
    press();
    expect(document.activeElement).toBe(control("title"));
    teardown();
  });

  it("Shift+Tab moves to the previous control, and wraps from the first to the last", () => {
    const { control, press, teardown } = setup();
    control("title").focus();
    press({ shiftKey: true });
    expect(document.activeElement).toBe(control("post"));
    press({ shiftKey: true });
    expect(document.activeElement).toBe(control("cute"));
    teardown();
  });

  it("from a focus outside the controls, Tab goes to the first and Shift+Tab to the last", () => {
    const { control, press, teardown } = setup();
    control("heading").focus();
    press();
    expect(document.activeElement).toBe(control("title"));
    control("heading").focus();
    press({ shiftKey: true });
    expect(document.activeElement).toBe(control("post"));
    teardown();
  });

  it("lets another key, and a Tab with Ctrl, Alt or Meta, through", () => {
    const { control, press, teardown } = setup();
    control("title").focus();
    for (const init of [{ key: "a" }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      expect(press(init).defaultPrevented, JSON.stringify(init)).toBe(false);
      expect(document.activeElement).toBe(control("title"));
    }
    teardown();
  });
});
