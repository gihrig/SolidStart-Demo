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
  return { user: userEvent.setup(), dialog, form: within(dialog), open };
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

  it("closes after a successful login and reports the close", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockResolvedValueOnce({ result: { success: true } });
    const { user, dialog, form, open } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    await user.click(form.getByRole("button", { name: /^login$/i }));

    await waitFor(() => expect(dialog.open).toBe(false));
    expect(open()).toBe(false);
  });

  it("stays open and shows the error after a failed login", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockRejectedValueOnce(new Error("Invalid credentials"));
    const { user, dialog, form } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    await user.click(form.getByRole("button", { name: /^login$/i }));

    expect(await form.findByText("Invalid credentials")).toBeInTheDocument();
    expect(dialog.open).toBe(true);
  });

  it("refuses Escape while the login is pending, and allows it otherwise", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    let land!: (v: { result: { success: boolean } }) => void;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockReturnValueOnce(new Promise((r) => (land = r)));
    const { user, dialog, form } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    const idleEsc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(idleEsc);
    expect(idleEsc.defaultPrevented).toBe(false);

    await user.click(form.getByRole("button", { name: /^login$/i }));
    const pendingEsc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(pendingEsc);
    expect(pendingEsc.defaultPrevented).toBe(true);

    land({ result: { success: true } });
    await waitFor(() => expect(dialog.open).toBe(false));
  });

  it("shows no old error when it opens again", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockRejectedValueOnce(new Error("Invalid credentials"));
    const { user, dialog, form } = renderDialog();
    await user.click(screen.getByRole("button", { name: "open-login" }));
    await user.click(form.getByRole("button", { name: /^login$/i }));
    expect(await form.findByText("Invalid credentials")).toBeInTheDocument();

    dialog.close();
    await user.click(screen.getByRole("button", { name: "open-login" }));

    expect(dialog.open).toBe(true);
    expect(form.queryByText("Invalid credentials")).toBeNull();
  });
});
