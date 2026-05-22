import { describe, test, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { useDismiss } from "./useDismiss";

function pressKey(key: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function clickOn(el: Node) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("useDismiss", () => {
  let container: HTMLDivElement;
  let outside: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    outside = document.createElement("div");
    document.body.appendChild(container);
    document.body.appendChild(outside);
  });

  afterEach(() => {
    container.remove();
    outside.remove();
  });

  describe("escape key", () => {
    test("calls onDismiss on Escape when active", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(onDismiss, () => true);
        pressKey("Escape");
        expect(onDismiss).toHaveBeenCalledOnce();
        dispose();
      });
    });

    test("does not call onDismiss on Escape when inactive", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(onDismiss, () => false);
        pressKey("Escape");
        expect(onDismiss).not.toHaveBeenCalled();
        dispose();
      });
    });

    test("does not call onDismiss for non-Escape keys", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(onDismiss, () => true);
        pressKey("Enter");
        pressKey("ArrowDown");
        pressKey("a");
        expect(onDismiss).not.toHaveBeenCalled();
        dispose();
      });
    });

    test("respects signal reactivity for active guard", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        const [active, setActive] = createSignal(false);
        useDismiss(onDismiss, active);

        pressKey("Escape");
        expect(onDismiss).not.toHaveBeenCalled();

        setActive(true);
        pressKey("Escape");
        expect(onDismiss).toHaveBeenCalledOnce();

        setActive(false);
        pressKey("Escape");
        expect(onDismiss).toHaveBeenCalledOnce();

        dispose();
      });
    });

    test("multiple instances coexist independently", () => {
      createRoot((dispose) => {
        const first = vi.fn();
        const second = vi.fn();
        const [firstActive, setFirstActive] = createSignal(true);

        useDismiss(first, firstActive);
        useDismiss(second, () => true);

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

  describe("click outside", () => {
    test("no click-outside behavior without ref", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(onDismiss, () => true);
        clickOn(outside);
        expect(onDismiss).not.toHaveBeenCalled();
        dispose();
      });
    });

    test("calls onDismiss on click outside when active", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(
          onDismiss,
          () => true,
          () => container,
        );
        clickOn(outside);
        expect(onDismiss).toHaveBeenCalledOnce();
        dispose();
      });
    });

    test("does not call onDismiss on click inside ref", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(
          onDismiss,
          () => true,
          () => container,
        );
        clickOn(container);
        expect(onDismiss).not.toHaveBeenCalled();
        dispose();
      });
    });

    test("does not fire when inactive", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(
          onDismiss,
          () => false,
          () => container,
        );
        clickOn(outside);
        expect(onDismiss).not.toHaveBeenCalled();
        dispose();
      });
    });

    test("activates and deactivates with signal", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        const [active, setActive] = createSignal(false);
        useDismiss(onDismiss, active, () => container);

        clickOn(outside);
        expect(onDismiss).not.toHaveBeenCalled();

        setActive(true);
        clickOn(outside);
        expect(onDismiss).toHaveBeenCalledOnce();

        setActive(false);
        clickOn(outside);
        expect(onDismiss).toHaveBeenCalledOnce();

        dispose();
      });
    });
  });

  describe("combined behavior", () => {
    test("escape and click-outside both work together", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(
          onDismiss,
          () => true,
          () => container,
        );

        pressKey("Escape");
        expect(onDismiss).toHaveBeenCalledOnce();

        clickOn(outside);
        expect(onDismiss).toHaveBeenCalledTimes(2);

        dispose();
      });
    });

    test("cleans up all listeners on dispose", () => {
      const onDismiss = vi.fn();
      createRoot((dispose) => {
        useDismiss(
          onDismiss,
          () => true,
          () => container,
        );
        pressKey("Escape");
        expect(onDismiss).toHaveBeenCalledOnce();
        dispose();
      });
      pressKey("Escape");
      clickOn(outside);
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });
});
