import { createEffect, createUniqueId, Show } from "solid-js";

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
 * `CreatePostDialog` is. The cancel button is the default, and Escape cancels.
 * Without a `cancelLabel`, it is a notice: one button, and Escape confirms.
 */
export default function ConfirmDialog(props: ConfirmDialogProps) {
  const messageId = createUniqueId();
  let dialogRef: HTMLDialogElement | undefined;
  let defaultRef: HTMLButtonElement | undefined;
  const cancel = () => (props.onCancel ?? props.onConfirm)();

  createEffect(() => {
    if (!dialogRef) return;
    if (props.open) {
      if (!dialogRef.open) dialogRef.showModal();
      defaultRef?.focus();
    } else if (dialogRef.open) {
      dialogRef.close();
    }
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
      onClose={() => props.open && cancel()}
      aria-labelledby={messageId}
      class="m-auto w-full max-w-sm rounded-2xl p-6 shadow-lg bg-(--theme-card-bg) text-(--theme-card-fg) backdrop:bg-black/50"
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
