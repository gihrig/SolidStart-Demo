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
