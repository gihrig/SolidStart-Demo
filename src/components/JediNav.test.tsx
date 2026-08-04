import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { trustedUrl } from "~/lib/sanitizeUrl";
import JediNav from "./JediNav";

function setupMatchMedia(mobile: boolean) {
  const mql = {
    matches: mobile,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return mql;
}

describe("<JediNav />", () => {
  beforeEach(() => {
    setupMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders logo and brand name", () => {
    render(() => <JediNav />);
    expect(screen.getByText("Awesome")).toBeInTheDocument();
  });

  it("renders mobile toggle button", () => {
    render(() => <JediNav />);
    expect(screen.getByRole("button", { name: /toggle navigation/i })).toBeInTheDocument();
  });

  it("renders nav links", () => {
    render(() => <JediNav />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Create Post")).toBeInTheDocument();
  });

  it("renders profile dropdown trigger with the passed profile", () => {
    const profile = {
      id: 3,
      name: "Bart",
      avatarUrl: trustedUrl("https://img.icons8.com/doodle/96/null/bart-simpson.png"),
    };
    render(() => <JediNav profile={profile} />);
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeInTheDocument();
    expect(screen.getByText("Bart")).toBeInTheDocument();
    const avatar = screen.getByAltText("Bart avatar") as HTMLImageElement;
    expect(avatar.src).toBe(profile.avatarUrl);
  });

  it("toggles dropdown on profile button click", async () => {
    const user = userEvent.setup();
    render(() => <JediNav />);
    const trigger = screen.getByRole("button", { name: /profile menu/i });
    // The popup drops aria-hidden in favour of `inert` (a jsdom DOM property);
    // locate it by the id that links the trigger's aria-controls to the panel.
    const dropdown = document.getElementById("jedi-profile-menu")! as HTMLElement & {
      inert: boolean;
    };

    expect(dropdown).toHaveClass("pointer-events-none");
    expect(dropdown.inert).toBe(true);

    await user.click(trigger);

    expect(dropdown).not.toHaveClass("pointer-events-none");
    expect(dropdown).toHaveClass("opacity-100");
    expect(dropdown.inert).toBe(false);
  });

  describe("hamburger menu", () => {
    it("starts with aria-expanded false", () => {
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("toggle's aria-controls links to the nav panel's id", () => {
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      const nav = screen.getByRole("navigation", { name: /Jedi site navigation/i });
      expect(btn).toHaveAttribute("aria-controls", "jedi-mobile-nav");
      expect(nav).toHaveAttribute("id", "jedi-mobile-nav");
    });

    it("mobile nav starts hidden (pointer-events-none)", () => {
      render(() => <JediNav />);
      const nav = screen.getByRole("navigation", { name: /Jedi site navigation/i });
      expect(nav).toHaveClass("pointer-events-none");
    });

    it("shows menu icon when nav closed", () => {
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      expect(btn.querySelector("use")!.getAttribute("href")).toContain("menu");
    });

    it("click sets aria-expanded true", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      expect(btn).toHaveAttribute("aria-expanded", "true");
    });

    it("click shows nav (removes pointer-events-none, adds opacity-100)", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      const nav = screen.getByRole("navigation", { name: /Jedi site navigation/i });
      expect(nav).not.toHaveClass("pointer-events-none");
      expect(nav).toHaveClass("opacity-100");
    });

    it("click shows close icon", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      expect(btn.querySelector("use")!.getAttribute("href")).toContain("delete-sign");
    });

    it("second click sets aria-expanded false", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      await user.click(btn);
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("second click hides nav (restores pointer-events-none)", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      await user.click(btn);
      const nav = screen.getByRole("navigation", { name: /Jedi site navigation/i });
      expect(nav).toHaveClass("pointer-events-none");
    });

    it("second click restores menu icon", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      await user.click(btn);
      expect(btn.querySelector("use")!.getAttribute("href")).toContain("menu");
    });
  });

  describe("mobile mode", () => {
    beforeEach(() => {
      setupMatchMedia(true);
    });

    it("Escape key closes mobile nav", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      await user.click(btn);
      const nav = screen.getByRole("navigation", { name: /Jedi site navigation/i });
      expect(nav).not.toHaveClass("pointer-events-none");

      await user.keyboard("{Escape}");

      expect(nav).toHaveClass("pointer-events-none");
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("click outside dropdown closes it", async () => {
      const user = userEvent.setup();
      render(() => <JediNav />);
      const trigger = screen.getByRole("button", { name: /profile menu/i });
      await user.click(trigger);
      const dropdown = document.getElementById("jedi-profile-menu")! as HTMLElement & {
        inert: boolean;
      };
      expect(dropdown.inert).toBe(false);

      await user.click(document.body);

      expect(dropdown.inert).toBe(true);
      expect(dropdown).toHaveClass("pointer-events-none");
    });
  });
});
