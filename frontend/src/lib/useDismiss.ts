import { onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import type { Accessor } from "solid-js";

export function useDismiss(
  onDismiss: () => void,
  active: Accessor<boolean>,
  ref?: () => HTMLElement | undefined,
) {
  if (isServer) return;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && active()) onDismiss();
  }
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  if (!ref) return;

  function onClick(e: MouseEvent) {
    if (!active()) return;
    const el = ref!();
    if (el && !el.contains(e.target as Node)) onDismiss();
  }
  document.addEventListener("click", onClick);
  onCleanup(() => document.removeEventListener("click", onClick));
}
