import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createSignal } from "solid-js";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    auth: {
      login: vi.fn().mockResolvedValue({ result: "ok" }),
      logoff: vi.fn().mockResolvedValue({ result: "ok" }),
    },
  },
}));

function AuthTestConsumer() {
  const auth = useAuth();
  // Records whether login() rejected — the re-throw removal must keep this "no".
  const [threw, setThrew] = createSignal("no");
  return (
    <div>
      <span data-testid="status">{auth.isAuthenticated() ? "logged-in" : "logged-out"}</span>
      <span data-testid="username">{auth.username() ?? "none"}</span>
      <span data-testid="error">{auth.error() ?? "none"}</span>
      <span data-testid="pending">{auth.pending() ? "yes" : "no"}</span>
      <span data-testid="threw">{threw()}</span>
      <button
        onClick={async () => {
          try {
            await auth.login("demo1", "welcome");
          } catch {
            setThrew("yes");
          }
        }}
      >
        Login
      </button>
      <button onClick={() => auth.logoff()}>Logoff</button>
    </div>
  );
}

const renderWithAuth = () =>
  render(() => (
    <AuthProvider>
      <AuthTestConsumer />
    </AuthProvider>
  ));

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isAuthenticated starts as false", () => {
    renderWithAuth();
    expect(screen.getByTestId("status").textContent).toBe("logged-out");
    expect(screen.getByTestId("username").textContent).toBe("none");
  });

  it("login() sets isAuthenticated to true and stores username", async () => {
    const user = userEvent.setup();
    renderWithAuth();

    await user.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("logged-in");
      expect(screen.getByTestId("username").textContent).toBe("demo1");
    });
  });

  it("logoff() clears auth state", async () => {
    const user = userEvent.setup();
    renderWithAuth();

    await user.click(screen.getByRole("button", { name: /^login$/i }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("logged-in"));

    await user.click(screen.getByRole("button", { name: /logoff/i }));

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("logged-out");
      expect(screen.getByTestId("username").textContent).toBe("none");
    });
  });

  it("login() surfaces the error and does not throw or authenticate on failure", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockRejectedValueOnce(new Error("Invalid credentials"));
    const user = userEvent.setup();
    renderWithAuth();

    await user.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("Invalid credentials");
    });
    expect(screen.getByTestId("threw").textContent).toBe("no");
    expect(screen.getByTestId("status").textContent).toBe("logged-out");
    expect(screen.getByTestId("username").textContent).toBe("none");
  });

  it("pending is true while login is in flight, then false", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    let resolveLogin!: (v: { result: { success: boolean } }) => void;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(backendRpc.auth.login).mockReturnValueOnce(
      new Promise<{ result: { success: boolean } }>((r) => (resolveLogin = r)),
    );
    const user = userEvent.setup();
    renderWithAuth();

    await user.click(screen.getByRole("button", { name: /^login$/i }));
    await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("yes"));

    resolveLogin({ result: { success: true } });
    await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("no"));
  });

  it("calls backendRpc.auth.login with correct credentials", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    const user = userEvent.setup();
    renderWithAuth();

    await user.click(screen.getByRole("button", { name: /^login$/i }));

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(backendRpc.auth.login)).toHaveBeenCalledWith("demo1", "welcome");
  });
});
