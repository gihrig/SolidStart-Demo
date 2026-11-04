import { onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import type { Accessor } from "solid-js";

/** What closed the panel: Escape, a click outside, or focus that moved outside. */
export type DismissReason = "escape" | "click" | "focus";

/** The inside of a panel: one element, or more than one when no one element
 *  holds both the panel and its toggle button (#248). */
export type DismissBoundary = HTMLElement | undefined | readonly (HTMLElement | undefined)[];

export interface DismissOptions {
  /** Focus that moves outside the boundary dismisses too (#248). It needs a `ref`. */
  focusOut?: boolean;
}

export function useDismiss(
  onDismiss: (reason: DismissReason) => void,
  active: Accessor<boolean>,
  ref?: () => DismissBoundary,
  options: DismissOptions = {},
) {
  if (isServer) return;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && active()) onDismiss("escape");
  }
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  if (!ref) return;

  // A boundary with no element yet has no inside, so nothing is outside it. The
  // event path is set when the event starts. A click handler can remove the
  // target first (a toggle button swaps its icon), and the path still holds
  // the boundary element.
  function isOutside(e: Event) {
    const boundary = ref!();
    const elements = (Array.isArray(boundary) ? boundary : [boundary]).filter(
      (el): el is HTMLElement => el !== undefined,
    );
    const path = e.composedPath();
    return elements.length > 0 && !elements.some((el) => path.includes(el));
  }

  function onClick(e: MouseEvent) {
    if (active() && isOutside(e)) onDismiss("click");
  }
  document.addEventListener("click", onClick);
  onCleanup(() => document.removeEventListener("click", onClick));

  if (!options.focusOut) return;

  function onFocusIn(e: FocusEvent) {
    if (active() && isOutside(e)) onDismiss("focus");
  }
  document.addEventListener("focusin", onFocusIn);
  onCleanup(() => document.removeEventListener("focusin", onFocusIn));
}
