import { isImeKey } from "~/lib/isImeKey";

/** The elements that can take focus by Tab. */
const CONTROLS = "a[href], button, input, select, textarea, [tabindex]";

/** The radio inputs in `root` that share the group of `radio`. */
function radioGroup(root: Element, radio: HTMLInputElement) {
  return [...root.querySelectorAll<HTMLInputElement>("input[type='radio']")].filter(
    (el) => el.name === radio.name && el.form === radio.form,
  );
}

/** A radio group is one Tab stop, as in a browser: its checked radio, or its
 *  first radio when none is checked (#248). */
function isGroupStop(root: Element, radio: HTMLInputElement) {
  if (!radio.name) return true;
  const group = radioGroup(root, radio);
  return radio.checked || (!group.some((el) => el.checked) && group[0] === radio);
}

/** The Tab stops in `root`, in page order: its enabled controls, with one stop
 *  for each radio group. */
export function tabStops(root: Element) {
  return [...root.querySelectorAll<HTMLElement>(CONTROLS)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(":disabled, input[type='hidden']") &&
      !el.closest("[hidden], [inert]") &&
      (!(el instanceof HTMLInputElement) || el.type !== "radio" || isGroupStop(root, el)),
  );
}

/** A modal dialog's Tab (#210), and the Profile menu's (#248). Tab and
 *  Shift+Tab move focus between the Tab stops of `e.currentTarget`, in page
 *  order, and wrap. On its own, a browser moves focus out after the last
 *  control, or skips a button. The caller calls it from its keydown listener. */
export function keepDialogFocus(e: KeyboardEvent) {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey || isImeKey(e)) return;
  const dialog = e.currentTarget;
  if (!(dialog instanceof Element)) return;
  const controls = tabStops(dialog);
  if (controls.length === 0) return;
  e.preventDefault();
  // A focused radio that is not its group's stop counts as that stop.
  const active = document.activeElement;
  const at = controls.findIndex(
    (el) =>
      el === active ||
      (active instanceof HTMLInputElement &&
        active.type === "radio" &&
        el instanceof HTMLInputElement &&
        radioGroup(dialog, active).includes(el)),
  );
  let next = e.shiftKey ? controls.length - 1 : 0;
  if (at !== -1) next = (at + (e.shiftKey ? controls.length - 1 : 1)) % controls.length;
  controls[next].focus();
}
