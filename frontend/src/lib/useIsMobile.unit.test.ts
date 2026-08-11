import { describe, test, expect, vi, afterEach } from "vite-plus/test";
import { createRoot } from "solid-js";
import { useIsMobile } from "./useIsMobile";

function mockMatchMedia(matches: boolean) {
  const handlers: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches,
    addEventListener: vi.fn((_: string, handler: (e: MediaQueryListEvent) => void) => {
      handlers.push(handler);
    }),
    removeEventListener: vi.fn(),
    dispatchChange(newMatches: boolean) {
      handlers.forEach((h) => h({ matches: newMatches } as MediaQueryListEvent));
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return mql;
}

describe("useIsMobile", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns false when viewport not mobile", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      const isMobile = useIsMobile();
      expect(isMobile()).toBe(false);
      dispose();
    });
  });

  test("returns true when viewport is mobile", () => {
    mockMatchMedia(true);
    let dispose!: () => void;
    let isMobile!: () => boolean;

    createRoot((d) => {
      dispose = d;
      isMobile = useIsMobile();
    });

    // Signal inits false to match SSR; onMount reconciles to mql.matches after createRoot returns
    expect(isMobile()).toBe(true);
    dispose();
  });

  test("uses default 767px breakpoint", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      useIsMobile();
      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
      dispose();
    });
  });

  test("uses custom breakpoint", () => {
    mockMatchMedia(false);
    createRoot((dispose) => {
      useIsMobile(1024);
      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1024px)");
      dispose();
    });
  });

  // Effects (onMount) flush after createRoot callback returns, before createRoot itself returns.
  // So dispatchChange and cleanup assertions must run AFTER createRoot returns.

  test("updates signal to true when media query fires", () => {
    const mql = mockMatchMedia(false);
    let dispose!: () => void;
    let isMobile!: () => boolean;

    createRoot((d) => {
      dispose = d;
      isMobile = useIsMobile();
    });

    mql.dispatchChange(true);
    expect(isMobile()).toBe(true);
    dispose();
  });

  test("updates signal to false when media query fires", () => {
    const mql = mockMatchMedia(true);
    let dispose!: () => void;
    let isMobile!: () => boolean;

    createRoot((d) => {
      dispose = d;
      isMobile = useIsMobile();
    });

    mql.dispatchChange(false);
    expect(isMobile()).toBe(false);
    dispose();
  });

  test("removes change listener on cleanup", () => {
    const mql = mockMatchMedia(false);
    let dispose!: () => void;

    createRoot((d) => {
      dispose = d;
      useIsMobile();
    });

    expect(mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    dispose();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
