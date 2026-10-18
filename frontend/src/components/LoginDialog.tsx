import { createEffect, createUniqueId } from "solid-js";
import { stopDialogEscape } from "~/lib/stopDialogEscape";
import { useAuth } from "./AuthContext";
import LoginForm from "./LoginForm";

export interface LoginDialogProps {
  /** Opens the modal when true; the owner sets it false from `onClose`. */
  open: boolean;
  /** Runs on every close: a successful login, Cancel, or Escape. */
  onClose: () => void;
}

/**
 * The login overlay (#128): the LoginForm in a modal `<dialog>`. The Nav owns
 * the open state. A successful login closes the dialog; a failed one keeps it
 * open with the error. Cancel and Escape close it, except while the login is in
 * flight. Each open clears the last error.
 */
export default function LoginDialog(props: LoginDialogProps) {
  const { pending, resetError } = useAuth();
  const headingId = createUniqueId();
  let dialogRef: HTMLDialogElement | undefined;

  createEffect(() => {
    if (props.open) {
      resetError();
      dialogRef?.showModal();
    } else if (dialogRef?.open) {
      dialogRef.close();
    }
  });

  return (
    <dialog
      ref={(el) => (dialogRef = el)}
      // Esc fires `cancel`: refuse it while the login is in flight, so the
      // result (the close, or the error) stays visible.
      onCancel={(e) => pending() && e.preventDefault()}
      onClose={() => props.onClose()}
      on:keydown={stopDialogEscape}
      aria-labelledby={headingId}
      class="theme-dialog max-w-md"
    >
      <LoginForm
        headingId={headingId}
        onSuccess={() => dialogRef?.close()}
        onCancel={() => dialogRef?.close()}
      />
    </dialog>
  );
}
