import { createSignal, type Accessor } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useDismiss } from "~/lib/useDismiss";

/**
 * A mobile disclosure: the open/toggle state plus the a11y wiring a mobile
 * collapsible panel needs — Escape-to-dismiss and the `inert` gate that removes
 * the collapsed panel from the tab order on mobile only (on desktop the panel
 * is always shown, so never inert). The Jedi route's sidebar and JediNav's
 * mobile menu are the two call sites; both hand-wired the identical
 * `signal + useIsMobile() + useDismiss + inert` before this module.
 */
export interface Disclosure {
  open: Accessor<boolean>;
  toggle: () => void;
  inert: Accessor<boolean>;
}

export interface UseDisclosureOptions {
  /**
   * Extra guard ANDed with `open()` to decide whether Escape dismisses. Use it
   * when a nested disclosure should absorb the dismiss first — e.g. JediNav's
   * mobile menu stays open while its profile dropdown is open.
   */
  dismissWhen?: Accessor<boolean>;
}

export function useDisclosure(options?: UseDisclosureOptions): Disclosure {
  const [open, setOpen] = createSignal(false);
  const isMobile = useIsMobile();

  const dismissActive = () => open() && (options?.dismissWhen?.() ?? true);
  useDismiss(() => setOpen(false), dismissActive);

  const toggle = () => setOpen((v) => !v);
  const inert = () => isMobile() && !open();

  return { open, toggle, inert };
}
