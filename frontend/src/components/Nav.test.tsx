import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vite-plus/test";
import { render, screen, within, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route } from "@solidjs/router";
import { stubDialogModal } from "~/lib/test-utils";
import { AuthProvider, useAuth } from "./AuthContext";
import { DraftGuardProvider, useDraftGuard } from "./DraftGuardContext";
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

// The nav identity is the logged-in User's profile, read through the `jediApi`
// seam (#119); each test programs the profile the seam returns.
const { profileGetMock } = vi.hoisted(() => ({ profileGetMock: vi.fn() }));
vi.mock("~/lib/jedi/jedi-api", () => ({ jediApi: { profile: { get: profileGetMock } } }));

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

beforeAll(stubDialogModal);

describe("<Nav />", () => {
  beforeEach(() => {
    profileGetMock.mockReset();
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

  it("renders Home, About and Readme, in that order, in the main nav", () => {
    renderNav();
    const mainNav = screen.getByRole("navigation", { name: "Main" });
    const links = within(mainNav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Home", "About", "Readme"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/about", "/readme"]);
  });

  it("drops the Create Post, Jedi and FullStack links", () => {
    renderNav();
    expect(screen.queryByRole("link", { name: "FullStack" })).not.toBeInTheDocument();
    expect(screen.queryByText("Create Post")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Jedi" })).not.toBeInTheDocument();
  });

  // One theme control, at every width: the Theme group in the Profile menu (#200).
  it("holds the Theme group in the Profile menu, with no theme button in the bar or the mobile menu", () => {
    renderNav();
    const panel = document.getElementById("profile-menu")!;
    expect(within(panel).getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(within(panel).getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /theme/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle navigation/i })).toBeInTheDocument();
  });

  describe("profile avatar", () => {
    // The avatar slot: the profile image, else a teal circle with the first
    // characters of the name (#119). Logged out, the circle is empty.
    const avatarSlot = () =>
      within(screen.getByRole("button", { name: /profile menu/i })).getByTestId("avatar");

    it("shows an empty avatar circle and no name when logged out", async () => {
      renderNav();
      await Promise.resolve();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(avatarSlot()).toHaveTextContent(/^$/);
      expect(profileGetMock).not.toHaveBeenCalled();
    });

    it("shows the profile's avatar image and name once logged in", async () => {
      profileGetMock.mockResolvedValue({
        id: 2,
        name: "Homer",
        avatarUrl: "https://example.test/homer.png",
      });
      const user = userEvent.setup();
      renderNav(true);
      await user.click(screen.getByRole("button", { name: /do-login/i }));

      const img = await screen.findByAltText("Homer avatar");
      expect(avatarSlot()).toBe(img);
      expect(img).toHaveAttribute("src", "https://example.test/homer.png");
      expect(screen.getByText("Homer")).toBeInTheDocument();
    });

    it("shows the name's first two characters, capitalized, when the profile has no avatar", async () => {
      profileGetMock.mockResolvedValue({ id: 1000, name: "demo1", avatarUrl: "" });
      const user = userEvent.setup();
      renderNav(true);
      await user.click(screen.getByRole("button", { name: /do-login/i }));

      expect(await screen.findByText("demo1")).toBeInTheDocument();
      expect(avatarSlot()).toHaveTextContent(/^DE$/);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("offers My Profile + Log In when logged out", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(screen.getByRole("button", { name: /profile menu/i }));
      expect(screen.getByRole("button", { name: /my profile/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
    });

    // The identity blend (username vs mock name/avatar) is owned by the useAuth
    // seam — see AuthContext.test "nav identity". Here we only check the nav wires
    // the auth state to the dropdown: Log In becomes Log Out once authenticated.
    it("swaps Log In for Log Out once authenticated", async () => {
      const user = userEvent.setup();
      renderNav(true);
      await user.click(screen.getByRole("button", { name: /do-login/i }));
      await user.click(screen.getByRole("button", { name: /profile menu/i }));
      expect(await screen.findByRole("button", { name: /log out/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /log in/i })).not.toBeInTheDocument();
    });
  });

  describe("login dialog (#128)", () => {
    it("a Log In click closes the dropdown, then opens the login dialog", async () => {
      const user = userEvent.setup();
      renderNav();
      const panel = document.getElementById("profile-menu")! as HTMLElement & { inert: boolean };
      await user.click(screen.getByRole("button", { name: /profile menu/i }));

      await user.click(screen.getByRole("button", { name: /log in/i }));

      expect(panel.inert).toBe(true);
      expect((screen.getByRole("dialog", { name: "Login" }) as HTMLDialogElement).open).toBe(true);
    });

    it("a successful login closes the dialog, shows the name, and returns focus to the Profile menu", async () => {
      profileGetMock.mockResolvedValue({ id: 1000, name: "demo1", avatarUrl: "" });
      const user = userEvent.setup();
      renderNav();
      const trigger = screen.getByRole("button", { name: /profile menu/i });
      await user.click(trigger);
      await user.click(screen.getByRole("button", { name: /log in/i }));
      const dialog = screen.getByRole("dialog", { name: "Login" }) as HTMLDialogElement;

      await user.type(within(dialog).getByLabelText(/username/i), "demo1");
      await user.type(within(dialog).getByLabelText(/password/i), "welcome");
      await user.click(within(dialog).getByRole("button", { name: /^login$/i }));

      await waitFor(() => expect(dialog.open).toBe(false));
      expect(await within(trigger).findByText("demo1")).toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
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

    it("lists Home, About and Readme, in that order, in the Site menu", () => {
      renderNav();
      const menu = screen.getByRole("navigation", { name: /site menu/i });
      const links = within(menu).getAllByRole("link");
      expect(links).toHaveLength(3);
      expect(links.map((a) => a.textContent)).toEqual(["Home", "About", "Readme"]);
      expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/about", "/readme"]);
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

describe("<Nav /> — the Draft guard (ADR-0030)", () => {
  beforeEach(() => {
    profileGetMock.mockReset();
    setupMatchMedia(false); // desktop
  });

  // A form that holds a Draft, as a Comment compose box with text would.
  function DraftHolder() {
    useDraftGuard().report(Symbol("test-draft"), true);
    return null;
  }

  // The app shell: the guard sits inside the Router, as in app.tsx.
  const renderShell = () =>
    render(() => (
      <MemoryRouter
        root={(props) => (
          <AuthProvider>
            <DraftGuardProvider>
              <Nav />
              <LoginTrigger />
              {props.children}
            </DraftGuardProvider>
          </AuthProvider>
        )}
      >
        <Route path="/" component={DraftHolder} />
      </MemoryRouter>
    ));

  it("a logoff click with a Draft shows the dialog, and Discard logs off", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: /do-login/i }));
    await user.click(screen.getByRole("button", { name: /profile menu/i }));

    await user.click(await screen.findByRole("button", { name: /log out/i }));
    const dialog = screen.getByRole("dialog", { name: "You have unsaved changes. Discard them?" });
    expect(screen.getByRole("button", { name: /log out/i }), "still logged in").toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("button", { name: /log in/i })).toBeInTheDocument();
  });
});
