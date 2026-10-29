import { tabStops } from "~/lib/keepDialogFocus";

/** The id of the element that holds the route content: the page between the
 *  header (`Nav`) and the `Footer`. `app.tsx` sets it (#248). */
export const ROUTE_CONTENT_ID = "route-content";

/** Gives focus to the first item in the route content that takes focus, else to
 *  `fallback` (#248). An item that a style hides refuses focus, so the next one
 *  gets it. */
export function focusRouteContent(fallback: HTMLElement | undefined) {
  const root = document.getElementById(ROUTE_CONTENT_ID);
  for (const el of root ? tabStops(root) : []) {
    el.focus();
    if (document.activeElement === el) return;
  }
  fallback?.focus();
}
