import { createSignal, type Accessor } from "solid-js";

interface UseListboxOptions {
  count: Accessor<number>;
  selectedIndex: Accessor<number>;
  onSelect: (index: number) => void;
  label?: string;
  idPrefix?: string;
}

export function useListbox(options: UseListboxOptions) {
  const prefix = options.idPrefix ?? "listbox";
  const [focusedIndex, setFocusedIndex] = createSignal(-1);

  const listboxProps = {
    role: "listbox" as const,
    tabIndex: 0,
    get "aria-label"() {
      return options.label;
    },
    get "aria-activedescendant"() {
      const idx = focusedIndex();
      return idx >= 0 ? `${prefix}-option-${idx}` : undefined;
    },
    onKeyDown(e: KeyboardEvent) {
      const count = options.count();
      if (count === 0) return;
      let idx = focusedIndex();

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          idx = idx < count - 1 ? idx + 1 : 0;
          setFocusedIndex(idx);
          break;
        case "ArrowUp":
          e.preventDefault();
          idx = idx > 0 ? idx - 1 : count - 1;
          setFocusedIndex(idx);
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(count - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (idx >= 0) options.onSelect(idx);
          break;
      }
    },
    onFocus() {
      if (focusedIndex() < 0) {
        const sel = options.selectedIndex();
        setFocusedIndex(sel >= 0 ? sel : 0);
      }
    },
    onBlur() {
      setFocusedIndex(-1);
    },
  };

  function getOptionProps(index: number) {
    return {
      id: `${prefix}-option-${index}`,
      role: "option" as const,
      tabIndex: -1 as const,
      get "aria-selected"() {
        return options.selectedIndex() === index;
      },
      onClick() {
        options.onSelect(index);
        setFocusedIndex(index);
      },
    };
  }

  return { listboxProps, getOptionProps, focusedIndex } as const;
}
