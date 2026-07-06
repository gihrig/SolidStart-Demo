import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "./ThemeToggle";

describe("<ThemeToggle />", () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => mockLocalStorage[key] ?? null,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
      mockLocalStorage[key] = value;
    });

    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMatchMedia,
    });

    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a toggle button", () => {
    render(() => <ThemeToggle />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("defaults to auto mode when no localStorage value", () => {
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("system");
  });

  it("reads initial mode from localStorage", () => {
    mockLocalStorage["theme"] = "dark";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("dark");
  });

  it("cycles light → dark → auto on clicks", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "light";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");

    expect(button.getAttribute("aria-label")).toContain("light");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toContain("dark");
    expect(mockLocalStorage["theme"]).toBe("dark");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toContain("system");
    expect(mockLocalStorage["theme"]).toBe("auto");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toContain("light");
    expect(mockLocalStorage["theme"]).toBe("light");
  });

  it("applies data-theme and colorScheme when mode is dark", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "light";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes data-theme attribute in auto mode", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "dark";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("renders the sun sprite icon at 20px in light mode", () => {
    mockLocalStorage["theme"] = "light";
    const { container } = render(() => <ThemeToggle />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("use")!.getAttribute("href")).toBe("#icon-sun");
    expect(svg).toHaveClass("w-5", "h-5");
  });

  it("renders the moon sprite icon at 20px in dark mode", () => {
    mockLocalStorage["theme"] = "dark";
    const { container } = render(() => <ThemeToggle />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("use")!.getAttribute("href")).toBe("#icon-moon");
    expect(svg).toHaveClass("w-5", "h-5");
  });

  it("renders the system sprite icon at 20px in auto mode", () => {
    const { container } = render(() => <ThemeToggle />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("use")!.getAttribute("href")).toBe("#icon-system");
    expect(svg).toHaveClass("w-5", "h-5");
  });
});
