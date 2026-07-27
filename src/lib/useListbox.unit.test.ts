import { describe, test, expect, vi } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { useListbox } from "./useListbox";

function keyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

// The listbox is keyed: each option's key is its index, so `selectedKey` is the
// selected index and the seam derives `selectedIndex` from `items`. `onSelect`
// receives `(item, index)`; with `items[i] === i` the item equals the index.
function setup(opts?: { count?: number; selected?: number; prefix?: string }) {
  const count = opts?.count ?? 5;
  const items = Array.from({ length: count }, (_, i) => i);
  const [selected, setSelected] = createSignal(opts?.selected ?? 0);
  const onSelect = vi.fn((_item: number, idx: number) => setSelected(idx));
  const result = useListbox({
    items: () => items,
    selectedKey: selected,
    keyOf: (_item, index) => index,
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
        expect(onSelect).toHaveBeenCalledWith(1, 1);
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
        expect(onSelect).toHaveBeenCalledWith(2, 2);
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
          items: () => [0, 1, 2, 3, 4],
          selectedKey: selected,
          keyOf: (_item, index) => index,
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

  // #38: the active-option focus ring is keyboard-modality only. The ring reaches
  // the DOM only through the option paint, so these tests observe it the way the
  // cards render it — the `"ring-2"` class in `getOptionProps(i).classList` — and
  // derive the ringed index from that (or -1 when no option carries the ring).
  type OptionProps = ReturnType<ReturnType<typeof setup>["getOptionProps"]>;
  const ringedIndex = (getOptionProps: (index: number) => OptionProps, count = 5) => {
    for (let i = 0; i < count; i++) {
      if (getOptionProps(i).classList["ring-2"]) return i;
    }
    return -1;
  };

  describe("ring visibility (keyboard modality, #38)", () => {
    test("no option carries the ring without keyboard focus", () => {
      createRoot((dispose) => {
        const { getOptionProps } = setup();
        expect(ringedIndex(getOptionProps)).toBe(-1);
        dispose();
      });
    });

    test("keyboard focus shows the ring on the active option", () => {
      createRoot((dispose) => {
        const { listboxProps, getOptionProps } = setup({ selected: 2 });
        listboxProps.onFocus();
        expect(ringedIndex(getOptionProps)).toBe(2);
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(ringedIndex(getOptionProps)).toBe(3);
        dispose();
      });
    });

    test("onClick selects but never shows the ring (no keyboard focus)", () => {
      createRoot((dispose) => {
        const { getOptionProps, focusedIndex, onSelect } = setup();
        getOptionProps(3).onClick();
        expect(onSelect).toHaveBeenCalledWith(3, 3);
        // active index tracked (so keyboard resumes here) but ring stays hidden
        expect(focusedIndex()).toBe(3);
        expect(ringedIndex(getOptionProps)).toBe(-1);
        dispose();
      });
    });

    test("a pointer press before focus keeps the ring hidden", () => {
      createRoot((dispose) => {
        const { listboxProps, getOptionProps } = setup();
        // browser order on a mouse click: pointerdown, then the listbox focuses
        listboxProps.onPointerDown();
        listboxProps.onFocus();
        expect(ringedIndex(getOptionProps)).toBe(-1);
        dispose();
      });
    });

    test("a pointer press on an already keyboard-focused listbox clears the ring", () => {
      createRoot((dispose) => {
        const { listboxProps, getOptionProps } = setup();
        listboxProps.onFocus(); // Tab in — ring visible
        expect(ringedIndex(getOptionProps)).toBe(0);
        listboxProps.onPointerDown(); // mouse click while focus stays put
        expect(ringedIndex(getOptionProps)).toBe(-1);
        dispose();
      });
    });

    test("blur removes the ring", () => {
      createRoot((dispose) => {
        const { listboxProps, getOptionProps } = setup();
        listboxProps.onFocus();
        expect(ringedIndex(getOptionProps)).toBe(0);
        listboxProps.onBlur();
        expect(ringedIndex(getOptionProps)).toBe(-1);
        dispose();
      });
    });

    test("keyboard navigation resumes from a clicked option", () => {
      createRoot((dispose) => {
        const { listboxProps, getOptionProps } = setup();
        getOptionProps(3).onClick(); // pointer: no ring, but index tracked
        expect(ringedIndex(getOptionProps)).toBe(-1);
        listboxProps.onFocus(); // Tab in (no pointerdown) — keyboard modality
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(ringedIndex(getOptionProps)).toBe(4);
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
        expect(onSelect).toHaveBeenCalledWith(3, 3);
        expect(focusedIndex()).toBe(3);
        dispose();
      });
    });

    // The seam owns the option paint so cards pass data, not classes (#37/#38).
    // `classList` carries the selection highlight and the keyboard-only ring.
    describe("option paint (classList)", () => {
      test("highlights only the selected option", () => {
        createRoot((dispose) => {
          const { getOptionProps } = setup({ selected: 2 });
          expect(getOptionProps(2).classList["bg-(--theme-highlight)"]).toBe(true);
          expect(getOptionProps(0).classList["bg-(--theme-highlight)"]).toBe(false);
          dispose();
        });
      });

      test("rings only the keyboard-active option, never on pointer selection", () => {
        createRoot((dispose) => {
          const { listboxProps, getOptionProps } = setup({ selected: 1 });
          // no keyboard focus yet → no ring anywhere
          expect(getOptionProps(1).classList["ring-2"]).toBe(false);
          expect(getOptionProps(1).classList["ring-(--theme-accent)"]).toBe(false);
          // Tab in → ring paints the active option
          listboxProps.onFocus();
          expect(getOptionProps(1).classList["ring-2"]).toBe(true);
          expect(getOptionProps(1).classList["ring-(--theme-accent)"]).toBe(true);
          expect(getOptionProps(0).classList["ring-2"]).toBe(false);
          dispose();
        });
      });
    });
  });

  // The seam is keyed: cards hand it `items` + a `selectedKey`, not a pre-computed
  // index. It derives the selected index itself, absorbing the index↔id adapter
  // the id-keyed cards used to duplicate.
  describe("keyed selection", () => {
    const items = [{ id: 10 }, { id: 20 }, { id: 30 }];

    test("derives the selected index from a non-index key", () => {
      createRoot((dispose) => {
        const [selectedKey] = createSignal(20);
        const { getOptionProps } = useListbox({
          items: () => items,
          selectedKey,
          keyOf: (item) => item.id,
          onSelect: () => {},
          label: "Keyed",
        });
        expect(getOptionProps(1)["aria-selected"]).toBe(true);
        expect(getOptionProps(1).classList["bg-(--theme-highlight)"]).toBe(true);
        expect(getOptionProps(0)["aria-selected"]).toBe(false);
        dispose();
      });
    });

    test("onSelect receives the picked item and its index", () => {
      createRoot((dispose) => {
        const [selectedKey] = createSignal(10);
        const onSelect = vi.fn();
        const { getOptionProps } = useListbox({
          items: () => items,
          selectedKey,
          keyOf: (item) => item.id,
          onSelect,
          label: "Keyed",
        });
        getOptionProps(2).onClick();
        expect(onSelect).toHaveBeenCalledWith({ id: 30 }, 2);
        dispose();
      });
    });

    test("nothing is selected when no key matches", () => {
      createRoot((dispose) => {
        const [selectedKey] = createSignal(999);
        const { getOptionProps } = useListbox({
          items: () => items,
          selectedKey,
          keyOf: (item) => item.id,
          onSelect: () => {},
          label: "Keyed",
        });
        expect(getOptionProps(0)["aria-selected"]).toBe(false);
        expect(getOptionProps(1)["aria-selected"]).toBe(false);
        expect(getOptionProps(2)["aria-selected"]).toBe(false);
        dispose();
      });
    });

    test("undefined items yields an empty listbox (count 0)", () => {
      createRoot((dispose) => {
        const [selectedKey] = createSignal<number | undefined>(undefined);
        const { listboxProps, focusedIndex } = useListbox({
          items: () => undefined,
          selectedKey,
          keyOf: (item: { id: number }) => item.id,
          onSelect: () => {},
          label: "Keyed",
        });
        // a keydown on an empty listbox is a no-op (guards count === 0)
        listboxProps.onKeyDown(keyEvent("ArrowDown"));
        expect(focusedIndex()).toBe(-1);
        dispose();
      });
    });
  });
});
