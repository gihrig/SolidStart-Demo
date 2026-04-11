import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
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
  return (
    <div>
      <span data-testid="status">{auth.isAuthenticated() ? "logged-in" : "logged-out"}</span>
      <span data-testid="username">{auth.username() ?? "none"}</span>
      <button onClick={() => auth.login("demo1", "welcome")}>Login</button>
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

  it("calls backendRpc.auth.login with correct credentials", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    const user = userEvent.setup();
    renderWithAuth();

    await user.click(screen.getByRole("button", { name: /^login$/i }));

    const { login } = backendRpc.auth;
    expect(login).toHaveBeenCalledWith("demo1", "welcome");
  });
});
