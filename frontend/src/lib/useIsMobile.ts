import { createSignal, onMount, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";

// `breakpoint = 767` → max-width: 767px. Tailwind md: triggers at min-width: 768px.
// These are complementary (767 is mobile, 768+ is desktop).
export function useIsMobile(breakpoint = 767) {
  const mql = isServer ? null : window.matchMedia(`(max-width: ${breakpoint}px)`);
  // Init false to match SSR output. Reconcile in onMount so the post-hydration
  // change triggers Solid to patch markup (hydration trusts SSR + patches on change).
  const [isMobile, setIsMobile] = createSignal(false);
  onMount(() => {
    if (!mql) return;
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    onCleanup(() => mql.removeEventListener("change", handler));
  });
  return isMobile;
}
