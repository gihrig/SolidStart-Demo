# useMenu Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to run this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan follows the project's executable Phase/Step format (see `planning/jedi-conversion.md`).

**Goal:** Extract the JediNav profile dropdown into a reusable `useMenu` hook driven by a `{ id, label, onSelect }[]` data array, turning the panel into a real WAI-ARIA menu.

**Architecture:** A prop-getter hook mirroring `src/lib/useListbox.ts` — it owns open/active state, ARIA wiring, keyboard nav, and focus restoration, and composes `src/lib/useDismiss.ts` for click-away. It uses the **`aria-activedescendant`** model (focus stays on the menu container, no per-item refs), exactly like `useListbox`. The consumer supplies the data array, a wrapper `ref`, `class`es, and the label text.

**Tech Stack:** SolidJS 1.9.12, TypeScript, Tailwind v4, `vite-plus/test` (Vitest, jsdom), `@solidjs/testing-library`.

---

## Why this is deferred (read first)

This is **Backlog item 7**, not urgent work. A single two-item profile menu does not justify the abstraction (YAGNI). The cheap fix for the open review findings is the disclosure cleanup (delete `aria-haspopup`, add the panel `id`). Build `useMenu` only when a **second** menu appears, or when full menu semantics are wanted for consistency with `useListbox`.

Executing this plan resolves both 30th-cycle review findings at once:

- **Issue 1** — `aria-controls="jedi-profile-menu"` dangles (no matching `id`). `menuProps.id` supplies it.
- **Issue 2** — `aria-haspopup="true"` names a menu the panel isn't. `menuProps.role="menu"` + `getItemProps` `role="menuitem"` make it real.

## Decisions locked in (from the design discussion)

1. **`aria-activedescendant`, not roving DOM focus.** Focus stays on the menu container; arrow keys move `activeIndex`; the active item is referenced by `aria-activedescendant`. This needs no per-item refs, so `getItemProps` stays spreadable, matching `useListbox`. Trade-off: Enter/Space are handled by the container's `onKeyDown` (the items' native button activation is used only for mouse clicks).
2. **Compose `useDismiss`** for click-away + a guarded Escape fallback. `onMenuKeyDown` owns the focus-restoring Escape; because `useDismiss`'s Escape is gated by `active()` (verified `src/lib/useDismiss.ts:13`), the two coexist regardless of event order.
3. **Spread carries `ref` and `inert` safely** in Solid 1.9.12 (verified against `node_modules/solid-js/web/dist/dev.js`):
   - `spread()` invokes a function `ref` from spread props — `dev.js:314` `createRenderEffect(() => typeof props.ref === "function" && use(props.ref, node));`
   - `assignProp` `ref` branch — `dev.js:448` `if (prop === "ref") { if (!skipRef) value(node); }`
   - `inert` is a known boolean **property** (`booleans` list `dev.js:7`, folded into `Properties` at `dev.js:24`), so `assignProp` sets `node.inert = false` (`dev.js:478`) rather than the string `inert="false"`.
4. **Conventions mirror `useListbox`** — getters for reactive props, `tabIndex` (camelCase), `as const` return, keyboard wrap logic in the same ternary style.

## File Structure

- **Create** `src/lib/useMenu.ts` — the hook. One responsibility: profile-menu / generic menu-button behavior.
- **Create** `src/lib/useMenu.unit.test.ts` — hook unit tests (jsdom, `createRoot` + direct handler calls), mirroring `src/lib/useListbox.unit.test.ts`.
- **Modify** `src/components/JediNav.tsx` — replace the inline dropdown with `useMenu`.
- **Modify** `src/components/JediNav.test.tsx` — existing tests stay green; add three integration tests (menu wiring, ArrowDown opens, Escape closes).

---

## Phase 1: Create the `useMenu` hook (TDD)

### [ ] Step 1.1: Write the failing unit test

**File:** `src/lib/useMenu.unit.test.ts`

```ts
import { describe, test, expect, vi, afterEach } from "vite-plus/test";
import { createRoot } from "solid-js";
import { useMenu, type MenuItem } from "./useMenu";

function keyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

function makeItems(): MenuItem[] {
  return [
    { id: "m-0", label: "Item 0", onSelect: vi.fn() },
    { id: "m-1", label: "Item 1", onSelect: vi.fn() },
    { id: "m-2", label: "Item 2", onSelect: vi.fn() },
  ];
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useMenu", () => {
  describe("triggerProps", () => {
    test("advertises the menu it controls", () => {
      createRoot((dispose) => {
        const { triggerProps } = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        expect(triggerProps["aria-haspopup"]).toBe("true");
        expect(triggerProps["aria-controls"]).toBe("menu");
        expect(triggerProps["aria-expanded"]).toBe(false);
        dispose();
      });
    });

    test("onClick toggles open", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        expect(m.open()).toBe(false);
        m.triggerProps.onClick();
        expect(m.open()).toBe(true);
        m.triggerProps.onClick();
        expect(m.open()).toBe(false);
        dispose();
      });
    });

    test("ArrowDown opens and activates the first item", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        m.triggerProps.onKeyDown(keyEvent("ArrowDown"));
        expect(m.open()).toBe(true);
        expect(m.activeIndex()).toBe(0);
        dispose();
      });
    });

    test("ArrowUp opens and activates the last item", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        m.triggerProps.onKeyDown(keyEvent("ArrowUp"));
        expect(m.open()).toBe(true);
        expect(m.activeIndex()).toBe(2);
        dispose();
      });
    });
  });

  describe("menuProps", () => {
    test("has correct static menu attributes", () => {
      createRoot((dispose) => {
        const { menuProps } = useMenu({ items: makeItems(), id: "menu", label: "Profile" });
        expect(menuProps.id).toBe("menu");
        expect(menuProps.role).toBe("menu");
        expect(menuProps.tabIndex).toBe(-1);
        expect(menuProps["aria-label"]).toBe("Profile");
        dispose();
      });
    });

    test("inert / aria-hidden reflect closed state", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        expect(m.menuProps.inert).toBe(true);
        expect(m.menuProps["aria-hidden"]).toBe(true);
        m.triggerProps.onClick();
        expect(m.menuProps.inert).toBe(false);
        expect(m.menuProps["aria-hidden"]).toBe(false);
        dispose();
      });
    });

    test("aria-activedescendant is undefined when closed, item id when open", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        expect(m.menuProps["aria-activedescendant"]).toBeUndefined();
        m.triggerProps.onKeyDown(keyEvent("ArrowDown"));
        expect(m.menuProps["aria-activedescendant"]).toBe("m-0");
        dispose();
      });
    });
  });

  describe("onMenuKeyDown navigation", () => {
    test("ArrowDown moves forward and wraps", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        m.triggerProps.onClick();
        m.menuProps.onKeyDown(keyEvent("ArrowDown"));
        expect(m.activeIndex()).toBe(1);
        m.menuProps.onKeyDown(keyEvent("ArrowDown"));
        m.menuProps.onKeyDown(keyEvent("ArrowDown"));
        expect(m.activeIndex()).toBe(0);
        dispose();
      });
    });

    test("ArrowUp moves backward and wraps", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        m.triggerProps.onClick();
        m.menuProps.onKeyDown(keyEvent("ArrowUp"));
        expect(m.activeIndex()).toBe(2);
        dispose();
      });
    });

    test("Home / End jump to first / last", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        m.triggerProps.onClick();
        m.menuProps.onKeyDown(keyEvent("End"));
        expect(m.activeIndex()).toBe(2);
        m.menuProps.onKeyDown(keyEvent("Home"));
        expect(m.activeIndex()).toBe(0);
        dispose();
      });
    });

    test("Enter invokes the active item's onSelect and closes", () => {
      createRoot((dispose) => {
        const items = makeItems();
        const m = useMenu({ items, id: "menu", label: "Test" });
        m.triggerProps.onKeyDown(keyEvent("ArrowDown")); // open, active 0
        m.menuProps.onKeyDown(keyEvent("ArrowDown")); // active 1
        m.menuProps.onKeyDown(keyEvent("Enter"));
        expect(items[1].onSelect).toHaveBeenCalledOnce();
        expect(m.open()).toBe(false);
        dispose();
      });
    });

    test("Space invokes the active item's onSelect and closes", () => {
      createRoot((dispose) => {
        const items = makeItems();
        const m = useMenu({ items, id: "menu", label: "Test" });
        m.triggerProps.onClick(); // open, active 0
        m.menuProps.onKeyDown(keyEvent(" "));
        expect(items[0].onSelect).toHaveBeenCalledOnce();
        expect(m.open()).toBe(false);
        dispose();
      });
    });

    test("Escape and Tab close the menu", () => {
      createRoot((dispose) => {
        const m = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        m.triggerProps.onClick();
        m.menuProps.onKeyDown(keyEvent("Escape"));
        expect(m.open()).toBe(false);
        m.triggerProps.onClick();
        m.menuProps.onKeyDown(keyEvent("Tab"));
        expect(m.open()).toBe(false);
        dispose();
      });
    });
  });

  describe("getItemProps", () => {
    test("returns correct static menuitem attributes", () => {
      createRoot((dispose) => {
        const { getItemProps } = useMenu({ items: makeItems(), id: "menu", label: "Test" });
        const props = getItemProps(1);
        expect(props.id).toBe("m-1");
        expect(props.role).toBe("menuitem");
        expect(props.tabIndex).toBe(-1);
        dispose();
      });
    });

    test("onClick invokes onSelect and closes; onMouseEnter sets active", () => {
      createRoot((dispose) => {
        const items = makeItems();
        const m = useMenu({ items, id: "menu", label: "Test" });
        m.triggerProps.onClick(); // open
        m.getItemProps(2).onMouseEnter();
        expect(m.activeIndex()).toBe(2);
        m.getItemProps(2).onClick();
        expect(items[2].onSelect).toHaveBeenCalledOnce();
        expect(m.open()).toBe(false);
        dispose();
      });
    });
  });

  describe("focus management", () => {
    test("opening focuses the menu container; closing restores the trigger", async () => {
      const items = makeItems();
      let m!: ReturnType<typeof useMenu>;
      let dispose!: () => void;
      createRoot((d) => {
        dispose = d;
        m = useMenu({ items, id: "menu", label: "Test" });
      });
      const root = document.createElement("li");
      const trigger = document.createElement("button");
      const panel = document.createElement("div");
      panel.tabIndex = -1;
      root.append(trigger, panel);
      document.body.append(root);
      m.rootRef(root);
      m.triggerProps.ref(trigger);
      m.menuProps.ref(panel);

      m.triggerProps.onClick(); // open
      await Promise.resolve(); // flush queueMicrotask focus
      expect(document.activeElement).toBe(panel);

      m.menuProps.onKeyDown(keyEvent("Escape")); // close + restore
      expect(document.activeElement).toBe(trigger);
      dispose();
    });

    test("click outside the root closes via useDismiss (no focus restore)", () => {
      const items = makeItems();
      let m!: ReturnType<typeof useMenu>;
      let dispose!: () => void;
      createRoot((d) => {
        dispose = d;
        m = useMenu({ items, id: "menu", label: "Test" });
      });
      const root = document.createElement("li");
      const trigger = document.createElement("button");
      const panel = document.createElement("div");
      root.append(trigger, panel);
      const outside = document.createElement("div");
      document.body.append(root, outside);
      m.rootRef(root);
      m.triggerProps.ref(trigger);
      m.menuProps.ref(panel);

      m.triggerProps.onClick();
      expect(m.open()).toBe(true);
      outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(m.open()).toBe(false);
      dispose();
    });
  });
});
```

### [ ] Step 1.2: Run the test — verify it FAILS

Run: `vpr test:unit -t "useMenu"`
Expected: FAIL — `useMenu` is not defined / cannot find module `./useMenu`.

### [ ] Step 1.3: Implement the hook

**File:** `src/lib/useMenu.ts`

```ts
import { createSignal } from "solid-js";
import { useDismiss } from "./useDismiss";

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

interface UseMenuOptions {
  items: MenuItem[];
  id: string;
  label: string;
}

export function useMenu(options: UseMenuOptions) {
  const [open, setOpen] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(0);

  let rootEl: HTMLElement | undefined; // wraps trigger + panel → click-away boundary
  let triggerEl: HTMLElement | undefined; // focus restored here on close
  let menuEl: HTMLElement | undefined; // holds focus while open

  const count = () => options.items.length;
  const activeId = () => options.items[activeIndex()]?.id;

  function openMenu(index: number) {
    setActiveIndex(index);
    setOpen(true);
    queueMicrotask(() => menuEl?.focus()); // panel is inert until open; defer the focus
  }

  function closeMenu(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerEl?.focus();
  }

  // Click-away closes without restoring focus. useDismiss also catches Escape, but it is
  // guarded by active() (open), so onMenuKeyDown (which restores focus) wins either order.
  useDismiss(
    () => closeMenu(false),
    open,
    () => rootEl,
  );

  function onMenuKeyDown(e: KeyboardEvent) {
    const n = count();
    if (n === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i < n - 1 ? i + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : n - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(n - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        options.items[activeIndex()]?.onSelect();
        closeMenu(true);
        break;
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        closeMenu(false);
        break;
    }
  }

  const triggerProps = {
    ref: (el: HTMLElement) => (triggerEl = el),
    "aria-haspopup": "true" as const,
    "aria-controls": options.id,
    get "aria-expanded"() {
      return open();
    },
    onClick() {
      if (open()) closeMenu(false);
      else openMenu(0);
    },
    onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        openMenu(0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(count() - 1);
      }
    },
  };

  const menuProps = {
    ref: (el: HTMLElement) => (menuEl = el),
    id: options.id,
    role: "menu" as const,
    tabIndex: -1 as const,
    get "aria-label"() {
      return options.label;
    },
    get inert() {
      return !open();
    },
    get "aria-hidden"() {
      return !open();
    },
    get "aria-activedescendant"() {
      return open() ? activeId() : undefined;
    },
    onKeyDown: onMenuKeyDown,
  };

  function getItemProps(index: number) {
    return {
      id: options.items[index].id,
      role: "menuitem" as const,
      tabIndex: -1 as const,
      onClick() {
        options.items[index].onSelect();
        closeMenu(true);
      },
      onMouseEnter() {
        setActiveIndex(index);
      },
    };
  }

  return {
    open,
    activeIndex,
    rootRef: (el: HTMLElement) => (rootEl = el),
    triggerProps,
    menuProps,
    getItemProps,
  } as const;
}
```

### [ ] Step 1.4: Run the test — verify it PASSES

Run: `vpr test:unit -t "useMenu"`
Expected: PASS — all `useMenu` tests green.

### [ ] Step 1.5: Lint / format / type-check

Run: `vpr check`
Expected: no errors.

### [ ] Step 1.6: Commit

```bash
git add src/lib/useMenu.ts src/lib/useMenu.unit.test.ts
git commit -m "feat(useMenu): add reusable WAI-ARIA menu-button hook"
```

---

## Phase 2: Refactor JediNav to use `useMenu`

The current dropdown lives in `src/components/JediNav.tsx` (the third `<li>` inside `.navitems`). Apply the edits below. After the refactor, the panel is a real menu and both review findings are resolved.

### [ ] Step 2.1: Update imports

**File:** `src/components/JediNav.tsx`

Change the Solid import to add `For`, and import the hook:

```tsx
// before
import { createSignal, Show } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useDismiss } from "~/lib/useDismiss";

// after
import { createSignal, Show, For } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useDismiss } from "~/lib/useDismiss";
import { useMenu, type MenuItem } from "~/lib/useMenu";
```

### [ ] Step 2.2: Add the menu data array outside the component

**File:** `src/components/JediNav.tsx` — above `export default function JediNav()`:

```tsx
const PROFILE_MENU: MenuItem[] = [
  { id: "jedi-menu-profile", label: "My Profile", onSelect: () => alert("Not implemented") },
  { id: "jedi-menu-logout", label: "Log Out", onSelect: () => alert("Not implemented") },
];
```

### [ ] Step 2.3: Replace the dropdown state with the hook

**File:** `src/components/JediNav.tsx` — the top of the component body.

```tsx
// before
export default function JediNav() {
  const [mobileNavOpen, setMobileNavOpen] = createSignal(false);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const isMobile = useIsMobile();
  let dropdownRef: HTMLLIElement | undefined;

  useDismiss(
    () => setMobileNavOpen(false),
    () => mobileNavOpen() && !dropdownOpen(),
  );
  useDismiss(
    () => setDropdownOpen(false),
    dropdownOpen,
    () => dropdownRef,
  );

// after
export default function JediNav() {
  const [mobileNavOpen, setMobileNavOpen] = createSignal(false);
  const isMobile = useIsMobile();
  const menu = useMenu({ items: PROFILE_MENU, id: "jedi-profile-menu", label: "Profile menu" });

  useDismiss(
    () => setMobileNavOpen(false),
    () => mobileNavOpen() && !menu.open(),
  );
```

> The mobile-nav Escape gate now reads `!menu.open()` (was `!dropdownOpen()`), preserving the layered-dismiss behavior: the menu's own Escape fires first, the nav's only when the menu is closed.

### [ ] Step 2.4: Replace the dropdown `<li>` JSX

**File:** `src/components/JediNav.tsx` — the entire third `<li>` (the profile dropdown). Replace it with:

```tsx
<li ref={menu.rootRef} class="relative">
  <button
    {...menu.triggerProps}
    type="button"
    class="flex items-center gap-2 cursor-pointer select-none"
    aria-label="Profile menu"
  >
    <img
      class="h-8 rounded-full object-cover bg-teal-200"
      src="https://img.icons8.com/doodle/96/null/bart-simpson.png"
      alt="Bart avatar"
    />
    Bart
    <img
      class={`w-4 transition-transform duration-300 ${menu.open() ? "rotate-180" : ""}`}
      src="https://img.icons8.com/small/32/777777/expand-arrow.png"
      alt=""
    />
  </button>
  <div
    {...menu.menuProps}
    class={`absolute right-0 bg-(--theme-card-bg) text-(--theme-card-fg) shadow rounded-lg w-40 p-2 z-20 transition-[opacity,transform] duration-300 ease-out origin-top ${menu.open() ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 -translate-y-5 pointer-events-none"}`}
  >
    <ul class="hoverlist">
      <For each={PROFILE_MENU}>
        {(item, i) => (
          <li>
            <button
              {...menu.getItemProps(i())}
              type="button"
              classList={{ "bg-(--theme-highlight)": menu.activeIndex() === i() }}
            >
              {item.label}
            </button>
          </li>
        )}
      </For>
    </ul>
  </div>
</li>
```

> `menu.menuProps` now provides `id`, `role`, `tabIndex`, `aria-label`, `inert`, `aria-hidden`, `aria-activedescendant`, `ref`, and `onKeyDown` — so the panel keeps its old `inert`/`aria-hidden` behavior and gains the menu semantics. Do **not** add a separate `inert={...}` attribute; it comes from the spread.

### [ ] Step 2.5: Run the existing JediNav tests — verify they still PASS

Run: `vpr test:comp -t "JediNav"`
Expected: PASS. The existing dropdown tests key off the panel's `aria-hidden` and `pointer-events-none` class plus the trigger click, all preserved. If any fail, fix the refactor before continuing — do not edit the assertions to match a regression.

### [ ] Step 2.6: Add integration tests for the menu

**File:** `src/components/JediNav.test.tsx` — add inside the top-level `describe("<JediNav />")` block:

```tsx
it("trigger and panel expose menu-button semantics", () => {
  render(() => <JediNav />);
  const trigger = screen.getByRole("button", { name: /profile menu/i });
  expect(trigger).toHaveAttribute("aria-haspopup", "true");
  expect(trigger).toHaveAttribute("aria-controls", "jedi-profile-menu");
  const panel = screen.getByText("My Profile").closest("[role='menu']")!;
  expect(panel).toHaveAttribute("id", "jedi-profile-menu");
});

it("ArrowDown on the trigger opens the menu and activates the first item", async () => {
  const user = userEvent.setup();
  render(() => <JediNav />);
  const trigger = screen.getByRole("button", { name: /profile menu/i });
  const panel = screen.getByText("My Profile").closest("[aria-hidden]")!;
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(panel).toHaveAttribute("aria-hidden", "false");
  expect(panel).toHaveAttribute("aria-activedescendant", "jedi-menu-profile");
});

it("Escape closes the menu", async () => {
  const user = userEvent.setup();
  render(() => <JediNav />);
  const trigger = screen.getByRole("button", { name: /profile menu/i });
  const panel = screen.getByText("My Profile").closest("[aria-hidden]")!;
  await user.click(trigger);
  expect(panel).toHaveAttribute("aria-hidden", "false");
  await user.keyboard("{Escape}");
  expect(panel).toHaveAttribute("aria-hidden", "true");
});
```

> `JediNav.test.tsx` already imports `render`, `screen`, and `userEvent`; no new imports are required.

### [ ] Step 2.7: Run the JediNav tests — verify they PASS

Run: `vpr test:comp -t "JediNav"`
Expected: PASS — existing tests plus the three new ones.

### [ ] Step 2.8: Lint / format / type-check

Run: `vpr check`
Expected: no errors. Confirm `dropdownOpen`, `setDropdownOpen`, and `dropdownRef` are gone (the linter flags them as unused if any reference was missed).

### [ ] Step 2.9: Commit

```bash
git add src/components/JediNav.tsx src/components/JediNav.test.tsx
git commit -m "refactor(JediNav): drive profile menu with useMenu hook"
```

---

## Phase 3: Full verification

### [ ] Step 3.1: Run the whole suite + type-check + build

```bash
vpr check:type   # tsc --noEmit, no errors
vpr test:unit    # includes useMenu
vpr test:comp    # includes JediNav
vpr build        # production build succeeds
```

Expected: all green, no warnings.

### [ ] Step 3.2: Update review/backlog bookkeeping

- In `planning/Backlog.md`, mark item 7 done (or delete it).
- If the 30th-cycle review issues are tracked elsewhere, note that Issues 1 and 2 are resolved by this refactor (panel `id` present; real `role="menu"`).

---

## Self-review (completed against the spec)

- **Spec coverage:** data-array-driven hook (Phase 1.3), resolves Issue 1 via `menuProps.id` and Issue 2 via `role="menu"`/`menuitem` (Phase 2.4/2.6), composes `useDismiss` (Phase 1.3), aria-activedescendant model (Phase 1.3). ✓
- **Placeholder scan:** no TBD/TODO; every code step shows complete code. ✓
- **Type consistency:** `useMenu` returns `{ open, activeIndex, rootRef, triggerProps, menuProps, getItemProps }`; the JediNav consumer (2.3/2.4) uses exactly those names; `MenuItem` shape `{ id, label, onSelect }` is consistent across the hook, tests, and `PROFILE_MENU`. ✓
- **Known caveat:** the hook was designed against the Solid 1.9.12 runtime (spread `ref`/`inert`/getters verified) but not executed — Phase 1.4 and Phase 2.7 are the gates. If jsdom focus assertions in the hook's "focus management" tests prove flaky, keep the state-machine tests and rely on the JediNav integration tests for focus.

## Execution handoff

Two ways to run this:

1. **Subagent-driven (recommended)** — fresh subagent per task, review between tasks (`superpowers:subagent-driven-development`).
2. **Inline** — execute here with checkpoints (`superpowers:executing-plans`).
