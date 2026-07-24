import { describe, test, expect, vi } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { useListbox } from "./useListbox";

function keyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

function setup(opts?: { count?: number; selected?: number; prefix?: string }) {
  const count = opts?.count ?? 5;
  const [selected, setSelected] = createSignal(opts?.selected ?? 0);
  const onSelect = vi.fn((idx: number) => setSelected(idx));
  const result = useListbox({
    count: () => count,
    selectedIndex: selected,
    onSelect,
    label: "Test",
    idPrefix: opts?.prefix ?? "test",
  });
  return { ...result, selected, onSelect };
}

describe("useListbox", () => {
  describe("listboxProps", () => {
    test("has correct static attributes", () => {
      createRoot((dispose) => {
        const { listboxProps } = setup();
        expect(listboxProps.role).toBe("listbox");
        expect(listboxProps.tabIndex).toBe(0);
        expect(listboxProps["aria-label"]).toBe("Test");
        dispose();
      });
    });

    test("aria-activedescendant is undefined when no focus", () => {
      createRoot((dispose) => {
        const { listboxProps } = setup();
        expect(listboxProps["aria-activedescendant"]).toBeUndefined();
        dispose();
      });
    });

    test("aria-activedescendant reflects focused option", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup();
        listboxProps.onFocus();
        expect(focusedIndex()).toBe(0);
        expect(listboxProps["aria-activedescendant"]).toBe("test-option-0");
        dispose();
      });
    });
  });

  describe("keyboard navigation", () => {
    test("ArrowDown moves focus forward", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup();
        listboxProps.onFocus();
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(focusedIndex()).toBe(1);
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(focusedIndex()).toBe(2);
        dispose();
      });
    });

    test("ArrowDown wraps to first item", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup({ count: 3 });
        listboxProps.onFocus();
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(focusedIndex()).toBe(2);
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(focusedIndex()).toBe(0);
        dispose();
      });
    });

    test("ArrowUp moves focus backward", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup({ selected: 2 });
        listboxProps.onFocus();
        expect(focusedIndex()).toBe(2);
        listboxProps.onKeyDown(keyEvent("ArrowUp"));
        expect(focusedIndex()).toBe(1);
        dispose();
      });
    });

    test("ArrowUp wraps to last item", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup({ count: 3 });
        listboxProps.onFocus();
        expect(focusedIndex()).toBe(0);
        listboxProps.onKeyDown(keyEvent("ArrowUp"));
        expect(focusedIndex()).toBe(2);
        dispose();
      });
    });

    test("Home moves focus to first item", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup({ selected: 3 });
        listboxProps.onFocus();
        expect(focusedIndex()).toBe(3);
        listboxProps.onKeyDown(keyEvent("Home"));
        expect(focusedIndex()).toBe(0);
        dispose();
      });
    });

    test("End moves focus to last item", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup({ count: 5 });
        listboxProps.onFocus();
        listboxProps.onKeyDown(keyEvent("End"));
        expect(focusedIndex()).toBe(4);
        dispose();
      });
    });

    test("Enter selects focused item", () => {
      createRoot((dispose) => {
        const { listboxProps, onSelect } = setup();
        listboxProps.onFocus();
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        listboxProps.onKeyDown(keyEvent("Enter"));
        expect(onSelect).toHaveBeenCalledWith(1);
        dispose();
      });
    });

    test("Space selects focused item", () => {
      createRoot((dispose) => {
        const { listboxProps, onSelect } = setup();
        listboxProps.onFocus();
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        listboxProps.onKeyDown(keyEvent(" "));
        expect(onSelect).toHaveBeenCalledWith(2);
        dispose();
      });
    });

    test("Enter/Space does nothing when no item focused", () => {
      createRoot((dispose) => {
        const { listboxProps, onSelect } = setup();
        listboxProps.onKeyDown(keyEvent("Enter"));
        listboxProps.onKeyDown(keyEvent(" "));
        expect(onSelect).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("focus management", () => {
    test("onFocus sets focusedIndex to selected item", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup({ selected: 3 });
        listboxProps.onFocus();
        expect(focusedIndex()).toBe(3);
        dispose();
      });
    });

    test("onFocus defaults to 0 when no selection", () => {
      createRoot((dispose) => {
        const [selected] = createSignal(-1);
        const { listboxProps, focusedIndex } = useListbox({
          count: () => 5,
          selectedIndex: selected,
          onSelect: () => {},
          label: "Test",
        });
        listboxProps.onFocus();
        expect(focusedIndex()).toBe(0);
        dispose();
      });
    });

    test("onBlur resets focusedIndex", () => {
      createRoot((dispose) => {
        const { listboxProps, focusedIndex } = setup();
        listboxProps.onFocus();
        expect(focusedIndex()).toBe(0);
        listboxProps.onBlur();
        expect(focusedIndex()).toBe(-1);
        dispose();
      });
    });
  });

  // #38: the active-option focus ring is keyboard-modality only. `ringIndex` is
  // the ring's source of truth — it points at an option only while the listbox
  // holds keyboard focus, never on pointer interaction.
  describe("ring visibility (keyboard modality, #38)", () => {
    test("ringIndex is -1 with no keyboard focus", () => {
      createRoot((dispose) => {
        const { ringIndex } = setup();
        expect(ringIndex()).toBe(-1);
        dispose();
      });
    });

    test("keyboard focus shows the ring on the active option", () => {
      createRoot((dispose) => {
        const { listboxProps, ringIndex } = setup({ selected: 2 });
        listboxProps.onFocus();
        expect(ringIndex()).toBe(2);
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(ringIndex()).toBe(3);
        dispose();
      });
    });

    test("onClick selects but never shows the ring (no keyboard focus)", () => {
      createRoot((dispose) => {
        const { getOptionProps, ringIndex, focusedIndex, onSelect } = setup();
        getOptionProps(3).onClick();
        expect(onSelect).toHaveBeenCalledWith(3);
        // active index tracked (so keyboard resumes here) but ring stays hidden
        expect(focusedIndex()).toBe(3);
        expect(ringIndex()).toBe(-1);
        dispose();
      });
    });

    test("a pointer press before focus keeps the ring hidden", () => {
      createRoot((dispose) => {
        const { listboxProps, ringIndex } = setup();
        // browser order on a mouse click: pointerdown, then the listbox focuses
        listboxProps.onPointerDown();
        listboxProps.onFocus();
        expect(ringIndex()).toBe(-1);
        dispose();
      });
    });

    test("a pointer press on an already keyboard-focused listbox clears the ring", () => {
      createRoot((dispose) => {
        const { listboxProps, ringIndex } = setup();
        listboxProps.onFocus(); // Tab in — ring visible
        expect(ringIndex()).toBe(0);
        listboxProps.onPointerDown(); // mouse click while focus stays put
        expect(ringIndex()).toBe(-1);
        dispose();
      });
    });

    test("blur removes the ring", () => {
      createRoot((dispose) => {
        const { listboxProps, ringIndex } = setup();
        listboxProps.onFocus();
        expect(ringIndex()).toBe(0);
        listboxProps.onBlur();
        expect(ringIndex()).toBe(-1);
        dispose();
      });
    });

    test("keyboard navigation resumes from a clicked option", () => {
      createRoot((dispose) => {
        const { listboxProps, getOptionProps, ringIndex } = setup();
        getOptionProps(3).onClick(); // pointer: no ring, but index tracked
        expect(ringIndex()).toBe(-1);
        listboxProps.onFocus(); // Tab in (no pointerdown) — keyboard modality
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(ringIndex()).toBe(4);
        dispose();
      });
    });

    test("aria-activedescendant is not advertised after a pointer click", () => {
      createRoot((dispose) => {
        const { listboxProps, getOptionProps } = setup();
        getOptionProps(2).onClick();
        expect(listboxProps["aria-activedescendant"]).toBeUndefined();
        dispose();
      });
    });
  });

  describe("getOptionProps", () => {
    test("returns correct static attributes", () => {
      createRoot((dispose) => {
        const { getOptionProps } = setup({ prefix: "cat" });
        const props = getOptionProps(2);
        expect(props.id).toBe("cat-option-2");
        expect(props.role).toBe("option");
        expect(props.tabIndex).toBe(-1);
        dispose();
      });
    });

    test("aria-selected reflects selectedIndex", () => {
      createRoot((dispose) => {
        const { getOptionProps } = setup({ selected: 2 });
        expect(getOptionProps(2)["aria-selected"]).toBe(true);
        expect(getOptionProps(0)["aria-selected"]).toBe(false);
        dispose();
      });
    });

    test("onClick calls onSelect and sets focusedIndex", () => {
      createRoot((dispose) => {
        const { getOptionProps, onSelect, focusedIndex } = setup();
        getOptionProps(3).onClick();
        expect(onSelect).toHaveBeenCalledWith(3);
        expect(focusedIndex()).toBe(3);
        dispose();
      });
    });
  });
});
