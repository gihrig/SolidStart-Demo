import { createSignal, onMount, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";

export function useIsMobile(breakpoint = 767) {
  const mql = isServer ? null : window.matchMedia(`(max-width: ${breakpoint}px)`);
  const [isMobile, setIsMobile] = createSignal(mql?.matches ?? false);
  onMount(() => {
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    onCleanup(() => mql.removeEventListener("change", handler));
  });
  return isMobile;
}
