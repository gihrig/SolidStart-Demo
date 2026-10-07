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

// The nav identity reads the logged-in User's profile through the `jediApi`
// seam (#119); each test programs the profile the seam returns.
const { profileGetMock } = vi.hoisted(() => ({ profileGetMock: vi.fn() }));
vi.mock("~/lib/jedi/jedi-api", () => ({ jediApi: { profile: { get: profileGetMock } } }));

const DEMO1_PROFILE = {
  id: 1000,
  name: "demo1",
  avatarUrl: "https://example.test/demo1.png",
};

function AuthTestConsumer() {
  const auth = useAuth();
  // Records whether login() rejected — the re-throw removal must keep this "no".
  const [threw, setThrew] = createSignal("no");
  return (
    <div>
      <span data-testid="status">{auth.isAuthenticated() ? "logged-in" : "logged-out"}</span>
      <span data-testid="username">{auth.username() ?? "none"}</span>
      <span data-testid="display-name">{auth.displayName?.() ?? "none"}</span>
      <span data-testid="avatar-url">{auth.avatarUrl?.() ?? ""}</span>
      <span data-testid="user-id">{auth.userId?.() ?? "none"}</span>
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
    profileGetMock.mockResolvedValue(DEMO1_PROFILE);
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

  // The nav identity (ADR-0007, #119): the logged-in User's real profile, read
  // through the `jediApi` seam. There is no identity until login. It lives here —
  // not inline in <Nav /> — so it is exercisable at the useAuth seam without
  // rendering the nav.
  describe("nav identity (the real profile)", () => {
    it("has no identity and fetches no profile when logged out", async () => {
      renderWithAuth();

      await Promise.resolve();
      expect(screen.getByTestId("display-name").textContent).toBe("none");
      expect(screen.getByTestId("avatar-url").textContent).toBe("");
      expect(screen.getByTestId("user-id").textContent).toBe("none");
      expect(profileGetMock).not.toHaveBeenCalled();
    });

    it("reads the display name and avatar from the profile once logged in", async () => {
      const user = userEvent.setup();
      renderWithAuth();

      await user.click(screen.getByRole("button", { name: /^login$/i }));

      await waitFor(() =>
        expect(screen.getByTestId("avatar-url").textContent).toBe(DEMO1_PROFILE.avatarUrl),
      );
      expect(screen.getByTestId("display-name").textContent).toBe("demo1");
      expect(profileGetMock).toHaveBeenCalledTimes(1);
    });

    it("exposes the logged-in User's id from the profile, for the Owner check (#123)", async () => {
      const user = userEvent.setup();
      renderWithAuth();
      expect(screen.getByTestId("user-id").textContent).toBe("none");

      await user.click(screen.getByRole("button", { name: /^login$/i }));

      await waitFor(() =>
        expect(screen.getByTestId("user-id").textContent).toBe(String(DEMO1_PROFILE.id)),
      );
    });

    it("clears the identity on logoff", async () => {
      const user = userEvent.setup();
      renderWithAuth();
      await user.click(screen.getByRole("button", { name: /^login$/i }));
      await waitFor(() =>
        expect(screen.getByTestId("avatar-url").textContent).toBe(DEMO1_PROFILE.avatarUrl),
      );

      await user.click(screen.getByRole("button", { name: /logoff/i }));

      await waitFor(() => expect(screen.getByTestId("display-name").textContent).toBe("none"));
      expect(screen.getByTestId("avatar-url").textContent).toBe("");
      expect(screen.getByTestId("user-id").textContent).toBe("none");
    });

    it("falls back to the login username with no avatar when the profile fails", async () => {
      const failure = new Error("RPC Error: boom");
      profileGetMock.mockRejectedValue(failure);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const user = userEvent.setup();
      renderWithAuth();

      await user.click(screen.getByRole("button", { name: /^login$/i }));

      await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("logged-in"));
      await waitFor(() => expect(profileGetMock).toHaveBeenCalled());
      expect(screen.getByTestId("display-name").textContent).toBe("demo1");
      expect(screen.getByTestId("avatar-url").textContent).toBe("");
      expect(screen.getByTestId("user-id").textContent).toBe("none");
      // The failure is logged, not silent.
      await waitFor(() =>
        expect(warn).toHaveBeenCalledWith("[AuthContext] Profile load failed:", failure),
      );
      warn.mockRestore();
    });
  });
});
