import { describe, test, expect, vi } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { useEscapeKey } from "./useEscapeKey";

function pressKey(key: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("useEscapeKey", () => {
  test("calls onEscape when Escape pressed and active", () => {
    createRoot((dispose) => {
      const onEscape = vi.fn();
      useEscapeKey(onEscape, () => true);
      pressKey("Escape");
      expect(onEscape).toHaveBeenCalledOnce();
      dispose();
    });
  });

  test("does not call onEscape when active is false", () => {
    createRoot((dispose) => {
      const onEscape = vi.fn();
      useEscapeKey(onEscape, () => false);
      pressKey("Escape");
      expect(onEscape).not.toHaveBeenCalled();
      dispose();
    });
  });

  test("does not call onEscape for non-Escape keys", () => {
    createRoot((dispose) => {
      const onEscape = vi.fn();
      useEscapeKey(onEscape, () => true);
      pressKey("Enter");
      pressKey("ArrowDown");
      pressKey("a");
      expect(onEscape).not.toHaveBeenCalled();
      dispose();
    });
  });

  test("respects signal reactivity for active guard", () => {
    createRoot((dispose) => {
      const onEscape = vi.fn();
      const [active, setActive] = createSignal(false);
      useEscapeKey(onEscape, active);

      pressKey("Escape");
      expect(onEscape).not.toHaveBeenCalled();

      setActive(true);
      pressKey("Escape");
      expect(onEscape).toHaveBeenCalledOnce();

      setActive(false);
      pressKey("Escape");
      expect(onEscape).toHaveBeenCalledOnce();

      dispose();
    });
  });

  test("removes listener on cleanup", () => {
    const onEscape = vi.fn();
    createRoot((dispose) => {
      useEscapeKey(onEscape, () => true);
      pressKey("Escape");
      expect(onEscape).toHaveBeenCalledOnce();
      dispose();
    });
    pressKey("Escape");
    expect(onEscape).toHaveBeenCalledOnce();
  });

  test("multiple instances coexist independently", () => {
    createRoot((dispose) => {
      const first = vi.fn();
      const second = vi.fn();
      const [firstActive, setFirstActive] = createSignal(true);

      useEscapeKey(first, firstActive);
      useEscapeKey(second, () => true);

      pressKey("Escape");
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();

      setFirstActive(false);
      pressKey("Escape");
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledTimes(2);

      dispose();
    });
  });
});
