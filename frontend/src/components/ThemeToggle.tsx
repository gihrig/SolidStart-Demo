import Icon, { type IconName } from "~/components/Icon";
import { useTheme, type ThemeMode } from "~/components/ThemeContext";

const MODE_ICON = {
  light: "sun",
  dark: "moon",
  auto: "system",
} as const satisfies Record<ThemeMode, IconName>;

// Shows the mode and changes it; `ThemeProvider` owns the mode, so every copy
// shows the same one (#203).
export default function ThemeToggle() {
  const { mode, toggleMode } = useTheme();

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
