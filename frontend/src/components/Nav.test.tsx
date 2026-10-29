import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vite-plus/test";
import { render, screen, within, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { A, MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { ROUTE_CONTENT_ID } from "~/lib/routeContent";
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

// A Theme choice saves through a server function, the seam to the server
// (mirrors ThemeChoice.test); the rest of theme.ts is real.
vi.mock("~/lib/theme", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/theme")>()),
  saveTheme: vi.fn().mockResolvedValue(undefined),
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

// The Nav links are router links, so the nav renders inside a router at `path`.
const renderNav = (withLogin = false, path = "/") => {
  const history = createMemoryHistory();
  history.set({ value: path, scroll: false, replace: true });
  return render(() => (
    <MemoryRouter
      history={history}
      root={() => (
        <AuthProvider>
          <Nav />
          {withLogin ? <LoginTrigger /> : null}
        </AuthProvider>
      )}
    >
      <Route path="*" component={() => null} />
    </MemoryRouter>
  ));
};

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

  // The router's <A end> sets aria-current="page" on an exact match only; CSS
  // draws the underline from it (#247).
  it.each([
    ["/", "Home"],
    ["/about", "About"],
    ["/readme", "Readme"],
    ["/nonexistent", null],
  ])("on %s, marks only the %s Nav link as the current page", (path, current) => {
    renderNav(false, path);
    for (const name of ["Main", "Site menu"]) {
      const marked = within(screen.getByRole("navigation", { name }))
        .getAllByRole("link")
        .filter((a) => a.getAttribute("aria-current") === "page")
        .map((a) => a.textContent);
      expect(marked, name).toEqual(current ? [current] : []);
    }
    const brand = screen.getByText("Awesome").closest("a")!;
    expect(brand).not.toHaveAttribute("aria-current");
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

  // The Profile menu takes focus, holds Tab, and returns focus on Escape (#248).
  describe("Profile menu focus (#248)", () => {
    const trigger = () => screen.getByRole("button", { name: /profile menu/i });
    const isOpen = () => trigger().getAttribute("aria-expanded") === "true";

    it("an open gives focus to My Profile", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(trigger());
      expect(screen.getByRole("button", { name: "My Profile" })).toHaveFocus();
    });

    it("Tab and Shift+Tab wrap in the panel, and the Theme group is one Tab stop", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(trigger());
      const myProfile = screen.getByRole("button", { name: "My Profile" });
      const system = screen.getByRole("radio", { name: "System Theme" });

      await user.tab();
      expect(screen.getByRole("button", { name: "Log In" })).toHaveFocus();
      await user.tab();
      expect(system).toHaveFocus();
      await user.tab();
      expect(myProfile, "Tab from the last control wraps").toHaveFocus();
      await user.tab({ shift: true });
      expect(system, "Shift+Tab from the first control wraps").toHaveFocus();
      expect(isOpen()).toBe(true);
    });

    it("the arrow keys change the Theme choice", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(trigger());
      await user.tab();
      await user.tab();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("radio", { name: "Light Theme" })).toBeChecked();
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });

    it("Escape closes the menu and gives focus to the Profile menu button", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(trigger());
      await user.keyboard("{Escape}");
      expect(isOpen()).toBe(false);
      expect(trigger()).toHaveFocus();
    });

    it("a click outside, on an item that takes focus, closes it, and that item has focus", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(trigger());
      const outside = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(outside);
      expect(isOpen()).toBe(false);
      expect(outside).toHaveFocus();
    });

    it("focus that leaves the menu by Shift+Tab from the button closes it", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(trigger());
      trigger().focus();
      expect(isOpen(), "the button is inside the menu").toBe(true);
      await user.tab({ shift: true });
      expect(isOpen()).toBe(false);
    });

    it("a click on Log Out closes the menu and gives focus to the Profile menu button", async () => {
      const user = userEvent.setup();
      renderNav(true);
      await user.click(screen.getByRole("button", { name: /do-login/i }));
      await user.click(trigger());
      await user.click(await screen.findByRole("button", { name: /log out/i }));
      expect(isOpen()).toBe(false);
      expect(trigger()).toHaveFocus();
    });

    it("a Theme choice keeps the menu open", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(trigger());
      await user.click(screen.getByText("Dark Theme"));
      expect(isOpen()).toBe(true);
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

    // The Site menu closes on a link choice, a click outside or a focus out, and
    // a link choice gives focus to the new page's route content (#248).
    describe("Site menu (#248)", () => {
      // The app shell: route content between the header and an outside button,
      // as app.tsx holds it between Nav and Footer. /about holds no item that
      // takes focus; /readme holds one.
      const renderRoutes = () => {
        const history = createMemoryHistory();
        history.set({ value: "/", scroll: false, replace: true });
        return render(() => (
          <MemoryRouter
            history={history}
            root={(props) => (
              <AuthProvider>
                <Nav />
                <div id={ROUTE_CONTENT_ID}>{props.children}</div>
                <button type="button">outside</button>
              </AuthProvider>
            )}
          >
            <Route path="/" component={() => <p>home page</p>} />
            <Route path="/about" component={() => <p>about page</p>} />
            <Route
              path="/readme"
              component={() => (
                <>
                  <p>readme page</p>
                  <button type="button" disabled>
                    disabled action
                  </button>
                  <button type="button">readme action</button>
                </>
              )}
            />
          </MemoryRouter>
        ));
      };
      const toggle = () => screen.getByRole("button", { name: /toggle navigation/i });
      const menu = () => screen.getByRole("navigation", { name: /site menu/i });
      const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(toggle());
        expect(toggle()).toHaveAttribute("aria-expanded", "true");
      };

      it("a click on About loads it, closes the menu, and gives focus to Toggle navigation", async () => {
        const user = userEvent.setup();
        renderRoutes();
        await openMenu(user);
        await user.click(within(menu()).getByRole("link", { name: "About" }));
        expect(await screen.findByText("about page")).toBeInTheDocument();
        expect(toggle()).toHaveAttribute("aria-expanded", "false");
        await waitFor(() => expect(toggle()).toHaveFocus());
      });

      it("a link choice gives focus to the first item that takes focus in the route content", async () => {
        const user = userEvent.setup();
        renderRoutes();
        await openMenu(user);
        await user.click(within(menu()).getByRole("link", { name: "Readme" }));
        const action = await screen.findByRole("button", { name: "readme action" });
        expect(toggle()).toHaveAttribute("aria-expanded", "false");
        await waitFor(() => expect(action).toHaveFocus());
      });

      it("a choice of the current page's link closes the menu and moves focus", async () => {
        const user = userEvent.setup();
        renderRoutes();
        await openMenu(user);
        await user.click(within(menu()).getByRole("link", { name: "Home" }));
        expect(toggle()).toHaveAttribute("aria-expanded", "false");
        await waitFor(() => expect(toggle()).toHaveFocus());
      });

      it("a click outside, on an item that takes focus, closes it, and that item has focus", async () => {
        const user = userEvent.setup();
        renderRoutes();
        await openMenu(user);
        const outside = screen.getByRole("button", { name: "outside" });
        await user.click(outside);
        expect(toggle()).toHaveAttribute("aria-expanded", "false");
        expect(outside).toHaveFocus();
      });

      it("focus that moves outside the menu and its toggle closes it", async () => {
        const user = userEvent.setup();
        renderRoutes();
        await openMenu(user);
        within(menu()).getByRole("link", { name: "About" }).focus();
        expect(toggle(), "a link in the menu is inside").toHaveAttribute("aria-expanded", "true");
        toggle().focus();
        expect(toggle(), "the toggle is inside").toHaveAttribute("aria-expanded", "true");
        screen.getByRole("button", { name: "outside" }).focus();
        expect(toggle()).toHaveAttribute("aria-expanded", "false");
      });

      // A modifier click opens a new tab, so the router does not route.
      // A pointer hits the icon, which the click swaps out of the page.
      it("a click on Toggle navigation opens a closed menu and closes an open menu", async () => {
        const user = userEvent.setup();
        renderRoutes();
        await user.click(toggle().querySelector("svg")!);
        expect(toggle()).toHaveAttribute("aria-expanded", "true");
        await user.click(toggle().querySelector("svg")!);
        expect(toggle()).toHaveAttribute("aria-expanded", "false");
      });
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

  // A Site menu link that the guard holds back starts no route change, so it
  // must not move focus on a later one (#248).
  it("a Site menu link held back by Keep editing moves no focus on a later route change", async () => {
    setupMatchMedia(true);
    const user = userEvent.setup();
    render(() => (
      <MemoryRouter
        root={(props) => (
          <AuthProvider>
            <DraftGuardProvider>
              <Nav />
              <div id={ROUTE_CONTENT_ID}>{props.children}</div>
              <A href="/readme">outside link</A>
            </DraftGuardProvider>
          </AuthProvider>
        )}
      >
        <Route path="/" component={DraftHolder} />
        <Route path="/about" component={() => <p>about page</p>} />
        <Route path="/readme" component={() => <button type="button">readme action</button>} />
      </MemoryRouter>
    ));
    const dialogName = "You have unsaved changes. Discard them?";

    await user.click(screen.getByRole("button", { name: /toggle navigation/i }));
    const menu = screen.getByRole("navigation", { name: /site menu/i });
    await user.click(within(menu).getByRole("link", { name: "About" }));
    await user.click(
      within(screen.getByRole("dialog", { name: dialogName })).getByRole("button", {
        name: "Keep editing",
      }),
    );
    expect(screen.queryByText("about page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "outside link" }));
    await user.click(
      within(screen.getByRole("dialog", { name: dialogName })).getByRole("button", {
        name: "Discard",
      }),
    );
    const action = await screen.findByRole("button", { name: "readme action" });
    expect(action).not.toHaveFocus();
  });
});
