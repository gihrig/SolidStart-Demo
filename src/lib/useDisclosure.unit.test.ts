import { describe, test, expect, vi, afterEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { useDisclosure } from "./useDisclosure";

// Mirror the useIsMobile test double: useDisclosure reads the viewport through it.
function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return mql;
}

function pressEscape() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

function clickOn(el: Element) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("useDisclosure", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("starts closed", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure({ id: "d" });
      expect(d.open()).toBe(false);
      expect(d.triggerProps["aria-expanded"]).toBe(false);
      dispose();
    });
  });

  test("toggle flips open and the trigger's aria-expanded", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure({ id: "d" });
      d.toggle();
      expect(d.open()).toBe(true);
      expect(d.triggerProps["aria-expanded"]).toBe(true);
      d.toggle();
      expect(d.open()).toBe(false);
      expect(d.triggerProps["aria-expanded"]).toBe(false);
      dispose();
    });
  });

  test("triggerProps.onClick toggles open", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure({ id: "d" });
      d.triggerProps.onClick();
      expect(d.open()).toBe(true);
      dispose();
    });
  });

  test("aria-controls matches panelProps.id (linked to the passed id)", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure({ id: "jedi-profile-menu" });
      expect(d.panelProps.id).toBe("jedi-profile-menu");
      expect(d.triggerProps["aria-controls"]).toBe("jedi-profile-menu");
      dispose();
    });
  });

  test("drawer mode: inert only when mobile and closed", () => {
    mockMatchMedia(true); // mobile viewport
    let dispose!: () => void;
    let d!: ReturnType<typeof useDisclosure>;
    createRoot((dp) => {
      dispose = dp;
      d = useDisclosure({ id: "d" }); // mode defaults to "drawer"
    });
    // useIsMobile reconciles to mql.matches in onMount, after createRoot returns.
    expect(d.panelProps.inert).toBe(true);
    d.toggle();
    expect(d.panelProps.inert).toBe(false); // open panels are never inert
    dispose();
  });

  test("drawer mode: never inert on desktop regardless of open state", () => {
    mockMatchMedia(false); // desktop viewport
    createRoot((dispose) => {
      const d = useDisclosure({ id: "d", mode: "drawer" });
      expect(d.panelProps.inert).toBe(false);
      d.toggle();
      expect(d.panelProps.inert).toBe(false);
      dispose();
    });
  });

  test("popup mode: inert whenever closed, on every viewport", () => {
    mockMatchMedia(false); // desktop — popup ignores the viewport
    createRoot((dispose) => {
      const d = useDisclosure({ id: "d", mode: "popup" });
      expect(d.panelProps.inert).toBe(true); // closed → inert even on desktop
      d.toggle();
      expect(d.panelProps.inert).toBe(false); // open → not inert
      dispose();
    });
  });

  test("Escape closes an open disclosure (dismiss wiring)", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure({ id: "d" });
      d.toggle();
      expect(d.open()).toBe(true);
      pressEscape();
      expect(d.open()).toBe(false);
      dispose();
    });
  });

  test("Escape is ignored while already closed", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure({ id: "d" });
      pressEscape();
      expect(d.open()).toBe(false);
      dispose();
    });
  });

  test("dismissWhen gate suppresses dismiss while its guard is false", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const [guardOpen, setGuardOpen] = createSignal(true);
      // e.g. a mobile nav that must stay open while its own dropdown is open.
      const d = useDisclosure({ id: "d", dismissWhen: () => !guardOpen() });
      d.toggle();
      expect(d.open()).toBe(true);

      pressEscape(); // guard is false (guardOpen true) → nav stays open
      expect(d.open()).toBe(true);

      setGuardOpen(false); // guard now true → Escape dismisses
      pressEscape();
      expect(d.open()).toBe(false);
      dispose();
    });
  });

  test("ref option: a click outside the boundary dismisses, inside does not", () => {
    mockMatchMedia(false);
    const boundary = document.createElement("div");
    const inside = document.createElement("button");
    boundary.appendChild(inside);
    const outside = document.createElement("div");
    document.body.append(boundary, outside);

    createRoot((dispose) => {
      const d = useDisclosure({ id: "d", ref: () => boundary });
      d.toggle();
      expect(d.open()).toBe(true);

      clickOn(inside); // inside the boundary → stays open
      expect(d.open()).toBe(true);

      clickOn(outside); // outside the boundary → dismiss
      expect(d.open()).toBe(false);
      dispose();
    });

    boundary.remove();
    outside.remove();
  });

  test("without a ref, an outside click does not dismiss (Escape-only)", () => {
    mockMatchMedia(false);
    const outside = document.createElement("div");
    document.body.append(outside);

    createRoot((dispose) => {
      const d = useDisclosure({ id: "d" });
      d.toggle();
      expect(d.open()).toBe(true);

      clickOn(outside);
      expect(d.open()).toBe(true); // no click-outside wiring without a ref
      dispose();
    });

    outside.remove();
  });
});
