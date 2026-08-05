import { createSignal, type Accessor } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useDismiss } from "~/lib/useDismiss";

/**
 * A disclosure: the open/toggle state plus the a11y wiring a collapsible panel
 * needs, exposed as two spreadable prop bags (matching `useListbox`'s shape).
 * `triggerProps` carries the button's `aria-expanded` / `aria-controls` / click;
 * `panelProps` carries the panel's `id` and the `inert` gate that removes a
 * hidden panel from the tab order. Callers spread these and keep only their own
 * open-driven paint (transitions differ per site). The home sidebar, the site
 * nav's mobile menu, the conversation drawer, and the site nav's profile dropdown
 * are the call sites; all hand-wired the identical `signal + aria + useDismiss + inert`
 * before this module owned it.
 */
export type DisclosureMode = "drawer" | "popup";

export interface UseDisclosureOptions {
  /**
   * Stable id shared by `panelProps.id` and the trigger's `aria-controls`, so
   * assistive tech links the button to the panel it controls.
   */
  id: string;
  /**
   * Which inert regime the panel follows:
   * - `"drawer"` (default): always shown on desktop, a collapsible drawer on
   *   mobile — inert only when mobile *and* closed.
   * - `"popup"`: hidden on every viewport until opened — inert whenever closed.
   */
  mode?: DisclosureMode;
  /**
   * Extra guard ANDed with `open()` to decide whether Escape / click-away
   * dismisses. Use it when a nested disclosure should absorb the dismiss first —
   * e.g. a mobile menu that stays open while a dropdown nested inside it is open.
   */
  dismissWhen?: Accessor<boolean>;
  /**
   * Opt-in click-outside boundary. When provided, a click outside this element
   * dismisses in addition to Escape. Omit for Escape-only disclosures (the
   * drawers have no single boundary element spanning trigger + panel).
   */
  ref?: () => HTMLElement | undefined;
}

export interface Disclosure {
  /** Spread onto the trigger `<button>`. */
  triggerProps: {
    readonly "aria-expanded": boolean;
    readonly "aria-controls": string;
    onClick: () => void;
  };
  /** Spread onto the panel element. */
  panelProps: {
    readonly id: string;
    readonly inert: boolean;
  };
  open: Accessor<boolean>;
  toggle: () => void;
}

export function useDisclosure(options: UseDisclosureOptions): Disclosure {
  const [open, setOpen] = createSignal(false);
  const isMobile = useIsMobile();
  const mode = options.mode ?? "drawer";

  const dismissActive = () => open() && (options.dismissWhen?.() ?? true);
  useDismiss(() => setOpen(false), dismissActive, options.ref);

  const toggle = () => setOpen((v) => !v);
  // A popup is hidden until opened, so it is inert whenever closed. A drawer is
  // always shown on desktop, so only its mobile-collapsed state is inert.
  const inert = () => (mode === "popup" ? !open() : isMobile() && !open());

  const triggerProps = {
    get "aria-expanded"() {
      return open();
    },
    "aria-controls": options.id,
    onClick: toggle,
  };
  const panelProps = {
    id: options.id,
    get inert() {
      return inert();
    },
  };

  return { triggerProps, panelProps, open, toggle };
}
