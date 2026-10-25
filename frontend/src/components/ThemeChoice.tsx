import { For } from "solid-js";
import { getRequestEvent, isServer } from "solid-js/web";
import { parseTheme, saveTheme, themeFromCookies, type Theme } from "~/lib/theme";
import Icon, { type IconName } from "~/components/Icon";

const THEME_ITEMS = [
  { theme: "system", icon: "system", label: "System Theme" },
  { theme: "light", icon: "sun", label: "Light Theme" },
  { theme: "dark", icon: "moon", label: "Dark Theme" },
] as const satisfies readonly { theme: Theme; icon: IconName; label: string }[];

// The server reads the saved theme from the cookie. The browser starts from the
// data-theme that the server rendered, so the server HTML and the hydrated page
// check the same item.
function initialTheme(): Theme {
  if (isServer) {
    return themeFromCookies(getRequestEvent()?.request.headers.get("cookie")) ?? "system";
  }
  return parseTheme(document.documentElement.getAttribute("data-theme"));
}

// CSS sets the colors and color-scheme from data-theme. With no data-theme, CSS
// follows the device: System Theme.
function applyTheme(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

// The Theme items of the Profile menu (#200): native radios, so the arrow keys
// change the Theme and a screen reader says "radio button, checked, 2 of 3".
// The radios keep the checked state; CSS shows the check mark from it.
export default function ThemeChoice() {
  const initial = initialTheme();

  // A choice changes the page at once. The saves run one after another, so the
  // last choice becomes the saved theme. A failed save keeps the new Theme until
  // the next page load, shows no alert, and does not stop the queue (ADR-0033).
  let saveQueue = Promise.resolve();
  function choose(theme: Theme) {
    applyTheme(theme);
    saveQueue = saveQueue.then(() =>
      saveTheme(theme).catch((error: unknown) => console.warn("[ThemeChoice] save failed", error)),
    );
  }

  return (
    // A fieldset grows to its content by default; min-w-0 keeps it in the panel.
    <fieldset class="min-w-0">
      <legend class="sr-only">Theme</legend>
      <div class="hoverlist">
        <For each={THEME_ITEMS}>
          {(item) => (
            <label class="theme-item">
              <input
                type="radio"
                name="theme"
                value={item.theme}
                checked={item.theme === initial}
                onChange={() => choose(item.theme)}
                class="sr-only"
              />
              <Icon name="check" class="theme-check w-4 h-4" />
              <Icon name={item.icon} class="w-4 h-4" />
              {item.label}
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}
