# Jedi Page Conversion Plan: Alpine.js HTML to SolidStart

## Overview

/Users/glen/Documents/Development/Study/Tailwind4/frontend-tutorial-v3
/Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo

Convert `../../../Tailwind4/frontend-tutorial-v3/index.html` (Alpine.js + TailwindCSS v3.2.7) to `src/routes/jedi.tsx` (SolidStart v1.3.2 + TailwindCSS v4.2.2) with component extraction. Replace the existing jedi.tsx placeholder

## Source Analysis Summary

### Alpine.js State Management (to be converted):

1. **Header mobile navigation**: `x-data="{ mobilenavOpen: false }"` with toggle
2. **Header dropdown**: `x-data="{ dropdownOpen: false }"` with click-away handling
3. **Sidebar mobile toggle**: `x-data="{ mobileSidebarOpen: false }"` with toggle
4. **Alpine.js transitions**: `x-transition:enter` animations for smooth reveals

### TailwindCSS v3 → v4 Key Changes:

1. **Arbitrary values**: `[&>*]:px-8` → use standard TailwindCSS v4 utilities or custom classes
2. **Important modifiers**: `md:!block` → `md:block!` (v4 syntax)
3. **Color opacity**: `bg-opacity-40` → `bg-gray-800/40` (v4 syntax)
4. **Custom properties**: `text-(--theme-accent)` pattern already used in target
5. **Font family**: Google Fonts 'Lobster' needs integration

### Visual Features to Preserve:

- Sticky header with z-50
- Hero section with background image overlay
- Card-based layout with shadows and rounded corners
- Responsive grid: mobile (full-width) → desktop (2-col main + 1-col sidebar)
- Hover states on all interactive elements
- Mobile-first responsive breakpoints (md:768px)

### Visual Features to Create:

- Dark light mode toggle
- Keyboard navigation:
  - Tab navigation should stop on all actionable elements
  - Tab navigation should select "Categories" when in small screen mode

---

## Step-by-Step Conversion Plan

### [ ] Phase 1: CSS Foundation Setup

#### [ ] Step 1.1: Update src/app.css with Custom Properties

**File**: `src/app.css`

**Action**: Add custom properties after existing theme variables

```css
:root {
  /* Existing theme variables... */

  /* Jedi page custom properties */
  --font-lobster: "Lobster", sans-serif;
  --primary: rgb(88, 40, 244);
  --primary-hover: rgb(69, 29, 200);
}
```

**Verification**: Confirm CSS custom properties are accessible in components

---

#### [ ] Step 1.2: Add Lobster Font to Root Layout

**File**: `package.json`

**Action** install @fontsource/lobster

```zsh
vp i @fontsource/lobster
```

**File** `src/app.tsx`

**Action**: Import @fontsource/lobster

```tsx
import "@fontsource/lobster";
import "./app.css";
```

**Verification**: Check browser DevTools that Lobster font loads successfully

---

### [ ] Phase 2: Component Development

#### [ ] Step 2.1: Create Hero Component

**File**: `src/components/Hero.tsx`

**Source HTML**: `<hero>` section from index.html

**Implementation Details**:

- Background image with overlay using TailwindCSS v4 arbitrary properties
- Grid layout: `grid` with `[grid-template-areas]`
- Overlay: `bg-gray-800/40` (v4 opacity syntax)
- Title animation: CSS `@keyframes fadeIn` in component or app.css
- Button: Reusable with `--primary` custom property

**State Management**: None (static content)

**Props Interface**:

```typescript
interface HeroProps {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  backgroundImage: string;
}
```

**Component Structure**:

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

**CSS Addition to app.css**

```css
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

**Test File**: `src/components/Hero.test.tsx`

- Test: Renders with provided props
- Test: Background image style applied
- Test: CTA button has correct href
- Test: Title uses Lobster font-family

---

#### [ ] Step 2.2: Create Image Component

**File**: `src/components/Image.tsx`

**Source HTML**: `<article><figure>` section from index.html

**Implementation Details**:

- Display figure with image
- Image link wraps the img element
- Responsive width: `w-full`
- Object-fit for consistent display

**Props Interface**:

```typescript
interface ImageProps {
  src: string;
  alt: string;
  href?: string;
  class?: string;
}
```

**Component Structure**:

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

**Test File**: `src/components/Image.test.tsx`

- Test: Renders image with src and alt
- Test: Wraps in link when href provided
- Test: No link when href not provided
- Test: Applies custom class

---

#### [ ] Step 2.3: Create Author Component

**File**: `src/components/Author.tsx`

**Source HTML**: `<article><div>` with author avatar/name

**Implementation Details**:

- Avatar image (rounded-full)
- Author name with hover underline
- Flexible layout with gap

**Props Interface**:

```typescript
interface AuthorProps {
  avatarSrc: string;
  name: string;
  href?: string;
}
```

**Component Structure**:

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

**Test File**: `src/components/Author.test.tsx`

- Test: Renders avatar and name
- Test: Default href when not provided
- Test: Custom href when provided
- Test: Hover underline class present

---

#### [ ] Step 2.4: Create Card Component

**File**: `src/components/Card.tsx`

**Source HTML**: `<section class="card">` sections in sidebar

**Implementation Details**:

- Reusable card container
- Theme colors via class attribute with shadow
- Rounded corners
- Padding and margin-bottom
- Support for heading and list children

**Props Interface**:

```typescript
interface CardProps {
  title?: string;
  children: JSX.Element;
  class?: string;
}
```

**Component Structure**:

```tsx
import { JSX } from "solid-js";

export default function Card(props: { title?: string; children: JSX.Element; class?: string }) {
  return (
    <section
      class={`flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 pb-4
      ${props.class || ""}`}
    >
      {props.title && <h2 class="text-2xl font-bold px-4 pt-4 pb-2">{props.title}</h2>}
      <div class="p-4 pt-0">{props.children}</div>
    </section>
  );
}
```

**Test File**: `src/components/Card.test.tsx`

- Test: Renders children
- Test: Shows title when provided
- Test: No title element when not provided
- Test: Applies custom classes
- Test: Has correct styling classes

---

### [ ] Phase 3: Main Page Construction

#### [ ] Step 3.1: Create Jedi Route Page

**File**: `src/routes/jedi.tsx`

**Implementation Details**:

1. Import all components (Nav, Hero, Image, Author, Card)
2. Implement mobile sidebar state with SolidJS `createSignal`
3. Convert Alpine.js `x-show` to SolidJS `<Show>` component
4. Convert Alpine.js transitions to TailwindCSS v4 utilities + Solid's transition directives
5. Implement responsive grid layout
6. Add metadata with `<Title>` from `@solidjs/meta`

**Component Structure** (outline):

```tsx
import { Title } from "@solidjs/meta";
import { createSignal, Show, For } from "solid-js";
import Nav from "~/components/Nav";
import Hero from "~/components/Hero";
import Image from "~/components/Image";
import Author from "~/components/Author";
import Card from "~/components/Card";

export default function Jedi() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false);

  // Data structures for sidebar content
  const categories = [
    /* ... */
  ];
  const topPhotos = [
    /* ... */
  ];
  const topCaptions = [
    /* ... */
  ];

  return (
    <>
      <Title>Little Jedi - Awesome</Title>
      <Nav />

      <Hero
        title="Awesome Photos & Captions"
        subtitle="Share your favorite Photos from Flickr and add a great caption"
        ctaText="Get Started"
        ctaHref="#"
        backgroundImage="https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg"
      />

      <div class="grid grid-cols-3 max-w-7xl mx-auto mt-6">
        {/* Mobile sidebar toggle button */}
        <div class="md:hidden col-span-full mx-auto mb-6 relative z-10">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen())}
            class="flex items-center font-bold hover:bg-gray-200 rounded-lg p-3"
          >
            <span>Categories</span>
            <img
              class={`w-4 ml-1.5 transition-transform ${mobileSidebarOpen() ? "rotate-180" : ""}`}
              src="https://img.icons8.com/small/32/000000/expand-arrow.png"
              alt="Toggle"
            />
          </button>
        </div>

        {/* Main content */}
        <main class="col-span-full md:col-span-2 mx-[5%] md:mx-[10%] order-2 md:order-1">
          <article class="flex flex-col overflow-hidden relative rounded-2xl shadow-lg mb-8 bg-white pb-4">
            {/* Article header */}
            <div class="flex items-center justify-between px-4 h-14">
              <h3 class="text-lg font-bold w-1/2 truncate">Little Jedi</h3>
              <div class="text-sm text-gray-500">
                flickr @{" "}
                <a href="#" class="hover:underline">
                  John Doe
                </a>
              </div>
            </div>

            {/* Image */}
            <Image
              src="https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg"
              alt="Little Jedi"
              href="#"
            />

            {/* Content body */}
            <div class="p-4 pb-2">
              <Author
                avatarSrc="https://img.icons8.com/small/96/A9A9A9/happy.png"
                name="Lisa"
                href="#"
              />

              <p class="text-5xl mb-10 px-4" style={{ "font-family": "var(--font-lobster)" }}>
                Jedi Kitty protects the street
              </p>

              {/* Tags */}
              <div class="flex items-center gap-2 text-sm mb-5">
                <a
                  href="#"
                  class="bg-gray-200 rounded-full px-3 py-1 hover:bg-gray-500 hover:text-white"
                >
                  Animals
                </a>
                <a
                  href="#"
                  class="bg-gray-200 rounded-full px-3 py-1 hover:bg-gray-500 hover:text-white"
                >
                  Cute
                </a>
              </div>

              {/* Actions */}
              <div class="flex items-center justify-between text-sm px-2">
                <a href="#" class="font-bold hover:underline">
                  Comments<span class="font-light text-gray-500 ml-2">3</span>
                </a>
                <div class="flex items-center gap-4 [&>a]:hover:underline">
                  <div class="flex items-center gap-1">
                    <img
                      class="w-5 -mt-1"
                      src="https://img.icons8.com/small/24/000000/fire-heart.png"
                      alt="Likes"
                    />
                    1
                  </div>
                  <a href="#">Like</a>
                  <a href="#">Edit</a>
                  <a href="#">Delete</a>
                </div>
              </div>
            </div>
          </article>
        </main>

        {/* Sidebar - hidden on mobile until toggled, always visible md+ */}
        <aside
          class={`col-span-full md:col-span-1 mx-[5%] md:mr-[20%] order-1 md:order-2 md:block! ${mobileSidebarOpen() ? "block" : "hidden"}`}
        >
          {/* Categories Card */}
          <Card title="Categories">
            <ul class="space-y-1">
              <For each={categories}>
                {(category) => (
                  <li class="rounded hover:bg-gray-100 transition-colors">
                    <a href="#" class="flex items-center p-2">
                      <img class="w-8 h-8 mr-2" src={category.icon} alt={category.name} />
                      <span class="font-bold text-sm">{category.name}</span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Card>

          {/* Top Photos Card */}
          <Card title="Top Photos">
            <ul class="space-y-1">
              <For each={topPhotos}>
                {(photo) => (
                  <li class="rounded hover:bg-gray-100 transition-colors">
                    <a href="#" class="flex items-center p-2">
                      <img
                        class="w-10 h-10 rounded-lg object-cover mr-3"
                        src={photo.src}
                        alt={photo.alt}
                      />
                      <img
                        class="w-6 h-6 rounded-full object-cover mr-0.5"
                        src={photo.avatar}
                        alt={photo.author}
                      />
                      <span class="font-bold text-sm mr-1">{photo.author}</span>
                      <span class="text-sm text-gray-500">({photo.likes} Likes)</span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Card>

          {/* Top Captions Card */}
          <Card title="Top Captions">
            <ul class="space-y-1">
              <For each={topCaptions}>
                {(caption) => (
                  <li class="rounded hover:bg-gray-100 transition-colors">
                    <a href="#" class="flex items-center p-2">
                      <img
                        class="w-8 h-8 rounded-full object-cover mr-1"
                        src={caption.avatar}
                        alt={caption.author}
                      />
                      <span class="font-bold text-sm mr-1">{caption.author}</span>
                      <span class="text-sm text-gray-500">({caption.likes} Likes)</span>
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

**Data Structures**:

```typescript
const categories = [
  {
    name: "Landscape",
    icon: "https://img.icons8.com/small/96/null/landscape.png",
  },
  { name: "People", icon: "https://img.icons8.com/small/96/null/portrait.png" },
  { name: "Animals", icon: "https://img.icons8.com/small/96/null/dog.png" },
  {
    name: "Abstract",
    icon: "https://img.icons8.com/small/96/null/collage.png",
  },
  {
    name: "Black & White",
    icon: "https://img.icons8.com/small/96/null/180-degrees.png",
  },
];

const topPhotos = [
  {
    src: "https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg",
    alt: "Top photo",
    avatar: "https://img.icons8.com/small/96/A9A9A9/happy.png",
    author: "Homer",
    likes: 5,
  },
  // ... more entries
];

const topCaptions = [
  {
    avatar: "https://img.icons8.com/small/96/A9A9A9/happy.png",
    author: "Homer",
    likes: 5,
  },
  // ... more entries
];
```

**Key Conversion Notes**:

1. **Alpine.js `x-data`** → SolidJS `createSignal(false)`
2. **Alpine.js `x-show`** → SolidJS `<Show when={...}>`
3. **Alpine.js `x-cloak`** → Not needed (SolidJS handles hydration)
4. **Alpine.js `@click`** → SolidJS `onClick={...}`
5. **Alpine.js `x-bind:class`** → Template literal in `class` attribute
6. **Alpine.js `x-transition`** → TailwindCSS v4 transition utilities + conditional classes
7. **Custom `[&>*]` selectors** → Use `space-y` utilities or component-scoped styles

---

### [ ] Phase 4: Testing

#### [ ] Step 4.1: Component Tests

**File**: `src/components/Hero.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import Hero from './Hero'

describe('<Hero />', () => {
  it('renders with all props', () => {
    render(() => (
      <Hero
        title="Test Title"
        subtitle="Test Subtitle"
        ctaText="Click Me"
        ctaHref="/test"
        backgroundImage="test.jpg"
      />
    ))

    expect(screen.getByRole('heading')).toHaveTextContent('Test Title')
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument()

    const ctaButton = screen.getByRole('link', { name: /click me/i })
    expect(ctaButton).toHaveAttribute('href', '/test')
  })

  it('applies background image style', () => {
    const { container } = render(() => (
      <Hero
        title="Test"
        subtitle="Test"
        ctaText="Test"
        ctaHref="#"
        backgroundImage="test-bg.jpg"
      />
    ))

    const section = container.querySelector('section')
    expect(section).toHaveStyle({ backgroundImage: "url('test-bg.jpg')" })
  })
})
```

**File**: `src/components/Image.test.tsx`

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

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/test')
  })

  it('does not wrap in link when href omitted', () => {
    const { container } = render(() => <Image src="test.jpg" alt="Test" />)

    expect(container.querySelector('a')).toBeNull()
  })
})
```

**File**: `src/components/Author.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import Author from './Author'

describe('<Author />', () => {
  it('renders avatar and name', () => {
    render(() => <Author avatarSrc="avatar.jpg" name="Test Author" />)

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'avatar.jpg')
    expect(screen.getByText('Test Author')).toBeInTheDocument()
  })

  it('uses custom href when provided', () => {
    render(() => <Author avatarSrc="avatar.jpg" name="Test" href="/author" />)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/author')
  })

  it('defaults to # when href not provided', () => {
    render(() => <Author avatarSrc="avatar.jpg" name="Test" />)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '#')
  })
})
```

**File**: `src/components/Card.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import Card from './Card'

describe('<Card />', () => {
  it('renders children', () => {
    render(() => (
      <Card>
        <div>Test Content</div>
      </Card>
    ))

    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('shows title when provided', () => {
    render(() => (
      <Card title="Test Title">
        <div>Content</div>
      </Card>
    ))

    expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument()
  })

  it('omits title when not provided', () => {
    const { container } = render(() => (
      <Card>
        <div>Content</div>
      </Card>
    ))

    expect(container.querySelector('h2')).toBeNull()
  })

  it('applies custom classes', () => {
    const { container } = render(() => (
      <Card class="custom-class">
        <div>Content</div>
      </Card>
    ))

    const section = container.querySelector('section')
    expect(section).toHaveClass('custom-class')
  })
})
```

---

#### [ ] Step 4.2: E2E Tests

**File**: `e2e/jedi.spec.ts` _(already exists — update with the tests below)_

```typescript
import { test, expect } from "@playwright/test";

test.describe("Jedi Page", () => {
  test("should load successfully and display correct title", async ({ page }) => {
    await page.goto("/jedi");

    await expect(page).toHaveTitle(/Little Jedi - Awesome/);
    await expect(page).toHaveURL("http://localhost:3000/jedi");
  });

  test("should display hero section with title and CTA", async ({ page }) => {
    await page.goto("/jedi");

    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();

    const heroTitle = hero.getByRole("heading", { name: /awesome photos/i });
    await expect(heroTitle).toBeVisible();

    const ctaButton = hero.getByRole("link", { name: /get started/i });
    await expect(ctaButton).toBeVisible();
  });

  test("should display main article with image and caption", async ({ page }) => {
    await page.goto("/jedi");

    const article = page.locator("article").first();
    await expect(article).toBeVisible();

    // Check article title
    const articleTitle = article.getByRole("heading", { name: /little jedi/i });
    await expect(articleTitle).toBeVisible();

    // Check main image
    const mainImage = article.getByRole("img").first();
    await expect(mainImage).toBeVisible();

    // Check caption text
    await expect(article.getByText(/jedi kitty protects/i)).toBeVisible();
  });

  test("should display sidebar with categories on desktop", async ({ page }) => {
    await page.goto("/jedi");

    const aside = page.locator("aside");
    await expect(aside).toBeVisible();

    // Check categories card
    const categoriesHeading = aside.getByRole("heading", { name: /categories/i });
    await expect(categoriesHeading).toBeVisible();

    // Check category items
    await expect(aside.getByText("Landscape")).toBeVisible();
    await expect(aside.getByText("Animals")).toBeVisible();
  });

  test("should toggle mobile sidebar when button clicked", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile size
    await page.goto("/jedi");

    // Mobile toggle button should be visible
    const toggleButton = page.getByRole("button", { name: /categories/i });
    await expect(toggleButton).toBeVisible();

    // Sidebar should be hidden initially on mobile
    const aside = page.locator("aside");
    const isVisible = await aside.isVisible();
    expect(isVisible).toBe(false);

    // Click toggle
    await toggleButton.click();
    await page.waitForTimeout(300); // Wait for transition

    // Verify sidebar is now visible
    const newVisibility = await aside.isVisible();
    expect(newVisibility).toBe(!isVisible);
  });

  test("should display all three sidebar cards", async ({ page }) => {
    await page.goto("/jedi");

    const aside = page.locator("aside");

    // Check for three card sections
    await expect(aside.getByRole("heading", { name: /categories/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top photos/i })).toBeVisible();
    await expect(aside.getByRole("heading", { name: /top captions/i })).toBeVisible();
  });

  test("should have working navigation in header", async ({ page }) => {
    await page.goto("/jedi");

    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();

    // Check nav links exist
    await expect(nav.getByRole("link", { name: /home/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /about/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /readme/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /jedi/i })).toBeVisible();
  });

  test("should display author information", async ({ page }) => {
    await page.goto("/jedi");

    const article = page.locator("article").first();

    // Check author avatar and name
    const authorLink = article.getByRole("link").filter({ hasText: "Lisa" });
    await expect(authorLink).toBeVisible();

    const avatar = authorLink.getByRole("img");
    await expect(avatar).toBeVisible();
  });

  test("should display tags for the post", async ({ page }) => {
    await page.goto("/jedi");

    const article = page.locator("article").first();

    // Check for tag links
    await expect(article.getByRole("link", { name: /animals/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /cute/i })).toBeVisible();
  });

  test("should display post actions (like, edit, delete)", async ({ page }) => {
    await page.goto("/jedi");

    const article = page.locator("article").first();

    // Check action links
    await expect(article.getByRole("link", { name: /Comments/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /Like/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /Edit/i })).toBeVisible();
    await expect(article.getByRole("link", { name: /Delete/i })).toBeVisible();
  });

  test("should have responsive layout", async ({ page }) => {
    // Test desktop layout
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/jedi");

    const main = page.locator("main");
    const aside = page.locator("aside");

    await expect(main).toBeVisible();
    await expect(aside).toBeVisible();

    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });

    await expect(main).toBeVisible();
    await expect(aside).not.toBeVisible();
  });
});
```

---

### [ ] Phase 5: Integration and Verification

#### [ ] Step 5.1: Manual Visual Inspection Checklist

**Run Development Server**:

```bash
cd /Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo
vpr dev
```

**Navigate to**: `http://localhost:3000/jedi`

**Desktop View (1280px+)**:

- [ ] Hero section displays with background image
- [ ] Hero title uses Lobster font
- [ ] Hero overlay has 40% opacity (bg-gray-800/40)
- [ ] "Get Started" button has correct purple color (--primary)
- [ ] Navigation bar Nav component is visible
- [ ] Main article displays in center column (2/3 width)
- [ ] Article image is full-width within card
- [ ] Caption uses Lobster font at text-5xl
- [ ] Tags are rounded pills with hover effect (bg-gray-500/text-white)
- [ ] Sidebar displays in right column (1/3 width)
- [ ] Three cards visible: Categories, Top Photos, Top Captions
- [ ] Category items show icons and labels
- [ ] Hover states work on all list items
- [ ] First category has highlight background (bg-indigo-100)

**Mobile View (375px)**:

- [ ] Hero section stacks vertically
- [ ] Mobile "Categories" toggle button appears
- [ ] Clicking toggle shows/hides sidebar
- [ ] Sidebar stacks above main content when visible
- [ ] Arrow icon rotates on toggle
- [ ] Main article takes full width
- [ ] All interactive elements are touch-friendly (min 44px height)
- [ ] No horizontal scrolling

**Tablet View (768px)**:

- [ ] Layout transitions smoothly from mobile to desktop
- [ ] Sidebar becomes always visible
- [ ] Mobile toggle button disappears
- [ ] Grid columns activate properly

**Hover States**:

- [ ] Navigation links change background on hover
- [ ] CTA button darkens on hover (--primary-hover)
- [ ] Tag pills change to gray-500 background + white text
- [ ] Author name underlines on hover
- [ ] All sidebar list items get gray-100 background
- [ ] Action links (Like, Edit, Delete) underline on hover

**Animations**:

- [ ] Hero title fades in on page load
- [ ] Mobile sidebar slides in/out smoothly
- [ ] Toggle arrow rotates smoothly (300ms)
- [ ] Hover transitions are smooth (150ms)

---

#### [ ] Step 5.2: Run Component Tests

```bash
vpr test:comp
```

**Expected Results**:

- All hero.test.tsx tests pass (4 tests)
- All image.test.tsx tests pass (3 tests)
- All author.test.tsx tests pass (3 tests)
- All card.test.tsx tests pass (4 tests)
- No console errors or warnings

**Debugging Failed Tests**:

1. Check import paths are correct
2. Verify component props interfaces match usage
3. Confirm TailwindCSS classes are available
4. Review SolidJS signal implementation

---

#### [ ] Step 5.3: Run E2E Tests

```bash
vpr test:e2e
```

**Or run specific test**:

```bash
vpr test:e2e e2e/jedi.spec.ts
```

**Expected Results**:

- All jedi.spec.ts tests pass
- No timeout errors
- Screenshots match expected layout (if using visual regression)

**Debugging Failed E2E Tests**:

1. Run in headed mode: `vpr test:e2e --headed --project=chromium e2e/jedi.spec.ts`
2. Use debug mode: `vpr test:e2e --debug --project=chromium e2e/jedi.spec.ts`
3. Check element selectors match actual rendered HTML
4. Verify mobile viewport tests use correct dimensions
5. Review network tab for failed resource loads

---

### [ ] Phase 6: Code Review and Refinement

#### [ ] Step 6.1: TailwindCSS v4 Migration Review

**Check for v3 Syntax**:

```bash
cd /Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo
grep -r "!" src/routes/jedi.tsx src/components/Hero.tsx src/components/Image.tsx src/components/Author.tsx src/components/Card.tsx
```

**Common v3 → v4 Issues**:

1. **Important modifier placement**: `md:!block` should be `md:block!`
2. **Opacity with colors**: `bg-opacity-40` should be `bg-gray-800/40`
3. **Arbitrary values**: Ensure no unsupported `[&>*]` selectors in component classes
4. **Custom properties**: Use `text-(--theme-accent)` pattern consistently

**Fix any issues found**

---

#### [ ] Step 6.2: Performance Optimization Review

**Check for unnecessary re-renders**:

- Verify `createSignal` is only used for interactive state (mobileSidebarOpen)
- Static data arrays should be outside component function or memoized
- No inline function definitions in JSX that recreate on every render

**Example optimization**:

```tsx
// BAD - creates new array every render
export default function Jedi() {
  const categories = [...]

// GOOD - defined outside component
const CATEGORIES = [...]
export default function Jedi() {
```

**Image loading optimization**:

- Consider adding `loading="lazy"` to images below the fold
- Verify all images have explicit width/height or aspect-ratio

---

#### [ ] Step 6.3: Accessibility Review

**Run axe DevTools or similar**:

- Check for heading hierarchy (h1, h2, h3)
- Verify all images have meaningful alt text
- Confirm all interactive elements are keyboard accessible
- Test with screen reader (basic navigation)

**Required Fixes**:

1. **Alt text**: All decorative icons should have `alt=""`
2. **ARIA labels**: Mobile toggle button should have `aria-label="Toggle sidebar"`
3. **Focus indicators**: Ensure visible focus states on all interactive elements
4. **Semantic HTML**: Use `<button>` for toggle, not `<a>` or `<div>`

**Example fix**:

```tsx
// BEFORE
<a onClick={() => setMobileSidebarOpen(!mobileSidebarOpen())} ...>

// AFTER
<button
  type="button"
  aria-label="Toggle sidebar"
  aria-expanded={mobileSidebarOpen()}
  onClick={() => setMobileSidebarOpen(!mobileSidebarOpen())}
  ...>
```

---

#### [ ] Step 6.4: Code Quality Review

**Run Lint, Format check**:

```bash
vpr check
```

**TypeScript type checking**:

```bash
vpr check:type tsc --noEmit
```

**Fix any type errors**:

- Ensure all props interfaces are properly typed
- Add return type annotations if ambiguous
- Fix any `any` types

**Code style consistency**:

- Component names are PascalCase
- Props interfaces are named `ComponentNameProps`
- Signal naming follows `[value, setValue]` pattern
- CSS class strings use template literals when dynamic
- Import statements are organized (external → internal → components)

---

### [ ] Phase 7: Final Validation

#### [ ] Step 7.1: Complete Test Suite

```bash
# Run all tests
vpr test:unit
vpr test:comp
vpr test:e2e

# Expected: All passing
```

---

#### [ ] Step 7.2: Build and Production Check

```bash
vpr build
```

**Verify**:

- No build errors
- No TypeScript errors
- No missing dependencies
- Bundle size is reasonable

```bash
vpr start
```

**Test in production mode**:

- Navigate to http://localhost:3000/jedi
- Run e2e tests
- Verify all functionality works
- Check browser console for errors
- Test mobile viewport

---

#### [ ] Step 7.3: Browser Compatibility Check

**Test in multiple browsers**:

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

**Check for**:

- Layout consistency
- Font rendering (Lobster)
- Animation smoothness
- Touch interactions (mobile)
- Image loading

---

### [ ] Phase 8: Deployment Preparation

#### [ ] Step 8.1: SEO and Metadata

**Verify jedi.tsx has**:

```tsx
import { Title, Meta } from "@solidjs/meta";

// In component:
<>
  <Title>Little Jedi - Awesome Photos & Captions</Title>
  <Meta
    name="description"
    content="Share your favorite Photos from Flickr and add a great caption"
  />
</>;
```

---

#### [ ] Step 8.2: Final Checklist

**Before committing**:

- [ ] All tests passing
- [ ] No console errors in dev mode
- [ ] No TypeScript errors
- [ ] Prettier formatting applied
- [ ] Components documented
- [ ] E2E tests updated for new nav link
- [ ] Visual inspection completed (desktop + mobile)
- [ ] Accessibility review completed
- [ ] Performance check (no unnecessary re-renders)
- [ ] Browser compatibility verified

**Git workflow**:

```bash
git checkout -b feature/jedi-page
git add src/routes/jedi.tsx
git add src/components/Hero.tsx src/components/Image.tsx src/components/Author.tsx src/components/Card.tsx
git add src/components/*.test.tsx
git add e2e/jedi.spec.ts
git add src/app.css
git add src/components/Nav.tsx
git commit -m "feat: Add Jedi page with responsive layout

- Convert Alpine.js to SolidJS reactive primitives
- Migrate TailwindCSS v3 to v4 syntax
- Create reusable Hero, Image, Author, Card components
- Add comprehensive component and E2E tests
- Implement mobile-responsive sidebar toggle
- Integrate Lobster font for headings
"
```

---

## Summary of Key Decisions

### Technology Choices

1. **SolidJS Signals**: Used `createSignal` for mobile sidebar state (reactive, performant)
2. **TailwindCSS v4**: Migrated syntax (opacity, important modifier, arbitrary values)
3. **Component Architecture**: Extracted 4 reusable components for maintainability
4. **Testing Strategy**: Component tests (vitest) + E2E tests (Playwright)

### Design Patterns

1. **Mobile-first**: Responsive design starts with mobile, enhances for desktop
2. **Props interfaces**: Explicit TypeScript interfaces for all components
3. **Composition**: Card component accepts children for flexible content
4. **Signal scoping**: State confined to parent component, passed as props

### Performance Considerations

1. **Static data**: Categories/photos arrays defined outside component
2. **Lazy loading**: Can add to below-fold images if needed
3. **Transitions**: CSS-based for GPU acceleration
4. **Signal granularity**: Only mobile sidebar uses reactive state

### Accessibility Improvements

1. **Semantic HTML**: Proper button elements for toggles
2. **ARIA attributes**: aria-label, aria-expanded for screen readers
3. **Keyboard navigation**: All interactive elements focusable
4. **Alt text**: Meaningful descriptions for content images, empty for decorative

---

## Execution Notes for Claude AI

This plan is designed to be executed sequentially by Claude AI with the following workflow:

1. **Review and confirm**: Claude should review the plan and ask for clarification if needed
2. **Step-by-step execution**: Execute each step in order, waiting for user approval between major phases
3. **Code output**: Provide complete code for each file, no truncation
4. **Testing feedback**: After each component, run tests and report results
5. **Issue resolution**: If tests fail, analyze and fix issues before proceeding
6. **User review points**:
   - After Phase 2 (all components created)
   - After Phase 3 (main page complete)
   - After Phase 4 (all tests written)
   - Before Phase 8 (final deployment)

### Commands Reference for Claude

**Run tests**:

```bash
vpr test:comp
vpr test:unit
vpr run test:e2e
```

**Check syntax**:

```bash
vpr check
vpr check:type
```

**Start dev server**:

```bash
vpr dev
```

### Expected Timeline

- Phase 1 (CSS): 5 minutes
- Phase 2 (Components): 20 minutes
- Phase 3 (Main page): 15 minutes
- Phase 4 (Tests): 25 minutes
- Phase 5 (Integration): 10 minutes (manual)
- Phase 6 (Review): 10 minutes
- Phase 7 (Validation): 10 minutes (manual)
- Phase 8 (Deployment): 5 minutes

**Total estimated time**: ~100 minutes (including user review and manual testing)

---

## Success Criteria

The conversion is complete when:

1. ✅ All 4 components created with TypeScript interfaces
2. ✅ Main jedi.tsx page functional with all sections
3. ✅ All component tests passing (14 tests)
4. ✅ All E2E tests passing (12 tests)
5. ✅ Visual appearance matches source project
6. ✅ Mobile responsiveness working (toggle sidebar)
7. ✅ TailwindCSS v4 syntax used throughout
8. ✅ No Alpine.js dependencies remaining
9. ✅ Accessibility standards met (WCAG AA)
10. ✅ Zero console errors in browser
11. ✅ TypeScript compiles without errors
12. ✅ Build succeeds without warnings
