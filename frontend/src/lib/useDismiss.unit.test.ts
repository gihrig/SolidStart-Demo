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

  // A boundary of more than one element: a toggle button and its panel that no
  // one element holds (#248).
  describe("a list boundary", () => {
    test("a click in any boundary element keeps it; a click outside all dismisses", () => {
      const toggle = document.createElement("button");
      document.body.append(toggle);
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(
          onDismiss,
          () => true,
          () => [toggle, container],
        );
        clickOn(toggle);
        clickOn(container);
        expect(onDismiss).not.toHaveBeenCalled();
        clickOn(outside);
        expect(onDismiss).toHaveBeenCalledOnce();
        dispose();
      });
      toggle.remove();
    });
  });

  // A toggle button that swaps its icon on a click removes the click target
  // before the document listener runs. The click was still inside (#248).
  test("a click on an element that the click removes from the boundary is inside", () => {
    const icon = document.createElement("span");
    container.append(icon);
    icon.addEventListener("click", () => icon.remove());
    createRoot((dispose) => {
      const onDismiss = vi.fn();
      useDismiss(
        onDismiss,
        () => true,
        () => container,
      );
      clickOn(icon);
      expect(onDismiss).not.toHaveBeenCalled();
      dispose();
    });
  });

  describe("focus out (opt-in)", () => {
    let insideButton: HTMLButtonElement;
    let outsideButton: HTMLButtonElement;

    beforeEach(() => {
      insideButton = document.createElement("button");
      outsideButton = document.createElement("button");
      container.append(insideButton);
      outside.append(outsideButton);
    });

    test("focus that moves outside the boundary dismisses, with the reason 'focus'", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(
          onDismiss,
          () => true,
          () => container,
          { focusOut: true },
        );
        insideButton.focus();
        expect(onDismiss).not.toHaveBeenCalled();
        outsideButton.focus();
        expect(onDismiss).toHaveBeenCalledExactlyOnceWith("focus");
        dispose();
      });
    });

    test("is off by default", () => {
      createRoot((dispose) => {
        const onDismiss = vi.fn();
        useDismiss(
          onDismiss,
          () => true,
          () => container,
        );
        outsideButton.focus();
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
          { focusOut: true },
        );
        outsideButton.focus();
        expect(onDismiss).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  test("passes the reason: 'escape' for Escape, 'click' for a click outside", () => {
    createRoot((dispose) => {
      const onDismiss = vi.fn();
      useDismiss(
        onDismiss,
        () => true,
        () => container,
      );
      pressKey("Escape");
      clickOn(outside);
      expect(onDismiss.mock.calls).toEqual([["escape"], ["click"]]);
      dispose();
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
