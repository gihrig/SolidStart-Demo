/** A dialog's Escape (#214). It stops here, so a document listener
 *  (`useDismiss`) does not close a menu or the sidebar behind the dialog. */
export function stopDialogEscape(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.stopPropagation();
}
