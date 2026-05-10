# Jedi Page Conversion Plan: Alpine.js HTML to SolidStart

## Overview

Convert the Jedi Project (Alpine.js + TailwindCSS v3.2.7) to `src/routes/jedi.tsx` (SolidStart v1.3.2 + TailwindCSS v4.2.2) with component extraction. Replace the existing `jedi.tsx` placeholder.

## Source Analysis Summary

### Alpine.js State Management (to be converted)

1. **Header mobile navigation**: `x-data="{ mobilenavOpen: false }"` with toggle
2. **Header dropdown**: `x-data="{ dropdownOpen: false }"` with click-away handling
3. **Sidebar mobile toggle**: `x-data="{ mobileSidebarOpen: false }"` with toggle
4. **Alpine.js transitions**: `x-transition:enter` animations

### TailwindCSS v3 → v4 Key Changes

1. **Arbitrary values**: `[&>*]:px-8` → standard v4 utilities or custom classes
2. **Important modifiers**: `md:!block` → `md:block!`
3. **Color opacity**: `bg-opacity-40` → `bg-gray-800/40`
4. **Custom properties**: `text-(--theme-accent)` pattern already used in **Target Project**
5. **Font family**: Google Fonts 'Lobster' integration required

### Visual Features to Preserve

- Sticky header with z-50
- Hero with background image overlay
- Card-based layout with shadows and rounded corners
- Responsive grid: mobile (full-width) → desktop (2-col main + 1-col sidebar)
- Hover states on all interactive elements
- Mobile-first breakpoints (md:768px)
- The completed **Target Project** `/jedi` page must match **Jedi Project** `Awesome.png`

### Visual Features to Create

- Dark/light/System mode toggle
- Keyboard navigation:
  - Tab stops on all actionable elements
  - Tab selects "Categories" when in small-screen mode
- Selected item in "Categories" list must have `--theme-highlight` class applied

### Alpine.js → SolidJS Mapping

| Alpine.js         | SolidJS                             |
| ----------------- | ----------------------------------- |
| `x-data`          | `createSignal(false)`               |
| `x-show`          | `<Show when={...}>`                 |
| `x-cloak`         | Not needed                          |
| `@click`          | `onClick={...}`                     |
| `x-bind:class`    | Template literal in `class` attr    |
| `x-transition`    | TailwindCSS v4 transition utilities |
| `[&>*]` selectors | `space-y-*` or scoped component CSS |

---

## [ ] Phase 1: CSS Foundation Setup (Claude)

### [√] Step 1.1: Update `src/app.css` — Layer Scoping, Custom Properties, Animation

**File**: `src/app.css`

**Action**:

1. Wrap existing global element rules in `@layer base` so Tailwind utility classes on Jedi components override them.
2. Add Jedi custom properties (`--theme-btn-primary`, `--theme-btn-primary-hover`) to `:root`.
3. Add `fadeIn` animation + `.animate-fade-in` utility.

> **Why `@layer base`**: Global `main {}`, `h1 {}`, etc. rules in unlayered CSS have higher precedence than Tailwind utility classes (which live in `@layer utilities`). Wrapping in `@layer base` lets utility classes on Jedi components override these defaults without needing `!important`.

**Before** (existing `src/app.css`):

```css
@import "tailwindcss";

@theme {
  --font-hero: "Lobster", sans-serif;
}

:root {
  --theme-accent: --color-sky-700;
  --theme-highlight: --color-indigo-100;
  --theme-btn-primary: rgb(88, 40, 244);
  --theme-btn-primary-hover: rgb(69, 29, 200);
  --theme-background: --color-zinc-200;
  --theme-foreground: --color-zinc-800;
  --theme-hover-bg: --color-gray-200;
  --theme-card-fg: --color-gray-700;
  --theme-card-bg: --color-zinc-200;
}

:root[data-theme="dark"] {
  --theme-background: --color-zinc-800;
  --theme-foreground: --color-zinc-300;
  --theme-hover-bg: --color-gray-700;
  --theme-card-fg: --color-zinc-200;
  --theme-card-bg: --color-gray-700;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --theme-background: --color-zinc-800;
    --theme-foreground: --color-zinc-300;
    --theme-hover-bg: --color-gray-700;
    --theme-card-fg: --color-zinc-200;
    --theme-card-bg: --color-gray-700;
  }
}

body {
  background: var(--theme-background);
  color: var(--theme-foreground);
}

.demo main {
  @apply mx-auto p-4 text-center text-xl text-(--theme-foreground);
}

.demo h1 {
  @apply mx-6 my-16 text-6xl font-thin text-(--theme-accent) uppercase;
}

.demo h2 {
  @apply ml-8 text-left text-2xl font-thin text-(--theme-accent) uppercase;
}

.demo p {
  @apply mx-8 mb-6 text-justify;
}
```

**After**:

```css
@import "tailwindcss";

@theme {
  --font-hero: "Lobster", sans-serif;
}

@layer base {
  :root {
    --theme-accent: --color-sky-700;
    --theme-highlight: --color-indigo-100;
    --theme-btn-primary: rgb(88, 40, 244);
    --theme-btn-primary-hover: rgb(69, 29, 200);
    --theme-background: --color-zinc-200;
    --theme-foreground: --color-zinc-800;
    --theme-hover-bg: --color-gray-200;
    --theme-card-fg: --color-gray-700;
    --theme-card-bg: --color-zinc-200;
  }

  :root[data-theme="dark"] {
    --theme-background: --color-zinc-800;
    --theme-foreground: --color-zinc-300;
    --theme-hover-bg: --color-gray-700;
    --theme-card-fg: --color-zinc-200;
    --theme-card-bg: --color-gray-700;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --theme-background: --color-zinc-800;
      --theme-foreground: --color-zinc-300;
      --theme-hover-bg: --color-gray-700;
      --theme-card-fg: --color-zinc-200;
      --theme-card-bg: --color-gray-700;
    }
  }

  body {
    background: var(--theme-background);
    color: var(--theme-foreground);
  }

  .demo main {
    @apply mx-auto p-4 text-center text-xl text-(--theme-foreground);
  }

  .demo h1 {
    @apply mx-6 my-16 text-6xl font-thin text-(--theme-accent) uppercase;
  }

  .demo h2 {
    @apply ml-8 text-left text-2xl font-thin text-(--theme-accent) uppercase;
  }

  .demo p {
    @apply mx-8 mb-6 text-justify;
  }
}

@layer utilities {
  .animate-fade-in {
    animation: 1s fadeIn;
  }
}

@keyframes fadeIn {
  0%,
  10% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
```

**Verification**: `vpr check` passes. Existing pages (Home, About, etc.) render unchanged.

---

### [ ] Step 1.2: Install and Import Lobster Font

```zsh
vp i @fontsource/lobster
```

**File**: `src/routes/jedi.tsx` (not `app.tsx` — Lobster only used on Jedi page)

```tsx
import "@fontsource/lobster";
```

**Verification**: `vpr dev` → http://localhost:3000/jedi renders; DevTools shows Lobster font loaded.

---

### [ ] Step 1.3: Create Jedi Route CSS File

**File**: `src/routes/jedi.css`

**Action**: Create route-specific CSS for descendant-selector patterns that can't be expressed as Tailwind utilities. Import in `jedi.tsx`.

```css
/* Jedi page — descendant-selector patterns from source style.css */

.navitems > li > a {
  @apply flex h-12 items-center gap-2 rounded-lg px-4;
}

.navitems > li > a:hover {
  @apply bg-(--theme-card-fg);
}

.hoverlist > * {
  @apply rounded-md transition-colors duration-150;
}

.hoverlist > *:hover {
  @apply bg-(--theme-hover-bg);
}

.hoverlist > * > a {
  @apply flex items-center p-2;
}
```

**Import** in `src/routes/jedi.tsx`:

```tsx
import "./jedi.css";
```

**Verification**: `vpr check` passes.

---

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase 1 complete - <summary>` summarizing the changes in this phase.
- Stop.

---

## [ ] Phase 2: Component Development (Claude)

1. Each component ships with its tests.
2. Tests must pass before the step is marked complete.

### [ ] Step 2.1: Create Hero Component + Tests

**File**: `src/components/Hero.tsx`

**Source**: `<hero>` section from **Jedi Project** `index.html`.

**Props**:

```typescript
interface HeroProps {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  backgroundImage: string;
}
```

**Component**:

```tsx
export default function Hero(props: HeroProps) {
  return (
    <section
      class="grid bg-gray-700 text-white text-center bg-cover relative"
      style={{ "background-image": `url('${props.backgroundImage}')` }}
    >
      <div class="col-start-1 row-start-1 bg-gray-800/40 w-full h-full" />
      <div class="col-start-1 row-start-1 py-24 px-10">
        <h1 class="text-6xl font-bold mb-4 text-white animate-fade-in font-hero">{props.title}</h1>
        <p class="text-lg font-bold mb-5">{props.subtitle}</p>
        <a
          class="inline-flex items-center justify-center px-4 min-h-13 font-semibold rounded-lg text-white transition-transform active:scale-95 bg-(--theme-btn-primary) hover:bg-(--theme-btn-primary-hover) shadow-sm"
          href={props.ctaHref}
        >
          {props.ctaText}
        </a>
      </div>
    </section>
  );
}
```

> **Note**: `style={{ "background-image": ... }}` remains — dynamic prop URL can't use Tailwind `bg-[url(...)]`. This is the sole exception to requirement #4.

**Test**: `src/components/Hero.test.tsx`

```typescript
import { describe, it, expect } from "vite-plus/test"
import { render, screen } from '@solidjs/testing-library'
import Hero from './Hero'

describe('<Hero />', () => {
  it('renders with all props', () => {
    render(() => (
      <Hero title="Test Title" subtitle="Test Subtitle" ctaText="Click Me" ctaHref="/test" backgroundImage="test.jpg" />
    ))
    expect(screen.getByRole('heading')).toHaveTextContent('Test Title')
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /click me/i })).toHaveAttribute('href', '/test')
  })

  it('applies background image style', () => {
    const { container } = render(() => (
      <Hero title="T" subtitle="T" ctaText="T" ctaHref="#" backgroundImage="test-bg.jpg" />
    ))
    expect(container.querySelector('section')).toHaveStyle({ backgroundImage: "url('test-bg.jpg')" })
  })
})
```

**Verification**: `vpr test:comp -t "Hero"` — Hero tests pass.

---

### [ ] Step 2.2: Create Image Component + Tests

**File**: `src/components/Image.tsx`

**Source**: **Jedi Project** `index.html <article><figure>` section.

**Props**:

```typescript
interface ImageProps {
  src: string;
  alt: string;
  href?: string;
  class?: string;
}
```

**Component**:

```tsx
export default function Image(props: ImageProps) {
  return (
    <figure class={props.class}>
      {props.href ? (
        <a href={props.href}>
          <img class="w-full" src={props.src} alt={props.alt} />
        </a>
      ) : (
        <img class="w-full" src={props.src} alt={props.alt} />
      )}
    </figure>
  );
}
```

**Test**: `src/components/Image.test.tsx`

```typescript
import { describe, it, expect } from "vite-plus/test"
import { render, screen } from '@solidjs/testing-library'
import Image from './Image'

describe('<Image />', () => {
  it('renders image with src and alt', () => {
    render(() => <Image src="test.jpg" alt="Test Image" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'test.jpg')
    expect(img).toHaveAttribute('alt', 'Test Image')
  })

  it('wraps in link when href provided', () => {
    render(() => <Image src="test.jpg" alt="Test" href="/test" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/test')
  })

  it('does not wrap in link when href omitted', () => {
    const { container } = render(() => <Image src="test.jpg" alt="Test" />)
    expect(container.querySelector('a')).toBeNull()
  })
})
```

**Verification**: `vpr test:comp -t "Image"` — Image tests pass.

---

### [ ] Step 2.3: Create Author Component + Tests

**File**: `src/components/Author.tsx`

**Source**: **Jedi Project** `index.html <article><div>` author avatar/name section.

**Props**:

```typescript
interface AuthorProps {
  avatarSrc: string;
  name: string;
  href?: string;
}
```

**Component**:

```tsx
export default function Author(props: AuthorProps) {
  return (
    <a class="flex items-center gap-1 mb-4" href={props.href || "#"}>
      <img class="w-8 h-8 rounded-full" src={props.avatarSrc} alt={props.name} />
      <span class="font-bold hover:underline">{props.name}</span>
    </a>
  );
}
```

**Test**: `src/components/Author.test.tsx`

```typescript
import { describe, it, expect } from "vite-plus/test"
import { render, screen } from '@solidjs/testing-library'
import Author from './Author'

describe('<Author />', () => {
  it('renders avatar and name', () => {
    render(() => <Author avatarSrc="avatar.jpg" name="Test Author" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'avatar.jpg')
    expect(screen.getByText('Test Author')).toBeInTheDocument()
  })

  it('uses custom href when provided', () => {
    render(() => <Author avatarSrc="avatar.jpg" name="Test" href="/author" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/author')
  })

  it('defaults to # when href not provided', () => {
    render(() => <Author avatarSrc="avatar.jpg" name="Test" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '#')
  })
})
```

**Verification**: `vpr test:comp -t "Author"` — Author tests pass.

---

### [ ] Step 2.4: Create Card Component + Tests

**File**: `src/components/Card.tsx`

**Source**: **Jedi Project** `index.html <aside><section class="card">` sidebar sections.

**Props**:

```typescript
interface CardProps {
  title?: string;
  children: JSX.Element;
  class?: string;
}
```

**Component**:

```tsx
import { splitProps } from "solid-js";
import type { JSX } from "solid-js";

export default function Card(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "title", "children"]);

  return (
    <section
      class={`flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 pb-4 bg-(--theme-card-bg) text-(--theme-card-fg)${local.class ? ` ${local.class}` : ""}`}
      {...rest}
    >
      {local.title && (
        <h2 class="text-2xl font-bold px-4 pt-4 pb-2 text-(--theme-card-fg)">{local.title}</h2>
      )}
      <div class="p-4 pt-0">{local.children}</div>
    </section>
  );
}
```

**Test**: `src/components/Card.test.tsx`

```typescript
import { describe, it, expect } from "vite-plus/test"
import { render, screen } from '@solidjs/testing-library'
import Card from './Card'

describe('<Card />', () => {
  it('renders children', () => {
    render(() => <Card><div>Test Content</div></Card>)
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('shows title when provided', () => {
    render(() => <Card title="Test Title"><div>Content</div></Card>)
    expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument()
  })

  it('omits title when not provided', () => {
    const { container } = render(() => <Card><div>Content</div></Card>)
    expect(container.querySelector('h2')).toBeNull()
  })

  it('applies custom classes', () => {
    const { container } = render(() => <Card class="custom-class"><div>Content</div></Card>)
    expect(container.querySelector('section')).toHaveClass('custom-class')
  })
})
```

**Verification**: `vpr test:comp -t "Card"` — Card tests pass.

---

### [ ] Step 2.5: Create JediNav Component + Tests

**File**: `src/components/JediNav.tsx`

**Source**: **Jedi Project** `index.html` lines 37–118 (`<header>` element).

> The Jedi page shows **two** nav bars: the global `<Nav />` (rendered by `app.tsx`) and `<JediNav />` (the converted Jedi source header with hamburger menu, profile dropdown, and Alpine.js → SolidJS conversions).

**Alpine.js → SolidJS conversions in this component**:

| Source (Alpine.js)                                         | Target (SolidJS)                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `x-data="{ mobilenavOpen: false }"`                        | `const [mobileNavOpen, setMobileNavOpen] = createSignal(false)` |
| `x-data="{ dropdownOpen: false }"`                         | `const [dropdownOpen, setDropdownOpen] = createSignal(false)`   |
| `x-show="mobilenavOpen"` / `x-show="!mobilenavOpen"`       | `<Show when={mobileNavOpen()}>` with fallback                   |
| `@click="mobilenavOpen = !mobilenavOpen"`                  | `onClick={() => setMobileNavOpen(!mobileNavOpen())}`            |
| `@click.away="dropdownOpen = false"`                       | Click-outside handler via `document.addEventListener`           |
| `x-cloak`                                                  | Removed (not needed)                                            |
| `x-transition:enter="duration-300 ease-out"`               | Tailwind `transition-all duration-300 ease-out`                 |
| `x-bind:class="dropdownOpen && 'rotate-180 duration-300'"` | Template literal class                                          |
| `md:!block`                                                | `md:block!` (TailwindCSS v4 syntax)                             |
| `[&>*]:px-8`                                               | Direct `px-8` on each child element                             |

**TailwindCSS v3 → v4 conversions**:

- `[&>*]:px-8` → `px-8` applied directly to child divs
- `md:!block` → `md:block!`
- `[&>li>a]:justify-end` → direct `justify-end` class on each `<a>`

**Component**:

```tsx
import { createSignal, Show, onMount, onCleanup } from "solid-js";

export default function JediNav() {
  const [mobileNavOpen, setMobileNavOpen] = createSignal(false);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  let dropdownRef: HTMLLIElement | undefined;

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    onCleanup(() => document.removeEventListener("click", handleClickOutside));
  });

  return (
    <header class="md:flex items-center justify-between bg-gray-800 h-20 text-white sticky top-0 z-50">
      <div class="flex items-center justify-between h-20 px-8">
        <a class="flex items-center gap-1" href="#">
          <img
            class="h-8 -mt-1"
            src="https://img.icons8.com/small/64/ffffff/fire-heart.png"
            alt=""
          />
          <span class="text-lg font-bold">Awesome</span>
        </a>
        <button
          type="button"
          class="md:hidden h-12 w-12 flex items-center justify-center cursor-pointer hover:bg-gray-700 rounded-lg"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen()}
          onClick={() => setMobileNavOpen(!mobileNavOpen())}
        >
          <Show
            when={!mobileNavOpen()}
            fallback={
              <img
                class="w-6 h-6 select-none"
                src="https://img.icons8.com/small/64/ffffff/delete-sign.png"
                alt=""
              />
            }
          >
            <img
              class="w-6 h-6 select-none"
              src="https://img.icons8.com/small/64/ffffff/menu.png"
              alt=""
            />
          </Show>
        </button>
      </div>
      <nav
        aria-hidden={!mobileNavOpen()}
        class={`bg-gray-800 h-screen w-screen md:h-auto md:w-auto -mt-20 md:mt-0 absolute md:relative -z-1 transition-all duration-300 ease-out md:block! ${mobileNavOpen() ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-96 pointer-events-none"}`}
      >
        <ul class="navitems flex items-center flex-col md:flex-row gap-8 md:gap-0 justify-center h-full -translate-y-10 md:translate-y-0 px-8">
          <li>
            <a href="#">Home</a>
          </li>
          <li>
            <a href="#">Create Post</a>
          </li>
          <li ref={dropdownRef} class="relative">
            <button
              type="button"
              class="flex items-center gap-2 cursor-pointer select-none"
              aria-label="Profile menu"
              aria-expanded={dropdownOpen()}
              onClick={() => setDropdownOpen(!dropdownOpen())}
            >
              <img
                class="h-8 rounded-full object-cover bg-teal-200"
                src="https://img.icons8.com/doodle/96/null/bart-simpson.png"
                alt="Bart avatar"
              />
              Bart
              <img
                class={`w-4 transition-transform duration-300 ${dropdownOpen() ? "rotate-180" : ""}`}
                src="https://img.icons8.com/small/32/777777/expand-arrow.png"
                alt=""
              />
            </button>
            <div
              aria-hidden={!dropdownOpen()}
              class={`absolute right-0 bg-(--theme-card-bg) text-(--theme-card-fg) shadow rounded-lg w-40 p-2 z-20 transition-all duration-300 ease-out origin-top ${dropdownOpen() ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 -translate-y-5 pointer-events-none"}`}
            >
              <ul class="hoverlist">
                <li>
                  <a class="justify-end" href="#">
                    My Profile
                  </a>
                </li>
                <li>
                  <a class="justify-end" href="#">
                    Log Out
                  </a>
                </li>
              </ul>
            </div>
          </li>
        </ul>
      </nav>
    </header>
  );
}
```

**Test**: `src/components/JediNav.test.tsx`

```typescript
import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import JediNav from "./JediNav";

describe("<JediNav />", () => {
  it("renders logo and brand name", () => {
    render(() => <JediNav />);
    expect(screen.getByText("Awesome")).toBeInTheDocument();
  });

  it("renders mobile toggle button", () => {
    render(() => <JediNav />);
    expect(screen.getByRole("button", { name: /toggle navigation/i })).toBeInTheDocument();
  });

  it("renders nav links", () => {
    render(() => <JediNav />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Create Post")).toBeInTheDocument();
  });

  it("renders profile dropdown trigger", () => {
    render(() => <JediNav />);
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeInTheDocument();
    expect(screen.getByText("Bart")).toBeInTheDocument();
  });

  it("toggles dropdown on profile button click", async () => {
    const user = userEvent.setup();
    render(() => <JediNav />);
    const trigger = screen.getByRole("button", { name: /profile menu/i });
    await user.click(trigger);
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    expect(screen.getByText("Log Out")).toBeInTheDocument();
  });
});
```

**Verification**: `vpr test:comp -t "JediNav"`

---

**Phase Complete**:

**Verification**: `vpr test:comp` — all component tests pass.

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase 2 complete - <summary>` summarizing the changes in this phase.
- Stop.

---

## [ ] Phase 3: Create Jedi Route Page with Metadata

**File**: `src/routes/jedi.tsx`

**Requirements**:

1. Import components: `JediNav`, `Hero`, `Image`, `Author`, `Card`. Do **NOT** import `Nav` — it is already rendered globally by `app.tsx`.
2. Place `<JediNav />` above `<Hero />`. The page shows two nav bars: global `<Nav />` (from `app.tsx`) + Jedi-specific `<JediNav />` (converted Jedi source header).
3. Import `@fontsource/lobster` and `./jedi.css` in this file (set up in Phase 1).
4. Convert to Tailwind v4 `class=...` syntax. Avoid `style=...` except where dynamic prop values require it (e.g., Hero background-image URL).
5. Convert to Tailwind v4 `[&>a:hover]:underline` → `hover:underline`.
6. Implement mobile sidebar toggle with `createSignal`.
7. Convert Alpine.js `x-show` → `<Show>`, transitions → TailwindCSS v4 utilities.
8. Responsive grid: mobile stacked → desktop 2-col main + 1-col sidebar.
9. Include `<Title>` and `<Meta description>` from `@solidjs/meta`.
10. **Accessibility baseline** (include from the start, not as a later fix):

- Mobile toggle uses `<button type="button">` (not `<a>`).
- Mobile toggle has `aria-label="Toggle sidebar"` and `aria-expanded={mobileSidebarOpen()}`.
- Decorative icons use `alt=""`; content images use meaningful alt.
- All interactive elements: `focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none`.
- Category list items: `tabIndex={0}`, `role="option"`, `aria-selected`, `onKeyDown` (Enter/Space selects item, updates `selectedCategory` signal and highlight).
- Category `<ul>`: `role="listbox"` with `aria-label="Categories"`.
- Mobile sidebar: Escape key dismisses when open (handler on toggle button + `<aside>`).

11. **Performance**: Declare `categories`, `topPhotos`, `topCaptions` as constants **outside** the component.

**Component structure (outline)**:

```tsx
import "@fontsource/lobster";
import "./jedi.css";
import { Title, Meta } from "@solidjs/meta";
import { createSignal, For, onMount, onCleanup } from "solid-js";
import Hero from "~/components/Hero";
import JediNav from "~/components/JediNav";
import Image from "~/components/Image";
import Author from "~/components/Author";
import Card from "~/components/Card";

const CATEGORIES = [
  { name: "Landscape", icon: "https://img.icons8.com/small/96/null/landscape.png" },
  { name: "People", icon: "https://img.icons8.com/small/96/null/portrait.png" },
  { name: "Animals", icon: "https://img.icons8.com/small/96/null/dog.png" },
  { name: "Abstract", icon: "https://img.icons8.com/small/96/null/collage.png" },
  { name: "Black & White", icon: "https://img.icons8.com/small/96/null/180-degrees.png" },
];

const TOP_PHOTOS = [
  {
    src: "https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg",
    alt: "Top photo",
    avatar: "https://img.icons8.com/small/96/A9A9A9/happy.png",
    author: "Lisa",
    likes: 5,
  },
  {
    src: "https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg",
    alt: "Top photo",
    avatar: "https://img.icons8.com/small/96/A9A9A9/happy.png",
    author: "Homer",
    likes: 4,
  },
];

const TOP_CAPTIONS = [
  { avatar: "https://img.icons8.com/small/96/A9A9A9/happy.png", author: "Lisa", likes: 8 },
  { avatar: "https://img.icons8.com/small/96/A9A9A9/happy.png", author: "Bart", likes: 5 },
];

export default function Jedi() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false);
  const [selectedCategory, setSelectedCategory] = createSignal(0);
  const mql = typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)") : null;
  const [isMobile, setIsMobile] = createSignal(mql?.matches ?? false);
  onMount(() => {
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    onCleanup(() => mql.removeEventListener("change", handler));
  });

  return (
    <>
      <Title>Little Jedi - Awesome Photos & Captions</Title>
      <Meta
        name="description"
        content="Share your favorite Photos from Flickr and add a great caption"
      />
      <JediNav />

      <Hero
        title="Awesome Photos & Captions"
        subtitle="Share your favorite Photos from Flickr and add a great caption"
        ctaText="Get Started"
        ctaHref="#"
        backgroundImage="https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg"
      />

      <div class="grid grid-cols-3 max-w-7xl mx-auto mt-6">
        {/* Mobile sidebar toggle */}
        <div class="md:hidden col-span-full mx-auto mb-6 relative z-10">
          <button
            type="button"
            aria-label="Toggle sidebar"
            aria-expanded={mobileSidebarOpen()}
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen())}
            onKeyDown={(e) => {
              if (e.key === "Escape" && mobileSidebarOpen()) setMobileSidebarOpen(false);
            }}
            class="flex items-center font-bold hover:bg-gray-200 rounded-lg p-3 focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none"
          >
            <span>Categories</span>
            <img
              class={`w-4 ml-1.5 transition-transform ${mobileSidebarOpen() ? "rotate-180" : ""}`}
              src="https://img.icons8.com/small/32/000000/expand-arrow.png"
              alt=""
            />
          </button>
        </div>

        {/* Main article */}
        <main class="col-span-full md:col-span-2 mx-[5%] md:mx-[10%] order-2 md:order-1">
          <article class="flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 pb-4 bg-(--theme-card-bg) text-(--theme-card-fg)">
            {/* Title bar */}
            <div class="flex items-center justify-between px-4 h-14">
              <h3 class="text-lg font-bold w-1/2 truncate">Little Jedi</h3>
              <div class="text-sm text-gray-500">
                flickr @{" "}
                <a
                  href="#"
                  class="hover:underline focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none rounded"
                  target="_blank"
                  rel="noreferrer"
                >
                  John Doe
                </a>
              </div>
            </div>
            {/* Image */}
            <Image
              src="https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg"
              alt="Little Jedi cat"
              href="#"
            />
            {/* Body: author, caption, tags, actions */}
            <div class="p-4 pb-2">
              <Author
                avatarSrc="https://img.icons8.com/small/96/A9A9A9/happy.png"
                name="Lisa"
                href="#"
              />
              <p class="text-5xl mb-10 px-4 font-hero">Jedi Kitty protects the street</p>
              <div class="flex items-center gap-2 text-sm mb-5">
                <a
                  class="bg-gray-200 rounded-full px-3 py-1 hover:bg-gray-500 hover:text-white focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none"
                  href="#"
                >
                  Animals
                </a>
                <a
                  class="bg-gray-200 rounded-full px-3 py-1 hover:bg-gray-500 hover:text-white focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none"
                  href="#"
                >
                  Cute
                </a>
              </div>
              <div class="flex items-center justify-between text-sm px-2">
                <a
                  class="font-bold hover:underline focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none rounded"
                  href="#"
                >
                  Comments
                  <span class="font-light text-gray-500 ml-2">3</span>
                </a>
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-1">
                    <img
                      class="w-5 -mt-1"
                      src="https://img.icons8.com/small/24/000000/fire-heart.png"
                      alt=""
                    />
                    1
                  </div>
                  <a
                    class="hover:underline focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none rounded"
                    href="#"
                  >
                    Like
                  </a>
                  <a
                    class="hover:underline focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none rounded"
                    href="#"
                  >
                    Edit
                  </a>
                  <a
                    class="hover:underline focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none rounded"
                    href="#"
                  >
                    Delete
                  </a>
                </div>
              </div>
            </div>
          </article>
        </main>

        {/* Sidebar */}
        <aside
          aria-hidden={isMobile() && !mobileSidebarOpen()}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mobileSidebarOpen()) setMobileSidebarOpen(false);
          }}
          class={`col-span-full md:col-span-1 mx-[5%] md:mr-[20%] order-1 md:order-2 transition-all duration-300 ease-out md:opacity-100 md:max-h-none md:block! ${mobileSidebarOpen() ? "opacity-100 max-h-screen" : "opacity-0 max-h-0 overflow-hidden md:overflow-visible"}`}
        >
          <Card title="Categories">
            <ul class="space-y-1" role="listbox" aria-label="Categories">
              <For each={CATEGORIES}>
                {(c, index) => (
                  <li
                    role="option"
                    aria-selected={selectedCategory() === index()}
                    tabIndex={0}
                    classList={{ "bg-(--theme-highlight)": selectedCategory() === index() }}
                    onClick={() => setSelectedCategory(index())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedCategory(index());
                      }
                    }}
                    class="flex items-center cursor-pointer px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none"
                  >
                    <img class="w-8 h-8 object-cover mr-2" src={c.icon} alt="" />
                    <span class="font-bold text-sm">{c.name}</span>
                  </li>
                )}
              </For>
            </ul>
          </Card>
          <Card title="Top Photos">
            <ul class="space-y-1">
              <For each={TOP_PHOTOS}>
                {(p) => (
                  <li class="rounded-md transition-colors duration-150">
                    <a
                      href="#"
                      class="flex items-center p-2 rounded hover:bg-(--theme-hover-bg) focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none"
                    >
                      <img class="w-10 h-10 rounded-lg object-cover mr-3" src={p.src} alt={p.alt} />
                      <img class="w-6 h-6 rounded-full object-cover mr-0.5" src={p.avatar} alt="" />
                      <span class="font-bold text-sm mr-1">{p.author}</span>
                      <span class="text-sm font-light text-gray-500">({p.likes} Likes)</span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Card>
          <Card title="Top Captions">
            <ul class="space-y-1">
              <For each={TOP_CAPTIONS}>
                {(c) => (
                  <li class="rounded-md transition-colors duration-150">
                    <a
                      href="#"
                      class="flex items-center p-2 rounded hover:bg-(--theme-hover-bg) focus-visible:ring-2 focus-visible:ring-(--theme-accent) focus-visible:outline-none"
                    >
                      <img class="w-8 h-8 rounded-full object-cover mr-1" src={c.avatar} alt="" />
                      <span class="font-bold text-sm mr-1">{c.author}</span>
                      <span class="text-sm font-light text-gray-500">({c.likes} Likes)</span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
```

**Verification**: `vpr dev` → http://localhost:3000/jedi renders without console errors.

---

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase 3 complete - <summary>` summarizing the changes in this phase.
- Stop.

---

## [ ] Phase 4: Create Dark/Light/System Theme Toggle

**Requirements**

1. Create a three-state theme toggle (light / dark / auto) with FOUC prevention.
2. The implementation is adapted from **Tanstack Project** `src/components/ThemeToggle.tsx` and `src/routes/__root.tsx`.

### [√] Step 4.1: Update `src/app.css` with Dark Mode CSS Variable Support

**File**: `src/app.css`

**Action**: Add a `:root[data-theme="dark"]` block for explicit dark mode, and modify the existing `@media (prefers-color-scheme: dark)` selector to `:root:not([data-theme="light"])` so system-auto dark preference works but is overridden when the user explicitly selects light.

**Reference**: This pattern is taken from **Tanstack Project** `src/styles.css` lines 30–73, where `:root[data-theme="dark"]` handles explicit dark and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` handles system-auto dark.

> **Note**: This step is a no-op relative to Step 1.1 — the `:root[data-theme="dark"]` block and empty `@media (prefers-color-scheme: dark)` selector were already established in Step 1.1's "After" CSS. The "After" below confirms the expected state.

**After** (`:root[data-theme="dark"]` block and media query selector already in place from Step 1.1):

```css
@layer base {
  :root {
    /* ...existing vars + Jedi custom properties from Step 1.1... */
  }

  :root[data-theme="dark"] {
    --theme-background: --color-zinc-800;
    --theme-foreground: --color-zinc-300;
    --theme-hover-bg: --color-gray-700;
    --theme-card-fg: --color-zinc-200;
    --theme-card-bg: --color-gray-700;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --theme-background: --color-zinc-800;
      --theme-foreground: --color-zinc-300;
      --theme-hover-bg: --color-gray-700;
      --theme-card-fg: --color-zinc-200;
      --theme-card-bg: --color-gray-700;
    }
  }
  /* ...body, main, h1, h2, p rules unchanged... */
}
```

**Verification**: `vpr check` passes.

---

### [ ] Step 4.2: Add Theme Init Script to `src/entry-server.tsx`

**File**: `src/entry-server.tsx`

**Action**:

1. Add an inline `<script>` in the `<head>` to apply the stored theme before first paint, preventing a flash of unstyled content (FOUC).
2. This is a global change — the toggle affects the site-wide `--theme-*` CSS variables.

**Reference**: Adapted from **Tanstack Project** `src/routes/__root.tsx` line 16 (`THEME_INIT_SCRIPT`) and line 34 (`<script innerHTML={THEME_INIT_SCRIPT} />`).

**Before** (existing `src/entry-server.tsx`):

```tsx
export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
```

**After**:

```tsx
// TODO: `<script innerHTML={THEME_INIT_SCRIPT} />` represents a CSP violation. See https://grok.com/share/c2hhcmQtMi1jb3B5_1293335a-4a52-4211-ac87-87ee868c0dc3
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          <script innerHTML={THEME_INIT_SCRIPT} />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
```

**Verification**: `vpr check` passes. `vpr dev` → no console errors, no FOUC on page load.

---

### [ ] Step 4.3: Create ThemeToggle Component

**File**: `src/components/ThemeToggle.tsx`

**Reference**: Adapted from **Tanstack Project** `src/components/ThemeToggle.tsx`. Key changes from Tanstack version:

- SVG icons (sun / moon / monitor) instead of text labels
- Styling adapted to Target Project's Tailwind utilities (not Tanstack's `--chip-*` variables)
- Same toggle cycle and localStorage pattern

**Type + helpers** (outside component):

```typescript
type ThemeMode = "light" | "dark" | "auto";

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "auto";
}

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
  if (mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }
  document.documentElement.style.colorScheme = resolved;
}
```

**Component**:

```tsx
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";

export default function ThemeToggle() {
  const [mode, setMode] = createSignal<ThemeMode>("auto");

  onMount(() => {
    const initialMode = getInitialMode();
    setMode(initialMode);
    applyThemeMode(initialMode);
  });

  createEffect(() => {
    if (mode() !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("auto");
    media.addEventListener("change", onChange);
    onCleanup(() => media.removeEventListener("change", onChange));
  });

  function toggleMode() {
    const next: ThemeMode = mode() === "light" ? "dark" : mode() === "dark" ? "auto" : "light";
    setMode(next);
    applyThemeMode(next);
    window.localStorage.setItem("theme", next);
  }

  const label = () =>
    mode() === "auto"
      ? "Theme: system. Click for light."
      : mode() === "light"
        ? "Theme: light. Click for dark."
        : "Theme: dark. Click for system.";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label()}
      title={label()}
      class="rounded-lg p-2 transition hover:bg-(--theme-hover-bg)"
    >
      {/* Sun icon — shown when mode is "light" (current state) */}
      <svg
        class={mode() === "light" ? "block" : "hidden"}
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>

      {/* Moon icon — shown when mode is "dark" (current state) */}
      <svg
        class={mode() === "dark" ? "block" : "hidden"}
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>

      {/* Monitor icon — shown when mode is "auto" (current state = system) */}
      <svg
        class={mode() === "auto" ? "block" : "hidden"}
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    </button>
  );
}
```

**Icon semantics**: Each icon represents the **current** active mode:

```
| Current mode | Icon shown | Click advances to |
| ------------ | ---------- | ----------------- |
| Light        | Sun        | Dark              |
| Dark         | Moon       | Auto (system)     |
| Auto         | Monitor    | Light             |
```

**Toggle cycle**: `light → dark → auto → light` (matches **Tanstack Project** `ThemeToggle.tsx` line 44).

**Verification**: `vpr check` passes.

---

### [ ] Step 4.4: Create ThemeToggle Component Test

**File**: `src/components/ThemeToggle.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "./ThemeToggle";

describe("<ThemeToggle />", () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => mockLocalStorage[key] ?? null,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        mockLocalStorage[key] = value;
      },
    );

    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMatchMedia,
    });

    document.documentElement.classList.remove("light", "dark");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a toggle button", () => {
    render(() => <ThemeToggle />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("defaults to auto mode when no localStorage value", () => {
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("system");
  });

  it("reads initial mode from localStorage", () => {
    mockLocalStorage["theme"] = "dark";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("dark");
  });

  it("cycles light → dark → auto on clicks", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "light";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");

    expect(button.getAttribute("aria-label")).toContain("light");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toContain("dark");
    expect(mockLocalStorage["theme"]).toBe("dark");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toContain("system");
    expect(mockLocalStorage["theme"]).toBe("auto");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toContain("light");
    expect(mockLocalStorage["theme"]).toBe("light");
  });

  it("applies dark class to documentElement when mode is dark", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "light";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("removes data-theme attribute in auto mode", async () => {
    const user = userEvent.setup();
    mockLocalStorage["theme"] = "dark";
    render(() => <ThemeToggle />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
```

**Verification**: `vpr test:comp -t "ThemeToggle"` — ThemeToggle tests pass.

---

### [ ] Step 4.5: Integrate ThemeToggle into Global Nav

**File**: `src/components/Nav.tsx`

**Action**: Import `ThemeToggle` and place it at the right edge of the global `<Nav />` component. Theme toggle is a **global** feature (affects `--theme-*` CSS variables site-wide), so it belongs in the global nav — not the Jedi-specific header.

**Before** (existing `Nav.tsx`):

```tsx
import { useLocation } from "@solidjs/router";

export default function Nav() {
  const location = useLocation();
  const active = (path: string) =>
    path == location.pathname ? "border-sky-600" : "border-transparent hover:border-sky-600";
  return (
    <nav role="navigation" aria-label="Main" class="bg-sky-800">
      <ul class="container flex items-center p-3 text-gray-200">
        <li>
          <a class={`border-b-4 ${active("/")} mx-1.5 sm:mx-6`} href="/">
            Home
          </a>
        </li>
        {/* ...other links... */}
      </ul>
    </nav>
  );
}
```

**After**:

```tsx
import { useLocation } from "@solidjs/router";
import ThemeToggle from "~/components/ThemeToggle";

export default function Nav() {
  const location = useLocation();
  const active = (path: string) =>
    path == location.pathname ? "border-sky-600" : "border-transparent hover:border-sky-600";
  return (
    <nav role="navigation" aria-label="Main" class="bg-sky-800">
      <ul class="container flex items-center p-3 text-gray-200">
        <li>
          <a class={`border-b-4 ${active("/")} mx-1.5 sm:mx-6`} href="/">
            Home
          </a>
        </li>
        {/* ...other links... */}
        <li class="ml-auto">
          <ThemeToggle />
        </li>
      </ul>
    </nav>
  );
}
```

**Verification**: `vpr check` passes.

---

### [ ] Step 4.6: Update Global Nav test `Nav.test.tsx`

**File**: `src/components/Nav.test.tsx`

**Action**: Add tests for ThemeToggle integration. Existing tests use `MemoryRouter` + `createMemoryHistory` wrapper — new tests must follow the same pattern.

Add these tests to the existing `describe("<Nav />")` block:

```typescript
it("renders theme toggle button in nav", () => {
  renderWithRouter();
  expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
});

it("theme toggle cycles through modes on click", async () => {
  const user = userEvent.setup();
  renderWithRouter();
  const toggle = screen.getByRole("button", { name: /theme/i });

  expect(toggle.getAttribute("aria-label")).toContain("system");

  await user.click(toggle);
  expect(toggle.getAttribute("aria-label")).toContain("light");

  await user.click(toggle);
  expect(toggle.getAttribute("aria-label")).toContain("dark");

  await user.click(toggle);
  expect(toggle.getAttribute("aria-label")).toContain("system");
});
```

**Note**: Existing `Nav.test.tsx` imports must be updated to include `userEvent`:

```typescript
import userEvent from "@testing-library/user-event";
```

**Verification** `vpr test:comp -t "Nav"` — all tests pass.

---

**Phase Complete**:

**Verification**: `vpr test:comp` — all component tests pass.

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase 4 complete - <summary>` summarizing the changes in this phase.
- Stop.

---

## [ ] Phase 5: Write E2E Tests

**File**: `e2e/jedi.spec.ts` (file exists with existing tests. Keep existing footer tests, replace placeholder tests with new Jedi page tests, add theme toggle tests.)

**Existing tests preserved**: footer solidjs.com link, footer Home link, footer navigation, footer active indicator. These test global Footer behavior on the Jedi route and must not be dropped.

**Additional test for theme toggle feature**

- `vpr dev` → http://localhost:3000/jedi
- Background/foreground colors change with mode toggle
- No console errors

```typescript
import { test, expect } from "@playwright/test";

test.describe("Jedi Page", () => {
  test("should load successfully and display correct title", async ({ page }) => {
    await page.goto("/jedi");
    await expect(page).toHaveTitle(/Little Jedi/);
    await expect(page).toHaveURL("http://localhost:3000/jedi");
  });

  test("should display hero section with title and CTA", async ({ page }) => {
    await page.goto("/jedi");
    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { name: /awesome photos/i })).toBeVisible();
    await expect(hero.getByRole("link", { name: /get started/i })).toBeVisible();
  });

  test("should display main article with image and caption", async ({ page }) => {
    await page.goto("/jedi");
    const article = page.locator("article").first();
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { name: /little jedi/i })).toBeVisible();
    await expect(article.getByRole("img").first()).toBeVisible();
    await expect(article.getByText(/jedi kitty protects/i)).toBeVisible();
  });

  test("should display sidebar with categories on desktop", async ({ page }) => {
    await page.goto("/jedi");
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    await expect(aside.getByRole("heading", { name: /categories/i })).toBeVisible();
    await expect(aside.getByText("Landscape")).toBeVisible();
    await expect(aside.getByText("Animals")).toBeVisible();
  });

  test("should toggle mobile sidebar when button clicked", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    await expect(toggle).toBeVisible();
    const aside = page.locator("aside");
    await expect(aside).not.toBeVisible();
    await toggle.click();
    await expect(aside).toBeVisible();
  });

  test("should display all three sidebar cards", async ({ page }) => {
    await page.goto("/jedi");
    const aside = page.locator("aside");
    await expect(aside.getByRole("heading", { name: /categories/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top photos/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top captions/i })).toBeVisible();
  });

  test("should have working navigation in header", async ({ page }) => {
    await page.goto("/jedi");
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /home/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /about/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /readme/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /jedi/i })).toBeVisible();
  });

  test("should display author, tags, and post actions", async ({ page }) => {
    await page.goto("/jedi");
    const article = page.locator("article").first();
    await expect(article.getByRole("link").filter({ hasText: "Lisa" })).toBeVisible();
    await expect(article.getByRole("link", { name: /animals/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /cute/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /Comments/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /^Like$/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /Edit/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /Delete/i })).toBeVisible();
  });

  test("should have responsive layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/jedi");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).not.toBeVisible();
  });
});

test.describe("Jedi Page - Footer (preserved from existing tests)", () => {
  test("should have working external link to solidjs.com in footer", async ({ page }) => {
    await page.goto("/jedi");
    const solidjsLink = page.locator("footer").getByRole("link", { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute("href", "https://solidjs.com");
    await expect(solidjsLink).toHaveAttribute("target", "_blank");
  });

  test("should have navigation link to Home page in footer", async ({ page }) => {
    await page.goto("/jedi");
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("should navigate to Home page when clicking footer link", async ({ page }) => {
    await page.goto("/jedi");
    const homeLink = page.locator("footer").getByRole("link", { name: /^Home$/i });
    await homeLink.click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test("should display current page indicator in footer", async ({ page }) => {
    await page.goto("/jedi");
    const jediLink = page.locator("footer").getByRole("link", { name: /^Jedi$/i });
    await expect(jediLink).toBeVisible();
    await expect(jediLink).toHaveClass(/border-sky-600/);
  });
});

test.describe("Jedi Page - Theme Toggle", () => {
  test("should display theme toggle button", async ({ page }) => {
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /theme/i });
    await expect(toggle).toBeVisible();
  });

  test("should cycle through light → dark → auto modes", async ({ page }) => {
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /theme/i });

    // Start at auto (default), click to light
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /light/i);
    const htmlLight = page.locator("html");
    await expect(htmlLight).toHaveClass(/light/);
    await expect(htmlLight).toHaveAttribute("data-theme", "light");

    // Click to dark
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /dark/i);
    const htmlDark = page.locator("html");
    await expect(htmlDark).toHaveClass(/dark/);
    await expect(htmlDark).toHaveAttribute("data-theme", "dark");

    // Click to auto (system)
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /system/i);
    const htmlAuto = page.locator("html");
    expect(await htmlAuto.getAttribute("data-theme")).toBeNull();
  });

  test("should persist theme choice across page reload", async ({ page }) => {
    await page.goto("/jedi");
    const toggle = page.getByRole("button", { name: /theme/i });

    // Set to light explicitly: auto → light
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /light/i);

    // Verify localStorage was set
    const stored = await page.evaluate(() => window.localStorage.getItem("theme"));
    expect(stored).toBe("light");

    // Reload and verify theme persists
    await page.reload();
    const htmlAfterReload = page.locator("html");
    await expect(htmlAfterReload).toHaveClass(/light/);
    await expect(htmlAfterReload).toHaveAttribute("data-theme", "light");
  });

  test("should respect system dark preference in auto mode", async ({ page }) => {
    // Emulate dark system preference
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/jedi");

    // In auto mode (default), system dark preference should resolve to dark class
    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);

    // Switch to light system preference
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/jedi");
    const htmlLight = page.locator("html");
    await expect(htmlLight).toHaveClass(/light/);
  });
});
```

**Verification**: `vpr test:e2e ./e2e/jedi.spec.ts` — all e2e tests pass.

---

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase 5 complete - <summary>` summarizing the changes in this phase.
- Stop.

---

## [ ] Phase 6: Code Quality Audit (Claude)

Single consolidated pass before handing to user validation. Any issue found → fix, re-run relevant tests, re-verify.

### [ ] Step 6.1: TailwindCSS v4 Syntax Audit

Scan changed files for v3 residue:

```bash
grep -rn -E "!important|bg-opacity-|text-opacity-|md:![a-z]|\[&>" \
  src/routes/jedi.tsx src/routes/jedi.css src/components/Hero.tsx src/components/Image.tsx \
  src/components/Author.tsx src/components/Card.tsx src/components/JediNav.tsx \
  src/components/ThemeToggle.tsx src/components/Nav.tsx src/app.css
```

Fix any hits:

- `md:!block` → `md:block!`
- `bg-opacity-40` → `bg-gray-800/40`
- Unsupported `[&>*]` → `space-y-*` utility or scoped CSS
- Use `text-(--theme-accent)` pattern for custom properties

---

### [ ] Step 6.2: Lint, Format, Type-Check, Full Test Suite

```bash
vpr check         # format + lint + type-check with auto-fix
vpr check:type    # verify no TS errors
vpr test:comp     # ~25 component tests (including JediNav + ThemeToggle)
vpr test:unit     # unit tests
vpr test:e2e      # e2e tests (including theme toggle tests)
```

All must pass with no errors and no warnings. Fix any failures before continuing.

---

### [ ] Step 6.3: Production Build

```bash
vpr build
```

```bash
vpr start
```

**Verification**

- No build errors
- No TS errors
- No missing deps
- Bundle size reasonable.
- Open http://localhost:3000/jedi
  - page loads
  - no console errors.
  - theme toggle cycles correctly in production build

---

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase 6 complete - <summary>` summarizing the changes in this phase.
- Stop.

---

## [ ] Phase 7: User Validation (User — Manual)

**Executed manually by the user after all Claude phases are complete.**

Run `vpr dev` and navigate to http://localhost:3000/jedi.

### Desktop View Jedi page (1280px+)

- [ ] Hero displays background image with 40% overlay (bg-gray-800/40)
- [ ] Hero title uses Lobster font 6xl
- [ ] Hero title uses Tile Case
- [ ] Hero title uses white text color
- [ ] "Get Started" button uses `--btn-primary` color
- [ ] Global Nav visible (from `app.tsx`)
- [ ] JediNav (converted Jedi header) visible above Hero on Jedi page
- [ ] Main Jedi article image centered in column (2/3 width), full-width within card
- [ ] Caption uses Lobster at text-5xl
- [ ] Tags are rounded pills; hover → bg-gray-500 + white text
- [ ] Sidebar in right column (1/3); three cards: Categories, Top Photos, Top Captions
- [ ] Category items show icons and labels; hover states on list items
- [ ] Top Category item has `--theme-highlight` applied
- [ ] Overall uses Tailwind classes, not `style` attribute (exception: Hero background-image with dynamic URL)

### Mobile View (375px)

- [ ] Header menu collapsed under "hamburger" icon
- [ ] Hero stacks vertically
- [ ] Mobile "Categories" toggle button appears
- [ ] Clicking "Categories" toggle shows/hides cards; cards slide in, arrow icon rotates
- [ ] Main article full width; no horizontal scroll
- [ ] Interactive elements touch-friendly (min 44px)

### Tablet (768px)

- [ ] Smooth transition mobile → desktop
- [ ] Sidebar always visible; mobile toggle hidden

### Hover / Animation

- [ ] Nav links change bg on hover to match **Jedi Project**
- [ ] CTA (Get Started) darkens to `--btn-primary-hover`
- [ ] Author, Like, Edit and Delete links underlines on hover
- [ ] Hero title fades in on page load
- [ ] Mobile category cards transition smoothly; arrow rotation smooth (300ms)

### Theme Toggle

- [ ] Toggle button visible in global Nav all pages (not within Jedi page)
- [ ] Click cycles: sun (light) → moon (dark) → monitor (auto/system)
- [ ] Light mode: zinc-200 background, zinc-800 text, sky-700 accents
- [ ] Dark mode: zinc-800 background, zinc-300 text, sky-700 accents
- [ ] Auto mode: follows OS `prefers-color-scheme` setting
- [ ] Reload preserves selected mode (stored in localStorage)
- [ ] No flash of wrong theme on page load (FOUC prevention)
- [ ] Toggle works on all pages (CSS + init script are global)
- [ ] Jedi drop-down visible in light and dark mode

### Accessibility

- [ ] Keyboard Tab reaches all actionable elements
- [ ] Tab navigation reaches "Categories" toggle in small-screen mode
- [ ] Tab navigation reaches theme toggle button
- [ ] Theme toggle has descriptive `aria-label` indicating current mode and next action
- [ ] Space toggles theme toggle button
- [ ] Focus indicators visible
- [ ] Screen-reader basic navigation works
- [ ] Ctrl-Home moves to top
- [ ] (Optional) Run axe DevTools, see Brave browser — no critical issues

### Browser Compatibility

- [ ] Chrome / Edge / Brave (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

Check in each: layout, Lobster font rendering, animation smoothness, touch, image loading, theme toggle.

### Sign-off

When the above passes, the conversion is **complete**. Commit any final fixes and merge/deploy per the normal workflow.

---

## Success Criteria

1. All 6 components created with TypeScript interfaces (Hero, Image, Author, Card, JediNav, ThemeToggle)
2. `src/routes/jedi.tsx` functional with all sections; no duplicate `<Nav />` import
3. All component tests pass.
4. All E2E tests pass.
5. Visual appearance matches **Jedi Project** `Awesome.png`
6. Mobile sidebar toggle works
7. Dark/light/system theme toggle works with localStorage persistence; toggle in global Nav (all pages)
8. No FOUC — theme init script applies stored preference before first paint
9. TailwindCSS v4 syntax throughout; no Alpine.js dependencies; `style` only for dynamic background-image
10. Global CSS in `@layer base` — Tailwind utilities override without `!important`
11. Accessibility baseline met (semantic buttons, aria-label, aria-expanded, focus indicators)
12. Zero browser console errors
13. `vpr check:type` and `vpr build` succeed without errors or warnings
