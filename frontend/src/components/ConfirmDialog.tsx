import { createUniqueId, Show } from "solid-js";
import ModalDialog from "~/components/ModalDialog";

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
 * A modal confirm (ADR-0030), built on `ModalDialog` (#278), as `PostDialog`
 * is. The cancel button is the default, and Escape cancels. Without a
 * `cancelLabel`, it is a notice: one button, and Escape confirms.
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
  const cancel = () => (props.onCancel ?? props.onConfirm)();

  return (
    <ModalDialog onCancel={cancel} labelledBy={messageId} class="max-w-sm">
      <p id={messageId} class="mb-4">
        {props.message}
      </p>
      <div class="flex justify-end gap-2">
        {/* The default button has `autofocus`: the open focuses it. */}
        <Show
          when={props.cancelLabel}
          fallback={
            <button
              type="button"
              autofocus
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
              <button type="button" autofocus onClick={() => cancel()} class="theme-button-primary">
                {cancelLabel()}
              </button>
            </>
          )}
        </Show>
      </div>
    </ModalDialog>
  );
}
