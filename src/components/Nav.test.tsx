import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";
import Nav from "./Nav";

// The nav reads useAuth(); AuthProvider's login/logoff hit backend-rpc, mocked
// so a test can drive the app to logged-in (mirrors AuthContext.test).
vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    auth: {
      login: vi.fn().mockResolvedValue({ result: "ok" }),
      logoff: vi.fn().mockResolvedValue({ result: "ok" }),
    },
  },
}));

function setupMatchMedia(mobile: boolean) {
  const mql = { matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
}

// Shares the nav's AuthProvider, so a test can flip the app to logged-in.
function LoginTrigger() {
  const { login } = useAuth();
  return (
    <button type="button" onClick={() => void login("Homer", "pw")}>
      do-login
    </button>
  );
}

const renderNav = (withLogin = false) =>
  render(() => (
    <AuthProvider>
      <Nav />
      {withLogin ? <LoginTrigger /> : null}
    </AuthProvider>
  ));

describe("<Nav />", () => {
  beforeEach(() => {
    localStorage.removeItem("theme");
    document.documentElement.removeAttribute("data-theme");
    setupMatchMedia(false); // desktop
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the brand linking home", () => {
    renderNav();
    const brand = screen.getByText("Awesome").closest("a")!;
    expect(brand).toHaveAttribute("href", "/");
  });

  it("renders About, Readme and FullStack in the main nav", () => {
    renderNav();
    const mainNav = screen.getByRole("navigation", { name: "Main" });
    expect(within(mainNav).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(within(mainNav).getByRole("link", { name: "Readme" })).toHaveAttribute(
      "href",
      "/readme",
    );
    expect(within(mainNav).getByRole("link", { name: "FullStack" })).toHaveAttribute(
      "href",
      "/fullstack",
    );
  });

  it("drops the Home, Create Post and Jedi links", () => {
    renderNav();
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(screen.queryByText("Create Post")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Jedi" })).not.toBeInTheDocument();
  });

  it("renders the theme toggle and mobile menu toggle", () => {
    renderNav();
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle navigation/i })).toBeInTheDocument();
  });

  describe("profile avatar", () => {
    it("shows the mock profile name + avatar when logged out", async () => {
      renderNav();
      expect(await screen.findByText("Bart")).toBeInTheDocument();
      expect(await screen.findByAltText("Bart avatar")).toBeInTheDocument();
    });

    it("offers My Profile + Log In → /fullstack when logged out", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(screen.getByRole("button", { name: /profile menu/i }));
      expect(screen.getByRole("button", { name: /my profile/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/fullstack");
      expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
    });

    it("reflects the login: username + Log Out once authenticated", async () => {
      const user = userEvent.setup();
      renderNav(true);
      await screen.findByText("Bart"); // logged-out placeholder first
      await user.click(screen.getByRole("button", { name: /do-login/i }));
      expect(await screen.findByText("Homer")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /profile menu/i }));
      expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /log in/i })).not.toBeInTheDocument();
    });
  });

  describe("profile dropdown", () => {
    it("toggles inert/visibility on trigger click", async () => {
      const user = userEvent.setup();
      renderNav();
      const trigger = screen.getByRole("button", { name: /profile menu/i });
      const panel = document.getElementById("profile-menu")! as HTMLElement & { inert: boolean };

      expect(panel).toHaveClass("pointer-events-none");
      expect(panel.inert).toBe(true);

      await user.click(trigger);

      expect(panel).not.toHaveClass("pointer-events-none");
      expect(panel).toHaveClass("opacity-100");
      expect(panel.inert).toBe(false);
    });
  });

  describe("hamburger menu", () => {
    it("aria-controls links the toggle to the mobile menu panel", () => {
      renderNav();
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      const menu = screen.getByRole("navigation", { name: /site menu/i });
      expect(btn).toHaveAttribute("aria-controls", "site-mobile-nav");
      expect(menu).toHaveAttribute("id", "site-mobile-nav");
    });

    it("starts collapsed and toggles open then closed", async () => {
      const user = userEvent.setup();
      renderNav();
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      const menu = screen.getByRole("navigation", { name: /site menu/i });

      expect(btn).toHaveAttribute("aria-expanded", "false");
      expect(menu).toHaveClass("pointer-events-none");
      expect(btn.querySelector("use")!.getAttribute("href")).toContain("menu");

      await user.click(btn);
      expect(btn).toHaveAttribute("aria-expanded", "true");
      expect(menu).not.toHaveClass("pointer-events-none");
      expect(menu).toHaveClass("opacity-100");
      expect(btn.querySelector("use")!.getAttribute("href")).toContain("delete-sign");

      await user.click(btn);
      expect(btn).toHaveAttribute("aria-expanded", "false");
      expect(menu).toHaveClass("pointer-events-none");
      expect(btn.querySelector("use")!.getAttribute("href")).toContain("menu");
    });

    it("lists About/Readme/FullStack in the mobile menu", () => {
      renderNav();
      const menu = screen.getByRole("navigation", { name: /site menu/i });
      expect(within(menu).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
      expect(within(menu).getByRole("link", { name: "Readme" })).toHaveAttribute("href", "/readme");
      expect(within(menu).getByRole("link", { name: "FullStack" })).toHaveAttribute(
        "href",
        "/fullstack",
      );
    });
  });

  describe("mobile mode", () => {
    beforeEach(() => setupMatchMedia(true));

    it("Escape closes the mobile menu", async () => {
      const user = userEvent.setup();
      renderNav();
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      const menu = screen.getByRole("navigation", { name: /site menu/i });
      expect(menu).not.toHaveClass("pointer-events-none");

      await user.keyboard("{Escape}");

      expect(menu).toHaveClass("pointer-events-none");
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("click outside closes the profile dropdown", async () => {
      const user = userEvent.setup();
      renderNav();
      const trigger = screen.getByRole("button", { name: /profile menu/i });
      await user.click(trigger);
      const panel = document.getElementById("profile-menu")! as HTMLElement & { inert: boolean };
      expect(panel.inert).toBe(false);

      await user.click(document.body);

      expect(panel.inert).toBe(true);
      expect(panel).toHaveClass("pointer-events-none");
    });
  });
});
