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

  // A radio group is one Tab stop, as in a browser: the checked radio, or the
  // first radio when none is checked. The arrow keys move inside it (#248).
  it("gives a radio group one Tab stop: the checked radio, else the first", () => {
    const panel = document.createElement("div");
    panel.innerHTML = `
      <button id="first" type="button">My Profile</button>
      <input id="system" type="radio" name="theme" />
      <input id="light" type="radio" name="theme" />
      <input id="dark" type="radio" name="theme" />
      <button id="last" type="button">Last</button>`;
    document.body.append(panel);
    panel.addEventListener("keydown", keepDialogFocus);
    const control = (id: string) => panel.querySelector<HTMLInputElement>(`#${id}`)!;
    const press = (init: KeyboardEventInit = {}) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, ...init }),
      );

    control("first").focus();
    press();
    expect(document.activeElement, "no radio checked: the first radio").toBe(control("system"));
    press();
    expect(document.activeElement).toBe(control("last"));

    control("light").checked = true;
    press({ shiftKey: true });
    expect(document.activeElement, "the checked radio").toBe(control("light"));
    press({ shiftKey: true });
    expect(document.activeElement).toBe(control("first"));

    // A focused radio that is not the stop counts as its group's stop.
    control("dark").focus();
    press();
    expect(document.activeElement).toBe(control("last"));
    panel.remove();
  });

  it("skips a control inside an inert element", () => {
    const panel = document.createElement("div");
    panel.innerHTML = `
      <button id="a" type="button">A</button>
      <div inert><button id="b" type="button">B</button></div>
      <button id="c" type="button">C</button>`;
    document.body.append(panel);
    panel.addEventListener("keydown", keepDialogFocus);
    panel.querySelector<HTMLElement>("#a")!.focus();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(panel.querySelector("#c"));
    panel.remove();
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
