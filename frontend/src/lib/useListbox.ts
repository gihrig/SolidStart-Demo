import { createSignal, type Accessor } from "solid-js";

interface UseListboxOptions<T> {
  /** The options to render, in display order. `undefined` while a resource loads. */
  items: Accessor<readonly T[] | undefined>;
  /** Key of the currently selected option, matched against `keyOf`. */
  selectedKey: Accessor<PropertyKey | undefined>;
  /** Stable key for an option. Cards keyed by id return `item.id`; an
   *  index-keyed card returns the `index`. The seam finds the selection with it. */
  keyOf: (item: T, index: number) => PropertyKey;
  onSelect: (item: T, index: number) => void;
  label?: string;
  idPrefix?: string;
}

export function useListbox<T>(options: UseListboxOptions<T>) {
  const prefix = options.idPrefix ?? "listbox";
  // The seam owns index↔key: cards pass `items` + `selectedKey`, never a
  // pre-computed index or a hand-rolled findIndex adapter.
  const count = () => options.items()?.length ?? 0;
  const selectedIndex = () => {
    const items = options.items();
    if (!items) return -1;
    const key = options.selectedKey();
    return items.findIndex((item, index) => options.keyOf(item, index) === key);
  };
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
      const n = count();
      if (n === 0) return;
      let idx = focusedIndex();

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          idx = idx < n - 1 ? idx + 1 : 0;
          setFocusedIndex(idx);
          setFocusVisible(true);
          break;
        case "ArrowUp":
          e.preventDefault();
          idx = idx > 0 ? idx - 1 : n - 1;
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
          setFocusedIndex(n - 1);
          setFocusVisible(true);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (idx >= 0) select(idx);
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
        const sel = selectedIndex();
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

  // The option index that shows the focus ring, or -1 when the listbox is not
  // being navigated by keyboard — the ring is keyboard-modality only (#38).
  // Internal: the ring reaches the DOM only through `getOptionProps().classList`.
  const ringIndex = () => (focusVisible() ? focusedIndex() : -1);

  // Resolve the picked index back to its item before handing it to the caller,
  // so cards receive the domain object, not a raw index into their own list.
  function select(index: number) {
    const item = options.items()?.[index];
    if (item !== undefined) options.onSelect(item, index);
  }

  function getOptionProps(index: number) {
    return {
      id: `${prefix}-option-${index}`,
      role: "option" as const,
      tabIndex: -1 as const,
      get "aria-selected"() {
        return selectedIndex() === index;
      },
      // The seam owns the option paint (#37 highlight, #38 keyboard-only ring):
      // one place decides it, so a fix is verified once, not per card.
      get classList() {
        const ring = ringIndex() === index;
        return {
          "bg-(--theme-highlight)": selectedIndex() === index,
          "ring-2": ring,
          "ring-(--theme-accent)": ring,
        };
      },
      onClick() {
        select(index);
        setFocusedIndex(index);
      },
    };
  }

  return { listboxProps, getOptionProps, focusedIndex } as const;
}
