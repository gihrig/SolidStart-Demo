import { createUniqueId } from "solid-js";
import { useAuth } from "./AuthContext";
import LoginForm from "./LoginForm";
import ModalDialog from "./ModalDialog";

export interface LoginDialogProps {
  /** Runs on every close: a successful login, Cancel, or Escape. The owner
   *  unmounts the dialog to close it. */
  onClose: () => void;
}

/**
 * The login overlay (#128): the LoginForm in a `ModalDialog` (#278). The Nav
 * mounts it to open it. A successful login closes the dialog; a failed one
 * keeps it open with the error. Cancel and Escape close it, except while the
 * login is in flight. Then a browser close opens it again, so the User always
 * sees the login result. Each open shows empty fields and no old error.
 */
export default function LoginDialog(props: LoginDialogProps) {
  const { pending, resetError } = useAuth();
  const headingId = createUniqueId();
  // Each open is a mount: clear the last error before the form shows it.
  resetError();

  return (
    <ModalDialog
      onCancel={() => props.onClose()}
      busy={pending()}
      labelledBy={headingId}
      class="max-w-md"
    >
      <LoginForm
        headingId={headingId}
        onSuccess={() => props.onClose()}
        onCancel={() => props.onClose()}
      />
    </ModalDialog>
  );
}
