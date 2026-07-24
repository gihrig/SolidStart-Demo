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
  // Keyboard-modality gate for the active-option ring (#38): the ring — and the
  // `aria-activedescendant` that pairs with it — is shown only while the listbox
  // holds keyboard focus, mirroring the app's global `:focus-visible` rule. This
  // is decoupled from `focusedIndex`, which keeps tracking the active option on
  // pointer clicks too so keyboard navigation resumes from where the user clicked.
  const [focusVisible, setFocusVisible] = createSignal(false);
  // A pointer press immediately precedes the focus event on a mouse click; this
  // flag lets `onFocus` tell a click-focus (ring stays hidden) from a Tab-in.
  let hadPointerDown = false;

  const listboxProps = {
    role: "listbox" as const,
    tabIndex: 0,
    get "aria-label"() {
      return options.label;
    },
    get "aria-activedescendant"() {
      const idx = focusedIndex();
      return focusVisible() && idx >= 0 ? `${prefix}-option-${idx}` : undefined;
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
          setFocusVisible(true);
          break;
        case "ArrowUp":
          e.preventDefault();
          idx = idx > 0 ? idx - 1 : count - 1;
          setFocusedIndex(idx);
          setFocusVisible(true);
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          setFocusVisible(true);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(count - 1);
          setFocusVisible(true);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (idx >= 0) options.onSelect(idx);
          break;
      }
    },
    onPointerDown() {
      hadPointerDown = true;
      // A pointer press is a non-keyboard interaction: drop the ring immediately,
      // even when the listbox already held keyboard focus (no `onFocus` re-fires
      // in that case). Mirrors how `:focus-visible` clears on pointer input.
      setFocusVisible(false);
    },
    onFocus() {
      if (focusedIndex() < 0) {
        const sel = options.selectedIndex();
        setFocusedIndex(sel >= 0 ? sel : 0);
      }
      // Show the ring only when focus arrived via the keyboard (Tab), not a click.
      setFocusVisible(!hadPointerDown);
      hadPointerDown = false;
    },
    onBlur() {
      setFocusedIndex(-1);
      setFocusVisible(false);
      hadPointerDown = false;
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

  // The option index that shows the focus ring, or -1 when the listbox is not
  // being navigated by keyboard. Cards bind the ring to this, not `focusedIndex`.
  const ringIndex = () => (focusVisible() ? focusedIndex() : -1);

  return { listboxProps, getOptionProps, focusedIndex, ringIndex } as const;
}
