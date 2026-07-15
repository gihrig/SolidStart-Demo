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

describe("useDisclosure", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("starts closed", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure();
      expect(d.open()).toBe(false);
      dispose();
    });
  });

  test("toggle flips the open state", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure();
      d.toggle();
      expect(d.open()).toBe(true);
      d.toggle();
      expect(d.open()).toBe(false);
      dispose();
    });
  });

  test("inert is true only when mobile and closed", () => {
    mockMatchMedia(true); // mobile viewport
    let dispose!: () => void;
    let d!: ReturnType<typeof useDisclosure>;
    createRoot((dp) => {
      dispose = dp;
      d = useDisclosure();
    });
    // useIsMobile reconciles to mql.matches in onMount, after createRoot returns.
    expect(d.inert()).toBe(true);
    d.toggle();
    expect(d.inert()).toBe(false); // open panels are never inert
    dispose();
  });

  test("inert is false on desktop regardless of open state", () => {
    mockMatchMedia(false); // desktop viewport
    createRoot((dispose) => {
      const d = useDisclosure();
      expect(d.inert()).toBe(false);
      d.toggle();
      expect(d.inert()).toBe(false);
      dispose();
    });
  });

  test("Escape closes an open disclosure (dismiss wiring)", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const d = useDisclosure();
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
      const d = useDisclosure();
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
      const d = useDisclosure({ dismissWhen: () => !guardOpen() });
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
});
