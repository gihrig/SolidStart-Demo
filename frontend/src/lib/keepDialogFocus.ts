/** The elements that can take focus by Tab. */
const CONTROLS = "a[href], button, input, select, textarea, [tabindex]";

/** A modal dialog's Tab (#210). Tab and Shift+Tab move focus between the
 *  dialog's enabled controls, in page order, and wrap. On its own, a browser
 *  moves focus out of the dialog after its last control, or skips a button.
 *  The dialog calls it from its keydown listener, beside `stopDialogEscape`. */
export function keepDialogFocus(e: KeyboardEvent) {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
  const dialog = e.currentTarget;
  if (!(dialog instanceof Element)) return;
  const controls = [...dialog.querySelectorAll<HTMLElement>(CONTROLS)].filter(
    (el) =>
      el.tabIndex >= 0 && !el.matches(":disabled, input[type='hidden']") && !el.closest("[hidden]"),
  );
  if (controls.length === 0) return;
  e.preventDefault();
  const at = controls.indexOf(document.activeElement as HTMLElement);
  let next = e.shiftKey ? controls.length - 1 : 0;
  if (at !== -1) next = (at + (e.shiftKey ? controls.length - 1 : 1)) % controls.length;
  controls[next].focus();
}
