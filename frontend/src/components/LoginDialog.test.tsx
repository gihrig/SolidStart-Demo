import { describe, it, expect, vi, beforeAll, beforeEach } from "vite-plus/test";
import { createSignal, Show } from "solid-js";
import { render, screen, within, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { stubDialogModal } from "~/lib/test-utils";
import { AuthProvider } from "./AuthContext";
import LoginDialog from "./LoginDialog";

beforeAll(stubDialogModal);

vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    auth: {
      login: vi.fn(),
      logoff: vi.fn(),
    },
  },
}));

// A login loads the User's profile through the `jediApi` seam (#119); stub it so
// the identity resolves offline.
vi.mock("~/lib/jedi/jedi-api", () => ({
  jediApi: {
    profile: {
      get: () => Promise.resolve({ id: 1000, name: "demo1", avatarUrl: "" }),
    },
  },
}));

// The Nav's role: it owns the open state, and mounts the dialog to open it.
// `openLogin` opens it and returns the new dialog.
function renderDialog() {
  const [open, setOpen] = createSignal(false);
  render(() => (
    <AuthProvider>
      <button type="button" onClick={() => setOpen(true)}>
        open-login
      </button>
      <Show when={open()}>
        <LoginDialog onClose={() => setOpen(false)} />
      </Show>
    </AuthProvider>
  ));
  const user = userEvent.setup();
  const openLogin = async () => {
    await user.click(screen.getByRole("button", { name: "open-login" }));
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    return { dialog, form: within(dialog) };
  };
  const shown = () => screen.queryByRole("dialog", { hidden: true });
  // The fields open empty and are required, so type the credentials first.
  const submitLogin = async (form: ReturnType<typeof within>) => {
    await user.type(form.getByLabelText(/username/i), "demo1");
    await user.type(form.getByLabelText(/password/i), "welcome");
    await user.click(form.getByRole("button", { name: /^login$/i }));
  };
  return { user, open, openLogin, shown, submitLogin };
}

describe("<LoginDialog />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens as a modal named by its Login heading", async () => {
    const { openLogin, shown } = renderDialog();
    expect(shown()).toBeNull();

    const { dialog } = await openLogin();

    expect(dialog.open).toBe(true);
    expect(screen.getByRole("dialog", { name: "Login" })).toBe(dialog);
  });

  it("Tab and Shift+Tab keep focus in the dialog, and wrap (#210)", async () => {
    const { user, openLogin } = renderDialog();
    const { form } = await openLogin();
    const username = form.getByLabelText(/username/i);
    const login = form.getByRole("button", { name: /^login$/i });

    username.focus();
    await user.tab({ shift: true });
    expect(login).toHaveFocus();
    await user.tab();
    expect(username).toHaveFocus();
  });

  it("closes after a successful login and reports the close", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockResolvedValueOnce({ result: { success: true } });
    const { open, openLogin, shown, submitLogin } = renderDialog();
    const { form } = await openLogin();

    await submitLogin(form);

    await waitFor(() => expect(shown()).toBeNull());
    expect(open()).toBe(false);
  });

  it("stays open and shows the error after a failed login", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockRejectedValueOnce(new Error("Invalid credentials"));
    const { openLogin, submitLogin } = renderDialog();
    const { dialog, form } = await openLogin();

    await submitLogin(form);

    expect(await form.findByText("Invalid credentials")).toBeInTheDocument();
    expect(dialog.open).toBe(true);
  });

  it("closes on Cancel and reports the close", async () => {
    const { user, open, openLogin, shown } = renderDialog();
    const { form } = await openLogin();

    await user.click(form.getByRole("button", { name: "Cancel" }));

    expect(shown()).toBeNull();
    expect(open()).toBe(false);
  });

  it("Escape closes it; while the login is pending, Escape does nothing and Cancel is disabled", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    let resolveLogin!: (v: { result: { success: boolean } }) => void;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockReturnValueOnce(new Promise((r) => (resolveLogin = r)));
    const { open, openLogin, shown, submitLogin } = renderDialog();

    const idle = await openLogin();
    idle.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(open()).toBe(false);

    const { dialog, form } = await openLogin();
    await submitLogin(form);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(open()).toBe(true);
    expect(dialog.open).toBe(true);
    expect(form.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);

    resolveLogin({ result: { success: true } });
    await waitFor(() => expect(shown()).toBeNull());
  });

  it("a browser close during a login opens the dialog again; a failed login then shows its error (#278)", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    let failLogin!: (reason: unknown) => void;
    vi.mocked(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      backendRpc.auth.login,
    ).mockReturnValueOnce(new Promise((_, reject) => (failLogin = reject)));
    const { open, openLogin, submitLogin } = renderDialog();
    const { dialog, form } = await openLogin();
    await submitLogin(form);

    // A browser closes the dialog after repeated Escape, while the login waits.
    dialog.close();
    expect(dialog.open, "the dialog opens again").toBe(true);
    expect(open()).toBe(true);

    failLogin(new Error("Invalid credentials"));
    expect(await form.findByText("Invalid credentials")).toBeInTheDocument();
    expect(dialog.open).toBe(true);
  });

  it("each open shows empty fields (#278)", async () => {
    const { user, openLogin } = renderDialog();
    const first = await openLogin();
    await user.type(first.form.getByLabelText(/username/i), "demo1");
    await user.type(first.form.getByLabelText(/password/i), "welcome");
    await user.click(first.form.getByRole("button", { name: "Cancel" }));

    const { form } = await openLogin();

    expect(form.getByLabelText(/username/i)).toHaveValue("");
    expect(form.getByLabelText(/password/i)).toHaveValue("");
  });

  it("shows no old error when it opens again", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockRejectedValueOnce(new Error("Invalid credentials"));
    const { user, openLogin, submitLogin } = renderDialog();
    const first = await openLogin();
    await submitLogin(first.form);
    expect(await first.form.findByText("Invalid credentials")).toBeInTheDocument();
    await user.click(first.form.getByRole("button", { name: "Cancel" }));

    const { dialog, form } = await openLogin();

    expect(dialog.open).toBe(true);
    expect(form.queryByText("Invalid credentials")).toBeNull();
  });

  it("stops its Escape, so a document Escape listener does not get it (#214)", async () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    try {
      const { user, openLogin } = renderDialog();
      const { form } = await openLogin();
      await user.click(form.getByLabelText(/username/i));
      await user.keyboard("{Escape}");
      expect(onDocumentKey).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    } finally {
      document.removeEventListener("keydown", onDocumentKey);
    }
  });
});
