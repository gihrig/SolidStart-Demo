import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "./ThemeContext";
import ThemeToggle from "./ThemeToggle";

// One ThemeProvider owns the mode (#203); each ThemeToggle shows and changes it.
function renderToggle() {
  return render(() => (
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  ));
}

describe("<ThemeToggle />", () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => mockLocalStorage[key] ?? null,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
      mockLocalStorage[key] = value;
    });

    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a toggle button", () => {
    renderToggle();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("defaults to auto mode when no localStorage value", () => {
    renderToggle();
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("system");
  });

  it("reads initial mode from localStorage", () => {
    mockLocalStorage["theme"] = "dark";
    renderToggle();
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("dark");
  });

  it("cycles light → dark → auto on clicks", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "light";
    renderToggle();
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

  // CSS sets color-scheme from data-theme (#203), so no script writes it.
  it("applies data-theme when mode is dark, and leaves colorScheme to CSS", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "light";
    renderToggle();
    const button = screen.getByRole("button");

    await user.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("");
  });

  it("removes data-theme attribute in auto mode", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "dark";
    renderToggle();
    const button = screen.getByRole("button");

    await user.click(button);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("renders the sun sprite icon at 20px in light mode", () => {
    mockLocalStorage["theme"] = "light";
    const { container } = renderToggle();
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("use")!.getAttribute("href")).toBe("/icon-sprite.svg#icon-sun");
    expect(svg).toHaveClass("w-5", "h-5");
  });

  it("renders the moon sprite icon at 20px in dark mode", () => {
    mockLocalStorage["theme"] = "dark";
    const { container } = renderToggle();
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("use")!.getAttribute("href")).toBe("/icon-sprite.svg#icon-moon");
    expect(svg).toHaveClass("w-5", "h-5");
  });

  it("renders the system sprite icon at 20px in auto mode", () => {
    const { container } = renderToggle();
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("use")!.getAttribute("href")).toBe("/icon-sprite.svg#icon-system");
    expect(svg).toHaveClass("w-5", "h-5");
  });

  // The Nav renders one copy in the bar and one in the mobile menu (#203).
  it("keeps two copies under one provider in step", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "light";
    render(() => (
      <ThemeProvider>
        <ThemeToggle />
        <ThemeToggle />
      </ThemeProvider>
    ));
    const [first, second] = screen.getAllByRole("button");

    await user.click(first);
    expect(first.getAttribute("aria-label")).toContain("dark");
    expect(second.getAttribute("aria-label")).toContain("dark");

    await user.click(second);
    expect(first.getAttribute("aria-label")).toContain("system");
    expect(second.getAttribute("aria-label")).toContain("system");
  });
});
