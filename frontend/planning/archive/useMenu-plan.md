# useMenu Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to run this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan follows the project's executable Phase/Step format (see `planning/archive/jedi-conversion.md`).

**Goal:** Extract the Nav profile dropdown into a reusable `useMenu` hook driven by a `{ id, label, onSelect }[]` data array, turning the panel into a real WAI-ARIA menu.

**Architecture:** A prop-getter hook mirroring `src/lib/useListbox.ts` — it owns open/active state, ARIA wiring, keyboard nav, and focus restoration, and composes `src/lib/useDismiss.ts` for click-away. It uses the **`aria-activedescendant`** model (focus stays on the menu container, no per-item refs), exactly like `useListbox`. The consumer supplies the data array, a wrapper `ref`, `class`es, and the label text.

**Tech Stack:** SolidJS 1.9.12, TypeScript, Tailwind v4, `vite-plus/test` (Vitest, jsdom), `@solidjs/testing-library`.

---

## Why this is deferred (read first)

This is GitHub issue **#14** (`planning/archive/Backlog.md` item 14), not urgent work. A single two-item profile menu does not justify the abstraction (YAGNI). Build `useMenu` only when a **second** menu appears, or when full menu semantics are wanted for consistency with `useListbox`.

The two 30th-cycle review findings that first motivated this plan are **already resolved** by the cheap disclosure fix: the profile dropdown now runs on `useDisclosure` (`src/lib/useDisclosure.ts`).

- **Issue 1** — `aria-controls` dangled (no matching panel `id`). Resolved: `useDisclosure` sets the trigger's `aria-controls` and the panel's `id` from one option (`"profile-menu"`).
- **Issue 2** — `aria-haspopup="true"` named a menu the panel was not. Resolved: `aria-haspopup` is gone, and the panel is an honest disclosure.

So this plan fixes no open defect. What it adds is **menu semantics**: `role="menu"` / `role="menuitem"`, arrow-key / Home / End navigation through `aria-activedescendant`, Enter / Space activation, and focus that moves into the menu on open and returns to the trigger on close. With a real menu behind it, the trigger's `aria-haspopup="true"` becomes correct again.

## Decisions locked in (from the design discussion)

1. **`aria-activedescendant`, not roving DOM focus.** Focus stays on the menu container; arrow keys move `activeIndex`; the active item is referenced by `aria-activedescendant`. This needs no per-item refs, so `getItemProps` stays spreadable, matching `useListbox`. Enter/Space on the container **click the active item's element** (found by its `id`), so keyboard and mouse share one activation path — `getItemProps`' `onClick` — and a link item (`<a href>`, e.g. the logged-out "Log In") keeps its native router navigation.
2. **Compose `useDismiss`** for click-away + a guarded Escape fallback. `onMenuKeyDown` owns the focus-restoring Escape; because `useDismiss`'s Escape is gated by `active()` (verified `src/lib/useDismiss.ts:13`), the two coexist regardless of event order.
3. **Spread carries `ref` and `inert` safely** in Solid 1.9.12 (verified against `node_modules/solid-js/web/dist/dev.js`):
   - `spread()` invokes a function `ref` from spread props — `dev.js:314` `createRenderEffect(() => typeof props.ref === "function" && use(props.ref, node));`
   - `assignProp` `ref` branch — `dev.js:448` `if (prop === "ref") { if (!skipRef) value(node); }`
   - `inert` is a known boolean **property** (`booleans` list `dev.js:7`, folded into `Properties` at `dev.js:24`), so `assignProp` sets `node.inert = false` (`dev.js:478`) rather than the string `inert="false"`.
4. **Conventions mirror `useListbox`** — getters for reactive props, `tabIndex` (camelCase), `as const` return, keyboard wrap logic in the same ternary style.

## File Structure

- **Create** `src/lib/useMenu.ts` — the hook. One responsibility: profile-menu / generic menu-button behavior.
- **Create** `src/lib/useMenu.unit.test.ts` — hook unit tests (jsdom, `createRoot` + direct handler calls), mirroring `src/lib/useListbox.unit.test.ts`.
- **Modify** `src/components/Nav.tsx` — replace the inline dropdown with `useMenu`.
- **Modify** `src/components/Nav.test.tsx` — change the existing item role queries (`button` / `link` → `menuitem`); add four integration tests (menu wiring, ArrowDown opens, Enter on Log In, Escape closes).

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

// Keyboard activation clicks the active item's element (found by id), so the
// Enter / Space tests need real item elements wired to getItemProps' onClick.
function mountItems(m: ReturnType<typeof useMenu>, items: MenuItem[]) {
  const panel = document.createElement("div");
  items.forEach((item, i) => {
    const el = document.createElement("button");
    el.id = item.id;
    el.addEventListener("click", () => m.getItemProps(i).onClick());
    panel.append(el);
  });
  document.body.append(panel);
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

    test("Enter clicks the active item: its onSelect runs and the menu closes", () => {
      createRoot((dispose) => {
        const items = makeItems();
        const m = useMenu({ items, id: "menu", label: "Test" });
        mountItems(m, items);
        m.triggerProps.onKeyDown(keyEvent("ArrowDown")); // open, active 0
        m.menuProps.onKeyDown(keyEvent("ArrowDown")); // active 1
        m.menuProps.onKeyDown(keyEvent("Enter"));
        expect(items[1].onSelect).toHaveBeenCalledOnce();
        expect(m.open()).toBe(false);
        dispose();
      });
    });

    test("Space clicks the active item: its onSelect runs and the menu closes", () => {
      createRoot((dispose) => {
        const items = makeItems();
        const m = useMenu({ items, id: "menu", label: "Test" });
        mountItems(m, items);
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
      case " ": {
        e.preventDefault();
        // Activate through the item's own click, so keyboard and mouse share one
        // path (getItemProps' onClick) and a link item keeps its native navigation.
        const id = activeId();
        if (id) document.getElementById(id)?.click();
        break;
      }
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

## Phase 2: Refactor Nav to use `useMenu`

The profile dropdown lives in `src/components/Nav.tsx`: a `<div class="relative">` wrapper (the click-away boundary) holding the trigger `<button>` and the panel `<div>`. Today it is a **disclosure** driven by `useDisclosure({ id: "profile-menu", mode: "popup", ref: () => dropdownRef })`, which already supplies the panel `id` / `aria-controls` pair and the closed-panel `inert` gate. This phase swaps that disclosure for `useMenu`, so the panel becomes a real WAI-ARIA menu. The mobile nav keeps its own `useDisclosure` — it is not touched.

The menu's items depend on auth state, so they are not a fixed array:

- **My Profile** — always shown; a `<button>` (placeholder `alert`).
- **Log In** — logged out only; an `<a href="/fullstack">`. Enter/Space click the element (Decision 1), so the router's native anchor handling navigates on both mouse and keyboard; its `onSelect` is a no-op.
- **Log Out** — logged in only; a `<button>` that calls `logoff()`.

The hook reads `options.items` lazily on every access, so passing a **getter** backed by a `createMemo` keeps the list reactive with no Phase 1 change.

### [ ] Step 2.1: Update imports

**File:** `src/components/Nav.tsx`

```tsx
// before
import { For, Show } from "solid-js";
import { useDisclosure } from "~/lib/useDisclosure";
import { useAuth } from "~/components/AuthContext";
import Icon from "~/components/Icon";
import ThemeToggle from "~/components/ThemeToggle";

// after
import { createMemo, For, Show } from "solid-js";
import { useDisclosure } from "~/lib/useDisclosure";
import { useMenu, type MenuItem } from "~/lib/useMenu";
import { useAuth } from "~/components/AuthContext";
import Icon from "~/components/Icon";
import ThemeToggle from "~/components/ThemeToggle";
```

> `useDisclosure` stays — the mobile nav still uses it.

### [ ] Step 2.2: Add the static menu data outside the component

**File:** `src/components/Nav.tsx` — below `NAV_LINKS`, above `export default function Nav()`:

```tsx
// A profile-menu entry. `href` marks a link item: it renders as an <a>, and the
// hook's Enter / Space click it, so the router performs the navigation.
type ProfileMenuItem = MenuItem & { href?: string };

const PROFILE_MENU_ID = "profile-menu";

const MY_PROFILE: ProfileMenuItem = {
  id: "profile-menu-profile",
  label: "My Profile",
  onSelect: () => alert("Not implemented"),
};

// Navigation comes from the anchor's native click, so selecting does nothing more.
const LOG_IN: ProfileMenuItem = {
  id: "profile-menu-login",
  label: "Log In",
  href: "/fullstack",
  onSelect: () => {},
};
```

> The panel id stays `"profile-menu"`, so the existing `document.getElementById("profile-menu")` tests keep working. "Log Out" is built inside the component (Step 2.3) because its `onSelect` needs `logoff` from `useAuth()`.

### [ ] Step 2.3: Replace the dropdown disclosure with the hook

**File:** `src/components/Nav.tsx` — the top of the component body.

```tsx
// before
export default function Nav() {
  let dropdownRef: HTMLDivElement | undefined;

  // Identity (avatar + display name) comes from the useAuth seam; the interim
  // blend with the Jedi mock profile lives there, not here (see ADR-0007).
  const { isAuthenticated, logoff, displayName, avatarUrl } = useAuth();

  // The profile dropdown is a popup — hidden (and inert) whenever closed, on
  // every viewport — dismissed by Escape or a click outside its wrapping <div>.
  const dropdown = useDisclosure({
    id: "profile-menu",
    mode: "popup",
    ref: () => dropdownRef,
  });
  const mobileNav = useDisclosure({ id: "site-mobile-nav" });

// after
export default function Nav() {
  // Identity (avatar + display name) comes from the useAuth seam; the interim
  // blend with the Jedi mock profile lives there, not here (see ADR-0007).
  const { isAuthenticated, logoff, displayName, avatarUrl } = useAuth();

  const logOut: ProfileMenuItem = {
    id: "profile-menu-logout",
    label: "Log Out",
    onSelect: () => void logoff(),
  };
  // Log In and Log Out swap with auth state; each item object is stable, so
  // <For> keeps the My Profile row when the second item swaps.
  const profileItems = createMemo(() => [MY_PROFILE, isAuthenticated() ? logOut : LOG_IN]);

  // The profile menu is a WAI-ARIA menu button — hidden (and inert) whenever
  // closed, on every viewport — dismissed by Escape, Tab, or a click outside its
  // wrapping <div>. The getter keeps the hook reading the current item list.
  const menu = useMenu({
    get items() {
      return profileItems();
    },
    id: PROFILE_MENU_ID,
    label: "Profile menu",
  });
  const mobileNav = useDisclosure({ id: "site-mobile-nav" });
```

### [ ] Step 2.4: Replace the dropdown JSX

**File:** `src/components/Nav.tsx` — replace the whole block from `{/* Profile dropdown — always visible */}` through the wrapper's closing `</div>` (just above `<ThemeToggle />`) with:

```tsx
{
  /* Profile menu — always visible */
}
<div ref={menu.rootRef} class="relative">
  <button
    type="button"
    aria-label="Profile menu"
    {...menu.triggerProps}
    class="flex items-center gap-2 cursor-pointer select-none"
  >
    <img
      class="h-8 rounded-full object-cover bg-teal-200"
      src={avatarUrl()}
      alt={displayName() ? `${displayName()} avatar` : ""}
    />
    <span class="hidden sm:inline">{displayName()}</span>
    <Icon
      name="expand-arrow"
      class={`w-4 h-4 transition-transform duration-300 ${menu.open() ? "rotate-180" : ""}`}
    />
  </button>
  <div
    {...menu.menuProps}
    class={`absolute right-0 bg-(--theme-card-bg) text-(--theme-card-fg) shadow rounded-lg w-40 p-2 z-20 transition-[opacity,translate,scale] duration-300 ease-out origin-top ${menu.open() ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 -translate-y-5 pointer-events-none"}`}
  >
    <ul class="hoverlist" role="none">
      <For each={profileItems()}>
        {(item, i) => (
          <li role="none" classList={{ "bg-(--theme-highlight)": menu.activeIndex() === i() }}>
            <Show
              when={item.href}
              fallback={
                <button type="button" {...menu.getItemProps(i())}>
                  {item.label}
                </button>
              }
            >
              {(href) => (
                <a href={href()} {...menu.getItemProps(i())}>
                  {item.label}
                </a>
              )}
            </Show>
          </li>
        )}
      </For>
    </ul>
  </div>
</div>;
```

> `menu.menuProps` provides `id`, `role`, `tabIndex`, `aria-label`, `inert`, `aria-hidden`, `aria-activedescendant`, `ref`, and `onKeyDown` — so the panel keeps its `inert` gate and gains the menu semantics. Do **not** add a separate `inert={...}`; it comes from the spread.
>
> `role="none"` on the `<ul>` and each `<li>` removes the list semantics, so each `menuitem` is owned directly by the `menu` (a `list` / `listitem` in between breaks the ARIA ownership chain).
>
> The highlight goes on the `<li>`, the element `.hoverlist > *` already styles (rounded corners + hover background, `src/app.css`). Keep `transition-[opacity,translate,scale]` as is — `transform` would not animate Tailwind v4's individual `translate` / `scale` properties.

### [ ] Step 2.5: Update the existing role queries — then verify the tests PASS

**File:** `src/components/Nav.test.tsx` — the `describe("profile avatar")` block.

The menu items now carry `role="menuitem"`, which replaces the implicit `button` / `link` roles. That is the intended change of this refactor, so these queries change — and **only** these:

```tsx
// before — "offers My Profile + Log In → /fullstack when logged out"
expect(screen.getByRole("button", { name: /my profile/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/fullstack");
expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();

// after
expect(screen.getByRole("menuitem", { name: /my profile/i })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: /log in/i })).toHaveAttribute("href", "/fullstack");
expect(screen.queryByRole("menuitem", { name: /log out/i })).not.toBeInTheDocument();
```

```tsx
// before — "swaps Log In for Log Out once authenticated"
expect(await screen.findByRole("button", { name: /log out/i })).toBeInTheDocument();
expect(screen.queryByRole("link", { name: /log in/i })).not.toBeInTheDocument();

// after
expect(await screen.findByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
expect(screen.queryByRole("menuitem", { name: /log in/i })).not.toBeInTheDocument();
```

Run: `vpr test:comp -t "Nav"`
Expected: PASS. The `profile dropdown` and `mobile mode` tests key off `#profile-menu`, its `inert` property, and its `pointer-events-none` / `opacity-100` classes — all preserved, so they need no edit. If any other test fails, fix the refactor before continuing — do not edit an assertion to match a regression.

### [ ] Step 2.6: Add integration tests for the menu

**File:** `src/components/Nav.test.tsx` — add inside the `describe("profile dropdown")` block, after the existing test:

```tsx
it("trigger and panel expose menu-button semantics", () => {
  renderNav();
  const trigger = screen.getByRole("button", { name: /profile menu/i });
  expect(trigger).toHaveAttribute("aria-haspopup", "true");
  expect(trigger).toHaveAttribute("aria-controls", "profile-menu");
  const panel = document.getElementById("profile-menu")!;
  expect(panel).toHaveAttribute("role", "menu");
});

it("ArrowDown on the trigger opens the menu and activates the first item", async () => {
  const user = userEvent.setup();
  renderNav();
  const trigger = screen.getByRole("button", { name: /profile menu/i });
  const panel = document.getElementById("profile-menu")!;
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(panel).toHaveAttribute("aria-hidden", "false");
  expect(panel).toHaveAttribute("aria-activedescendant", "profile-menu-profile");
});

it("Enter on the Log In item clicks its link and closes the menu", async () => {
  const user = userEvent.setup();
  renderNav();
  const trigger = screen.getByRole("button", { name: /profile menu/i });
  const panel = document.getElementById("profile-menu")!;
  trigger.focus();
  await user.keyboard("{ArrowDown}{ArrowDown}"); // open on My Profile, move to Log In
  expect(panel).toHaveAttribute("aria-activedescendant", "profile-menu-login");

  const link = screen.getByRole("menuitem", { name: /log in/i });
  const onLinkClick = vi.fn((e: MouseEvent) => e.preventDefault()); // no jsdom navigation
  link.addEventListener("click", onLinkClick);
  await user.keyboard("{Enter}");

  expect(onLinkClick).toHaveBeenCalledOnce();
  expect(panel).toHaveAttribute("aria-hidden", "true");
});

it("Escape closes the menu and returns focus to the trigger", async () => {
  const user = userEvent.setup();
  renderNav();
  const trigger = screen.getByRole("button", { name: /profile menu/i });
  const panel = document.getElementById("profile-menu")!;
  await user.click(trigger);
  expect(panel).toHaveAttribute("aria-hidden", "false");
  await user.keyboard("{Escape}");
  expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(trigger).toHaveFocus();
});
```

> `Nav.test.tsx` already imports `vi`, `screen`, and `userEvent`, and defines `renderNav`; no new imports are required. The `beforeEach` sets desktop `matchMedia`, which these tests use.

### [ ] Step 2.7: Run the Nav tests — verify they PASS

Run: `vpr test:comp -t "Nav"`
Expected: PASS — the existing tests (with the Step 2.5 role queries) plus the four new ones.

### [ ] Step 2.8: Lint / format / type-check

Run: `vpr check`
Expected: no errors. Confirm `dropdownRef` and `dropdown` are gone (the linter flags them as unused if any reference was missed).

### [ ] Step 2.9: Commit

```bash
git add src/components/Nav.tsx src/components/Nav.test.tsx
git commit -m "refactor(Nav): drive profile menu with useMenu hook"
```

---

## Phase 3: Full verification

### [ ] Step 3.1: Run the whole suite + type-check + build

```bash
vpr check:type   # tsc --noEmit, no errors
vpr test:unit    # includes useMenu
vpr test:comp    # includes Nav
vpr build        # production build succeeds
```

Expected: all green, no warnings.

### [ ] Step 3.2: Update review/backlog bookkeeping

- In `planning/archive/Backlog.md`, mark item 14 done (or delete it), and close GitHub issue #14.
- The 30th-cycle review Issues 1 and 2 need no update — `useDisclosure` resolved them before this plan ran.

---

## Self-review (completed against the spec)

- **Spec coverage:** data-array-driven hook (Phase 1.3), adds menu semantics via `role="menu"`/`menuitem` (Phase 2.4/2.6) — review Issues 1 and 2 were already resolved by `useDisclosure`, composes `useDismiss` (Phase 1.3), aria-activedescendant model (Phase 1.3). ✓
- **Placeholder scan:** no TBD/TODO; every code step shows complete code. ✓
- **Type consistency:** `useMenu` returns `{ open, activeIndex, rootRef, triggerProps, menuProps, getItemProps }`; the Nav consumer (2.3/2.4) uses `open`, `activeIndex`, `rootRef`, `triggerProps`, `menuProps`, and `getItemProps`; `MenuItem` shape `{ id, label, onSelect }` is consistent across the hook, tests, and Nav's `ProfileMenuItem` entries. ✓
- **Known caveat:** the hook was designed against the Solid 1.9.12 runtime (spread `ref`/`inert`/getters verified) but not executed — Phase 1.4 and Phase 2.7 are the gates. If jsdom focus assertions in the hook's "focus management" tests prove flaky, keep the state-machine tests and rely on the Nav integration tests for focus.

## Execution handoff

Two ways to run this:

1. **Subagent-driven (recommended)** — fresh subagent per task, review between tasks (`superpowers:subagent-driven-development`).
2. **Inline** — execute here with checkpoints (`superpowers:executing-plans`).
