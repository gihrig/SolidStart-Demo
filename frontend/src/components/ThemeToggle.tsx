import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import Icon, { type IconName } from "~/components/Icon";

type ThemeMode = "light" | "dark" | "auto";

const MODE_ICON = {
  light: "sun",
  dark: "moon",
  auto: "system",
} as const satisfies Record<ThemeMode, IconName>;

function getInitialMode(): ThemeMode {
  // onMount (only call site) doesn't run server-side.
  // `typeof window...` crashes server-side. Defensive code in case
  // `getInitialMode` is called from server-active code
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "auto";
}

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;
  if (mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }
  document.documentElement.style.colorScheme = resolved;
}

export default function ThemeToggle() {
  const [mode, setMode] = createSignal<ThemeMode>("auto");

  onMount(() => {
    const initialMode = getInitialMode();
    setMode(initialMode);
    applyThemeMode(initialMode);
  });

  // Solid calls only cleanups registered in the prior run — early return with no onCleanup is safe
  createEffect(() => {
    if (mode() !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("auto");
    media.addEventListener("change", onChange);
    onCleanup(() => media.removeEventListener("change", onChange));
  });

  function toggleMode() {
    const next: ThemeMode = mode() === "light" ? "dark" : mode() === "dark" ? "auto" : "light";
    setMode(next);
    applyThemeMode(next);
    window.localStorage.setItem("theme", next);
  }

  const label = () =>
    mode() === "auto"
      ? "Theme: system. Click for light."
      : mode() === "light"
        ? "Theme: light. Click for dark."
        : "Theme: dark. Click for system.";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label()}
      title={label()}
      class="rounded-lg p-2 transition hover:bg-(--theme-hover-bg)"
    >
      <Icon name={MODE_ICON[mode()]} class="w-5 h-5" />
    </button>
  );
}
