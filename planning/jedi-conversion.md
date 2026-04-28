# Jedi Page Conversion Plan: Alpine.js HTML to SolidStart

## Overview

Convert the Source project (Alpine.js + TailwindCSS v3.2.7) to `src/routes/jedi.tsx` (SolidStart v1.3.2 + TailwindCSS v4.2.2) with component extraction. Replace the existing `jedi.tsx` placeholder.

**Source Project** `/Users/glen/Documents/Development/Study/Tailwind4/frontend-tutorial-v3/index.html`
**Source Appearance** `/Users/glen/Documents/Development/Study/Tailwind4/frontend-tutorial-v3/Awesome.png`
**Tanstack Project** `/Users/glen/Documents/Development/Study/Javascript/TanStack/tanstack-solid-cc/src/`
**Target project** `/Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo`

---

## Execution Notes (for Claude AI)

Read this section before starting any phase.

### Workflow

- Use `karpathy-guidelines` skills
- Use `superpowers` (systematic-debugging, TDD, verification-before-completion)
- Use `solidjs-solidstart-expert` skills
- Use `tailwind-design-system` when creating styles
- Use `caveman` to communicate
- The completed **Target project** must match **Source Appearance**
- Phases labeled **(Claude)** are executed by Claude AI.
- Execute first incomplete phase with `[ ] Phase...`. Skip completed phases `[√] Phase...`.
- The **final phase is labeled (User)** this is manual validation after all Claude phases are complete.
- Within each Claude phase:
  1. Execute each step in order.
  2. Run the step's verification (tests/checks) — **tests must pass before the step is complete**.

### Commands Reference

| Command          | Purpose                             |
| ---------------- | ----------------------------------- |
| `vpr dev`        | Start dev server (port 3000)        |
| `vpr check`      | Format, lint, type-check (auto-fix) |
| `vpr check:type` | Type-check only (`tsc --noEmit`)    |
| `vpr test:comp`  | Run component tests                 |
| `vpr test:unit`  | Run unit tests                      |
| `vpr test:e2e`   | Run Playwright e2e tests            |
| `vpr build`      | Production build                    |
| `vpr start`      | Serve production build              |
| `vp i <pkg>`     | Install a package via Vite+         |

### Code Output Rules

- Output complete code for each file (no truncation).
- If tests fail, analyze the root cause and fix before proceeding (no skipping).
- Static data arrays belong **outside** the component function.
- Signal naming follows `[value, setValue]`. Props interfaces named `<Component>Props`.
- Component names PascalCase. Imports ordered: external → internal → components.

---

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
4. **Custom properties**: `text-(--theme-accent)` pattern already used in **Target project**
5. **Font family**: Google Fonts 'Lobster' integration required

### Visual Features to Preserve

- Sticky header with z-50
- Hero with background image overlay
- Card-based layout with shadows and rounded corners
- Responsive grid: mobile (full-width) → desktop (2-col main + 1-col sidebar)
- Hover states on all interactive elements
- Mobile-first breakpoints (md:768px)

### Visual Features to Create

- Dark/light mode toggle
- Keyboard navigation:
  - Tab stops on all actionable elements
  - Tab selects "Categories" when in small-screen mode

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

### [ ] Step 1.1: Update `src/app.css` with Custom Properties and Animation

**File**: `src/app.css`

**Action**: Add custom properties and fade-in animation after existing theme variables.

```css
:root {
  /* Existing theme variables... */

  /* Jedi page custom properties */
  --font-lobster: "Lobster", sans-serif;
  --primary: rgb(88, 40, 244);
  --primary-hover: rgb(69, 29, 200);
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

.animate-fade-in {
  animation: 1s fadeIn;
}
```

**Verification**: `vpr check` passes.

---

### [ ] Step 1.2: Install and Import Lobster Font

```zsh
vp i @fontsource/lobster
```

**File**: `src/app.tsx`

```tsx
import "@fontsource/lobster";
import "./app.css";
```

**Verification**: `vpr dev` renders; DevTools shows Lobster font loaded.

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase X complete - <summary>` summarizing the changes in this phase.
- Stop. Wait for user reply before proceeding to the next phase.

---

## [ ] Phase 2: Component Development (Claude)

Each component ships with its tests. Tests must pass before the step is marked complete.

### [ ] Step 2.1: Create Hero Component + Tests

**File**: `src/components/Hero.tsx`

**Source**: `<hero>` section from **Source Project** `index.html`.

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
        <h1
          class="text-6xl font-bold mb-4 animate-fade-in"
          style={{ "font-family": "var(--font-lobster)" }}
        >
          {props.title}
        </h1>
        <p class="text-lg font-bold mb-5">{props.subtitle}</p>
        <a
          class="inline-flex items-center justify-center px-4 min-h-[3.3rem] font-semibold rounded-lg text-white transition-transform active:scale-95"
          style={{
            "background-color": "var(--primary)",
            "box-shadow": "0 4px 3px rgba(0, 0, 0, 0.1)",
          }}
          href={props.ctaHref}
        >
          {props.ctaText}
        </a>
      </div>
    </section>
  );
}
```

**Test**: `src/components/Hero.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
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

**Verification**: `vpr test:comp` — Hero tests pass.

---

### [ ] Step 2.2: Create Image Component + Tests

**File**: `src/components/Image.tsx`

**Source**: **Source Project** `<article><figure>` section.

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
import { describe, it, expect } from 'vitest'
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

**Verification**: `vpr test:comp` — Image tests pass.

---

### [ ] Step 2.3: Create Author Component + Tests

**File**: `src/components/Author.tsx`

**Source**: **Source Project** `<article><div>` author avatar/name section.

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
import { describe, it, expect } from 'vitest'
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

**Verification**: `vpr test:comp` — Author tests pass.

---

### [ ] Step 2.4: Create Card Component + Tests

**File**: `src/components/Card.tsx`

**Source**: **Source Project** `<section class="card">` sidebar sections.

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
import { JSX } from "solid-js";

export default function Card(props: CardProps) {
  return (
    <section
      class={`flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 pb-4 ${props.class || ""}`}
    >
      {props.title && <h2 class="text-2xl font-bold px-4 pt-4 pb-2">{props.title}</h2>}
      <div class="p-4 pt-0">{props.children}</div>
    </section>
  );
}
```

**Test**: `src/components/Card.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
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

**Verification**: `vpr test:comp` — all component tests pass (14 total).

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase X complete - <summary>` summarizing the changes in this phase.
- Stop. Wait for user reply before proceeding to the next phase.

---

## [ ] Phase 3: Main Page + E2E Tests (Claude)

### [ ] Step 3.1: Create Jedi Route Page with Metadata

**File**: `src/routes/jedi.tsx`

**Requirements**:

1. Import components (Nav, Hero, Image, Author, Card).
2. Keep the **Source Project** `<header>` element. Place it within `<main>` in the **Target Project**
3. When creating styles in the **Target project** convert to Tailwind v4 `class=...` syntax.
4. Avoid using the `<style=...>` element.
5. Implement mobile sidebar toggle with `createSignal`.
6. Convert Alpine.js `x-show` → `<Show>`, transitions → TailwindCSS v4 utilities.
7. Responsive grid: mobile stacked → desktop 2-col main + 1-col sidebar.
8. Include `<Title>` and `<Meta description>` from `@solidjs/meta`.
9. **Accessibility baseline** (include from the start, not as a later fix):

- Mobile toggle uses `<button type="button">` (not `<a>`).
- Mobile toggle has `aria-label="Toggle sidebar"` and `aria-expanded={mobileSidebarOpen()}`.
- Decorative icons use `alt=""`; content images use meaningful alt.

10. **Performance**: Declare `categories`, `topPhotos`, `topCaptions` as constants **outside** the component.

**Component structure (outline)**:

```tsx
import { Title, Meta } from "@solidjs/meta";
import { createSignal, For } from "solid-js";
import Nav from "~/components/Nav";
import Hero from "~/components/Hero";
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
    author: "Homer",
    likes: 5,
  },
  // ... more entries
];

const TOP_CAPTIONS = [
  { avatar: "https://img.icons8.com/small/96/A9A9A9/happy.png", author: "Homer", likes: 5 },
  // ... more entries
];

export default function Jedi() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false);

  return (
    <>
      <Title>Little Jedi - Awesome Photos & Captions</Title>
      <Meta name="description" content="Share your favorite Photos from Flickr and add a great caption" />
      <Nav />

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
            class="flex items-center font-bold hover:bg-gray-200 rounded-lg p-3"
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
          {/* ...article body: header, Image, Author, caption, tags, actions... */}
        </main>

        {/* Sidebar */}
        <aside
          class={`col-span-full md:col-span-1 mx-[5%] md:mr-[20%] order-1 md:order-2 md:block! ${mobileSidebarOpen() ? "block" : "hidden"}`}
        >
          <Card title="Categories">
            <ul class="space-y-1">
              <For each={CATEGORIES}>{(c) => (/* item */)}</For>
            </ul>
          </Card>
          <Card title="Top Photos">
            <ul class="space-y-1">
              <For each={TOP_PHOTOS}>{(p) => (/* item */)}</For>
            </ul>
          </Card>
          <Card title="Top Captions">
            <ul class="space-y-1">
              <For each={TOP_CAPTIONS}>{(c) => (/* item */)}</For>
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

### [ ] Step 3.2: Create Dark/Light toggle

- Import **Tanstack Project** `components/ThemeToggle.tsx`
- Reference **Tanstack Project** `styles.css` for file structure and dark/light theme values
- Add Dark/Light toggle button page <header> element use `<script innerHTML={THEME_INIT_SCRIPT} />
- Use sun/moon/system icons to indicate the state resulting from a button click
- Add `THEME_INIT_SCRIPT`

```typescript
const THEME_INIT_SCRIPT = `(function(){
  try {
    var stored=window.localStorage.getItem('theme');
    var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';
    var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;
    var root=document.documentElement;root.classList.remove('light','dark');
    root.classList.add(resolved);
    if(mode==='auto'){
      root.removeAttribute('data-theme')
    }else{
     root.setAttribute('data-theme',mode)
    }
    root.style.colorScheme=resolved;
  } catch(e){}})();
}`;
```

---

### [ ] Step 3.3: Write E2E Tests

**File**: `e2e/jedi.spec.ts` (file exists — update with the tests below)

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
    expect(await aside.isVisible()).toBe(false);
    await toggle.click();
    await page.waitForTimeout(300);
    expect(await aside.isVisible()).toBe(true);
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
```

**Verification**: `vpr test:e2e ./e2e/jedi.spec.ts` — all e2e tests pass.

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase X complete - <summary>` summarizing the changes in this phase.
- Stop. Wait for user reply before proceeding to the next phase.

---

## [ ] Phase 4: Code Quality Audit (Claude)

Single consolidated pass before handing to user validation. Any issue found → fix, re-run relevant tests, re-verify.

### [ ] Step 4.1: TailwindCSS v4 Syntax Audit

Scan changed files for v3 residue:

```bash
grep -rn -E "!important|bg-opacity-|text-opacity-|md:![a-z]|\[&>" \
  src/routes/jedi.tsx src/components/Hero.tsx src/components/Image.tsx \
  src/components/Author.tsx src/components/Card.tsx src/app.css
```

Fix any hits:

- `md:!block` → `md:block!`
- `bg-opacity-40` → `bg-gray-800/40`
- Unsupported `[&>*]` → `space-y-*` utility or scoped CSS
- Use `text-(--theme-accent)` pattern for custom properties

---

### [ ] Step 4.2: Lint, Format, Type-Check, Full Test Suite

```bash
vpr check         # format + lint + type-check with auto-fix
vpr check:type    # verify no TS errors
vpr test:comp     # 14 component tests
vpr test:unit     # unit tests
vpr test:e2e      # e2e tests
```

All must pass with no errors and no warnings. Fix any failures before continuing.

---

### [ ] Step 4.3: Production Build Verification

```bash
vpr build
```

Verify: no build errors, no TS errors, no missing deps, bundle size reasonable.

```bash
vpr start
```

Smoke-test http://localhost:3000/jedi in production mode: page loads, no console errors.

**Phase Complete**:

- Write a commit message in "Conventional Commit" format `feat(jedi): Phase X complete - <summary>` summarizing the changes in this phase.
- Stop. Wait for user reply before proceeding to the next phase.

---

## [ ] Phase 5: User Validation (User — Manual)

**Executed manually by the user after all Claude phases are complete.**

Run `vpr dev` and navigate to http://localhost:3000/jedi.

### Desktop View (1280px+)

- [ ] Hero displays background image with 40% overlay (bg-gray-800/40)
- [ ] Hero title uses Lobster font
- [ ] Hero title uses Tile Case
- [ ] Hero title use while text color
- [ ] "Get Started" button uses `--primary` color
- [ ] Nav component visible
- [ ] Main article in center column (2/3 width), image full-width within card
- [ ] Caption uses Lobster at text-5xl
- [ ] Tags are rounded pills; hover → bg-gray-500 + white text
- [ ] Sidebar in right column (1/3); three cards: Categories, Top Photos, Top Captions
- [ ] Category items show icons and labels; hover states on list items
- [ ] Overall should use tailwind classes, not `style` attribute

### Mobile View (375px)

- [ ] Hero stacks vertically
- [ ] Mobile "Categories" toggle button appears
- [ ] Clicking toggle shows/hides sidebar; arrow icon rotates
- [ ] Main article full width; no horizontal scroll
- [ ] Interactive elements touch-friendly (min 44px)

### Tablet (768px)

- [ ] Smooth transition mobile → desktop
- [ ] Sidebar always visible; mobile toggle hidden

### Hover / Animation

- [ ] Nav links change bg on hover to match **Source Project**
- [ ] CTA (get Started) darkens to `--primary-hover`
- [ ] Author name underlines on hover
- [ ] Hero title fades in on page load
- [ ] Mobile sidebar transitions smoothly; arrow rotation smooth (300ms)

### Accessibility (manual)

- [ ] Keyboard Tab reaches all actionable elements
- [ ] Tab navigation reaches "Categories" toggle in small-screen mode
- [ ] Focus indicators visible
- [ ] Screen-reader basic navigation works <-- Ctrl-Home does not move to top
- [ ] (Optional) Run axe DevTools — no critical issues

### Browser Compatibility

- [ ] Chrome / Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

Check in each: layout, Lobster font rendering, animation smoothness, touch, image loading.

### Sign-off

When the above passes, the conversion is **complete**. Commit any final fixes and merge/deploy per your normal workflow.

---

## Success Criteria

1. All 4 components created with TypeScript interfaces
2. `src/routes/jedi.tsx` functional with all sections
3. All component tests pass (14)
4. All E2E tests pass (~9)
5. Visual appearance matches **Source Appearance**
6. Mobile sidebar toggle works
7. TailwindCSS v4 syntax throughout; no Alpine.js dependencies
8. Accessibility baseline met (semantic buttons, aria-label, aria-expanded, focus indicators)
9. Zero browser console errors
10. `vpr check:type` and `vpr build` succeed without errors or warnings
