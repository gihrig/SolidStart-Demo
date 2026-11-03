import { onCleanup, onMount, type JSX } from "solid-js";
import { isImeKey } from "~/lib/isImeKey";
import { keepDialogFocus } from "~/lib/keepDialogFocus";

export interface ModalDialogProps {
  /** The Cancel. Escape and a browser close run it. The owner unmounts the
   *  dialog to close it: the module never closes it on its own. */
  onCancel: () => void;
  /** While true, Escape does nothing. A browser close opens the dialog again
   *  and runs no Cancel. */
  busy?: boolean;
  /** While true, a browser close opens the dialog again before the Cancel.
   *  So the Cancel's question shows over the dialog (a Draft). */
  reopen?: boolean;
  /** The id of the element that names the dialog. */
  labelledBy: string;
  class?: string;
  children: JSX.Element;
}

/**
 * A modal dialog (#278, ADR-0030): a native `<dialog>` opened with
 * `showModal()` on mount. The owner unmounts it to close it; the unmount closes
 * it in the browser, so focus returns. Each dialog gives its content and its
 * Cancel; this module owns the open, Escape, the browser close and Tab.
 *
 * The first focus is the `autofocus` element, by the browser's rule.
 */
export default function ModalDialog(props: ModalDialogProps) {
  let dialogRef: HTMLDialogElement | undefined;

  onMount(() => dialogRef?.showModal());
  // The owner's close. The `close` event that follows is not a browser close.
  let closing = false;
  onCleanup(() => {
    closing = true;
    if (dialogRef?.open) dialogRef.close();
  });

  // Escape fires `cancel`. A `cancel` that can be stopped is stopped: the
  // owner closes the dialog. A browser stops no `cancel` after repeated
  // Escape (measured 2026-11-02 in Chromium, Firefox and WebKit). Then the
  // module does nothing, and the `close` that comes next is the Cancel. So one
  // Escape runs the Cancel one time only.
  const handleCancel = (e: Event) => {
    if (!e.cancelable) return;
    e.preventDefault();
    if (!props.busy) props.onCancel();
  };

  // A browser close. While busy, the dialog opens again, so the result stays
  // visible. With `reopen`, it opens again before the Cancel, so the Cancel's
  // question shows over it: the browser puts the last opened modal on top.
  const handleClose = () => {
    if (closing) return;
    if (props.busy) return dialogRef?.showModal();
    if (props.reopen) dialogRef?.showModal();
    props.onCancel();
  };

  // The dialog's Escape stops here, so a document listener (`useDismiss`) does
  // not close a menu or the sidebar behind it (#214). An Escape that ends an
  // IME composition is not a Cancel: `preventDefault` stops the browser's
  // `cancel` event (#251).
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (isImeKey(e)) e.preventDefault();
    }
    keepDialogFocus(e);
  };

  return (
    <dialog
      ref={(el) => (dialogRef = el)}
      onCancel={handleCancel}
      onClose={handleClose}
      on:keydown={handleKeyDown}
      aria-labelledby={props.labelledBy}
      class={props.class ? `theme-dialog ${props.class}` : "theme-dialog"}
    >
      {props.children}
    </dialog>
  );
}
