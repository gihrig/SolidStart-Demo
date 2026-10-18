import { createUniqueId, onCleanup, onMount, Show } from "solid-js";

export interface ConfirmDialogProps {
  /** The owner holds the open state; the dialog never closes itself. */
  open: boolean;
  /** The question or the notice. It also names the dialog. */
  message: string;
  confirmLabel: string;
  /** The default button. Without it, the dialog shows one button and works as
   *  a notice. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

/**
 * A modal confirm (ADR-0030): a native `<dialog>` opened with `showModal()`, as
 * `PostDialog` is. The cancel button is the default, and Escape cancels.
 * Without a `cancelLabel`, it is a notice: one button, and Escape confirms.
 *
 * Each open mounts a fresh `<dialog>` (#214): Chromium closes a reused modal
 * dialog that opens with no user gesture over another one, such as the
 * route-move question after the browser's Back over the New Post dialog.
 */
export default function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Show when={props.open}>
      <OpenConfirmDialog {...props} />
    </Show>
  );
}

function OpenConfirmDialog(props: ConfirmDialogProps) {
  const messageId = createUniqueId();
  let dialogRef: HTMLDialogElement | undefined;
  let defaultRef: HTMLButtonElement | undefined;
  const cancel = () => (props.onCancel ?? props.onConfirm)();

  onMount(() => {
    dialogRef?.showModal();
    defaultRef?.focus();
  });
  // The owner's close: close it in the browser too, which returns focus to the
  // element that had it before the open. It reports nothing.
  let closing = false;
  onCleanup(() => {
    closing = true;
    if (dialogRef?.open) dialogRef.close();
  });

  return (
    <dialog
      ref={(el) => (dialogRef = el)}
      // Esc fires `cancel`. The owner's state closes the dialog, not the browser.
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      // A browser can still close it (Chrome closes on a second Escape). Then
      // the owner must hear a cancel, or its state stays open with no dialog.
      onClose={() => !closing && cancel()}
      // Escape stops here, so a document listener (`useDismiss`) does not close
      // a menu or the sidebar behind the dialog (#214).
      on:keydown={(e) => e.key === "Escape" && e.stopPropagation()}
      aria-labelledby={messageId}
      class="theme-dialog max-w-sm"
    >
      <p id={messageId} class="mb-4">
        {props.message}
      </p>
      <div class="flex justify-end gap-2">
        <Show
          when={props.cancelLabel}
          fallback={
            <button
              ref={(el) => (defaultRef = el)}
              type="button"
              onClick={() => props.onConfirm()}
              class="theme-button-primary"
            >
              {props.confirmLabel}
            </button>
          }
        >
          {(cancelLabel) => (
            <>
              <button type="button" onClick={() => props.onConfirm()} class="theme-button">
                {props.confirmLabel}
              </button>
              <button
                ref={(el) => (defaultRef = el)}
                type="button"
                onClick={() => cancel()}
                class="theme-button-primary"
              >
                {cancelLabel()}
              </button>
            </>
          )}
        </Show>
      </div>
    </dialog>
  );
}
