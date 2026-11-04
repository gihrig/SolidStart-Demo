import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { saveTheme } from "~/lib/theme";
import ThemeChoice from "./ThemeChoice";

// The server function is the seam to the server; the rest of theme.ts is real.
vi.mock("~/lib/theme", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/theme")>()),
  saveTheme: vi.fn(),
}));

describe("<ThemeChoice />", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    vi.mocked(saveTheme).mockReset().mockResolvedValue(undefined);
  });

  it("holds three radios in a group named Theme, each with its icon", () => {
    render(() => <ThemeChoice />);
    const group = screen.getByRole("group", { name: "Theme" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")!.textContent)).toEqual([
      "System Theme",
      "Light Theme",
      "Dark Theme",
    ]);
    const icons = radios.map((radio) =>
      [...radio.closest("label")!.querySelectorAll("use")].map((use) => use.getAttribute("href")),
    );
    expect(icons).toEqual([
      ["/icon-sprite.svg#icon-check", "/icon-sprite.svg#icon-system"],
      ["/icon-sprite.svg#icon-check", "/icon-sprite.svg#icon-sun"],
      ["/icon-sprite.svg#icon-check", "/icon-sprite.svg#icon-moon"],
    ]);
  });

  it("checks System Theme when <html> has no data-theme", () => {
    render(() => <ThemeChoice />);
    expect(screen.getByRole("radio", { name: "System Theme" })).toBeChecked();
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("checks the Theme that the server rendered on <html>", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(() => <ThemeChoice />);
    expect(screen.getByRole("radio", { name: "Dark Theme" })).toBeChecked();
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("sets data-theme at once, then saves the choice", async () => {
    const user = userEvent.setup();
    render(() => <ThemeChoice />);

    await user.click(screen.getByRole("radio", { name: "Dark Theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("radio", { name: "Dark Theme" })).toBeChecked();
    expect(saveTheme).toHaveBeenLastCalledWith("dark");

    await user.click(screen.getByRole("radio", { name: "System Theme" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    await vi.waitFor(() => expect(saveTheme).toHaveBeenLastCalledWith("system"));
  });

  it("runs the saves in click order", async () => {
    let finishFirst!: () => void;
    vi.mocked(saveTheme).mockReturnValueOnce(new Promise<void>((r) => (finishFirst = r)));
    const user = userEvent.setup();
    render(() => <ThemeChoice />);

    await user.click(screen.getByRole("radio", { name: "Light Theme" }));
    await user.click(screen.getByRole("radio", { name: "Dark Theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(saveTheme).toHaveBeenCalledTimes(1);
    expect(saveTheme).toHaveBeenCalledWith("light");

    finishFirst();
    await vi.waitFor(() => expect(saveTheme).toHaveBeenCalledTimes(2));
    expect(saveTheme).toHaveBeenLastCalledWith("dark");
  });

  it("keeps the new Theme after a failed save, shows no alert, and saves the next choice", async () => {
    vi.mocked(saveTheme).mockRejectedValueOnce(new Error("Network down"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    render(() => <ThemeChoice />);

    await user.click(screen.getByRole("radio", { name: "Light Theme" }));
    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("radio", { name: "Light Theme" })).toBeChecked();
    expect(alertSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Dark Theme" }));
    await vi.waitFor(() => expect(saveTheme).toHaveBeenLastCalledWith("dark"));
    alertSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
