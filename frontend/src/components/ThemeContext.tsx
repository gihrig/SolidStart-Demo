import {
  createContext,
  useContext,
  createSignal,
  onMount,
  type Accessor,
  type ParentComponent,
} from "solid-js";

export type ThemeMode = "light" | "dark" | "auto";

// The one owner of the theme mode (#203). The Nav renders a ThemeToggle in the
// bar and one in the mobile menu, and both show and change this mode. The mode
// lives in localStorage (`theme`), which `public/theme-init.js` reads before the
// first paint. #200 replaces localStorage with a cookie the server reads.
interface ThemeContextValue {
  /** The current mode: "auto" follows the OS. */
  mode: Accessor<ThemeMode>;
  /** Moves to the next mode: light → dark → auto → light. */
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>();

function getInitialMode(): ThemeMode {
  // onMount (only call site) doesn't run server-side.
  // `typeof window...` crashes server-side. Defensive code in case
  // `getInitialMode` is called from server-active code
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "auto";
}

// CSS sets color-scheme from data-theme, and follows the OS in auto mode (#203).
function applyThemeMode(mode: ThemeMode) {
  if (mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }
}

export const ThemeProvider: ParentComponent = (props) => {
  const [mode, setMode] = createSignal<ThemeMode>("auto");

  onMount(() => {
    const initialMode = getInitialMode();
    setMode(initialMode);
    applyThemeMode(initialMode);
  });

  function toggleMode() {
    const next: ThemeMode = mode() === "light" ? "dark" : mode() === "dark" ? "auto" : "light";
    setMode(next);
    applyThemeMode(next);
    window.localStorage.setItem("theme", next);
  }

  return (
    <ThemeContext.Provider value={{ mode, toggleMode }}>{props.children}</ThemeContext.Provider>
  );
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
