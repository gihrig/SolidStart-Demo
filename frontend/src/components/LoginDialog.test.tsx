import { describe, it, expect, vi, beforeAll, beforeEach } from "vite-plus/test";
import { createSignal } from "solid-js";
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

// The Nav's role: it owns the open state and opens the dialog.
function renderDialog() {
  const [open, setOpen] = createSignal(false);
  render(() => (
    <AuthProvider>
      <button type="button" onClick={() => setOpen(true)}>
        open-login
      </button>
      <LoginDialog open={open()} onClose={() => setOpen(false)} />
    </AuthProvider>
  ));
  const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
  const user = userEvent.setup();
  const form = within(dialog);
  // The fields open empty and are required, so type the credentials first.
  const submitLogin = async () => {
    await user.type(form.getByLabelText(/username/i), "demo1");
    await user.type(form.getByLabelText(/password/i), "welcome");
    await user.click(form.getByRole("button", { name: /^login$/i }));
  };
  return { user, dialog, form, open, submitLogin };
}

describe("<LoginDialog />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens as a modal named by its Login heading", async () => {
    const { user, dialog } = renderDialog();
    expect(dialog.open).toBe(false);

    await user.click(screen.getByRole("button", { name: "open-login" }));

    expect(dialog.open).toBe(true);
    expect(screen.getByRole("dialog", { name: "Login" })).toBe(dialog);
  });

  it("Tab and Shift+Tab keep focus in the dialog, and wrap (#210)", async () => {
    const { user, form } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));
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
    const { user, dialog, open, submitLogin } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    await submitLogin();

    await waitFor(() => expect(dialog.open).toBe(false));
    expect(open()).toBe(false);
  });

  it("stays open and shows the error after a failed login", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockRejectedValueOnce(new Error("Invalid credentials"));
    const { user, dialog, form, submitLogin } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    await submitLogin();

    expect(await form.findByText("Invalid credentials")).toBeInTheDocument();
    expect(dialog.open).toBe(true);
  });

  it("closes on Cancel and reports the close", async () => {
    const { user, dialog, form, open } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    await user.click(form.getByRole("button", { name: "Cancel" }));

    expect(dialog.open).toBe(false);
    expect(open()).toBe(false);
  });

  it("refuses Escape and Cancel while the login is pending, and allows them otherwise", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    let resolveLogin!: (v: { result: { success: boolean } }) => void;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockReturnValueOnce(new Promise((r) => (resolveLogin = r)));
    const { user, dialog, form, submitLogin } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    const idleEsc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(idleEsc);
    expect(idleEsc.defaultPrevented).toBe(false);
    expect(form.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", false);

    await submitLogin();
    const pendingEsc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(pendingEsc);
    expect(pendingEsc.defaultPrevented).toBe(true);
    expect(form.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);

    resolveLogin({ result: { success: true } });
    await waitFor(() => expect(dialog.open).toBe(false));
  });

  it("shows no old error when it opens again", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockRejectedValueOnce(new Error("Invalid credentials"));
    const { user, dialog, form, submitLogin } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));
    await submitLogin();
    expect(await form.findByText("Invalid credentials")).toBeInTheDocument();

    dialog.close();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    expect(dialog.open).toBe(true);
    expect(form.queryByText("Invalid credentials")).toBeNull();
  });

  it("stops its Escape, so a document Escape listener does not get it (#214)", async () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    try {
      const { user, form } = renderDialog();
      await user.click(screen.getByRole("button", { name: "open-login" }));
      await user.click(form.getByLabelText(/username/i));
      await user.keyboard("{Escape}");
      expect(onDocumentKey).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    } finally {
      document.removeEventListener("keydown", onDocumentKey);
    }
  });
});
