import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
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

  it("renders profile dropdown trigger", () => {
    render(() => <JediNav />);
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeInTheDocument();
    expect(screen.getByText("Bart")).toBeInTheDocument();
  });

  it("toggles dropdown on profile button click", async () => {
    const user = userEvent.setup();
    render(() => <JediNav />);
    const trigger = screen.getByRole("button", { name: /profile menu/i });
    const dropdown = screen.getByText("My Profile").closest("[aria-hidden]")!;

    expect(dropdown).toHaveClass("pointer-events-none");
    expect(dropdown).toHaveAttribute("aria-hidden", "true");

    await user.click(trigger);

    expect(dropdown).not.toHaveClass("pointer-events-none");
    expect(dropdown).toHaveClass("opacity-100");
    expect(dropdown).toHaveAttribute("aria-hidden", "false");
  });

  describe("hamburger menu", () => {
    it("starts with aria-expanded false", () => {
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("mobile nav starts hidden (pointer-events-none)", () => {
      render(() => <JediNav />);
      const nav = screen.getByRole("navigation", { name: /Jedi site navigation/i });
      expect(nav).toHaveClass("pointer-events-none");
    });

    it("shows menu icon when nav closed", () => {
      render(() => <JediNav />);
      const btn = screen.getByRole("button", { name: /toggle navigation/i });
      expect(btn.querySelector("img")!.getAttribute("src")).toContain("menu");
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
      expect(btn.querySelector("img")!.getAttribute("src")).toContain("delete-sign");
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
      expect(btn.querySelector("img")!.getAttribute("src")).toContain("menu");
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
      const dropdown = screen.getByText("My Profile").closest("[aria-hidden]")!;
      expect(dropdown).toHaveAttribute("aria-hidden", "false");

      await user.click(document.body);

      expect(dropdown).toHaveAttribute("aria-hidden", "true");
      expect(dropdown).toHaveClass("pointer-events-none");
    });
  });
});
