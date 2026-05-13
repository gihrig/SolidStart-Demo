import { onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import type { Accessor } from "solid-js";

export function useEscapeKey(onEscape: () => void, active: Accessor<boolean>) {
  if (isServer) return;

  function handler(e: KeyboardEvent) {
    if (e.key === "Escape" && active()) onEscape();
  }

  document.addEventListener("keydown", handler);
  onCleanup(() => document.removeEventListener("keydown", handler));
}
