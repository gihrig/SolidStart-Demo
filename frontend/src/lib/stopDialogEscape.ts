import { isImeKey } from "~/lib/isImeKey";

/** A dialog's Escape (#214). It stops here, so a document listener
 *  (`useDismiss`) does not close a menu or the sidebar behind the dialog. An
 *  Escape that ends an IME composition is not a Cancel: `preventDefault`
 *  stops the browser's `cancel` event. */
export function stopDialogEscape(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  if (isImeKey(e)) e.preventDefault();
}
