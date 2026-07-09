# Issue #13 — Jedi: Standardize data structures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Phases follow the project convention: skip `[√]`, execute the first `[ ]`, final phase is **(User)**.

**Goal:** Replace every hard-coded value on the `/jedi` page with a back-end-faithful JSON mock served through an RPC-shaped async seam, and route all external URLs through the existing sanitizer at that seam.

**Architecture:** Normalized JSON (`users`, `categories`, `posts`, `captions`, `comments`) in one `src/lib/jedi/data.json`. A seam `src/lib/jedi/jedi-api.ts` (mirroring `src/lib/backend-rpc.ts`) joins `owner_id`→author, resolves `category_ids`, derives `commentCount`, ranks the "Top" views, and sanitizes every URL. Components consume it via `createResource`, exactly as `AgentManager` consumes `backendRpc`. Swapping to the real back-end later replaces each seam body with an `rpcCall(...)` — components untouched.

**Tech Stack:** SolidStart (SSR) · SolidJS `createResource`/`For`/`Show` · TypeScript · Vite+ (`vp`/`vpr`) · Vitest (`vite-plus/test`, jsdom) · `@solidjs/testing-library`.

**Design provenance:** grilled in this session; recorded in `CONTEXT.md` (Jedi glossary) and `docs/adr/0002-jedi-mock-data-contract.md`. Interactions (click-to-select, category filtering) are **out of scope → issue #29**.

## Global Constraints

- Runtime **Bun**; run project scripts with **`vpr <script>`** (never npm/pnpm/yarn/bun directly).
- Verify with: `vpr test:unit` (src/lib), `vpr test:all` (all unit+comp), `vpr check:type` (tsc), `vpr check` (lint/format **--fix, mutates** — use last), `vpr build`.
- **e2e (`vpr test:e2e`) requires the back-end at `:8080`** → **User** phase only; Claude phases must not run it.
- Tailwind v4: custom-property syntax `text-(--var)`, **not** arbitrary `text-[var(--var)]`; **no `dark` class**; style via theme variables.
- Signals named `[value, setValue]`; static data arrays live **outside** the component; Props interfaces `<Component>Props`; components PascalCase; imports ordered external → internal → components.
- Output **complete code** per file (no truncation). If a test fails, fix root cause — never skip.

---

## Decisions locked (grilling)

- **Post IS the photo** — no separate Photo entity; "Top Photos" = Posts ranked by `likeCount`.
- **Many Captions per Post** (`caption.post_id`); the article shows the **winning** (top-liked) caption. "Top Captions" = a post's captions ranked.
- **Tags == Categories** (many-to-many via `category_ids`); **"Cute" is added** as a Category. Article chips render `category.name` (no icon); the sidebar renders the icon.
- **Top Photos / Top Captions are derived views**, not stored lists.
- **Author normalized**: `users` is the source of truth; the seam joins `owner_id`→author and embeds an author snapshot in responses.
- **Row shape**: `id` + FKs + domain/display fields + counts only; **number ids**; **no** `bigint`/audit columns.
- **Sanitize at the seam** (single boundary) with the existing `sanitizeUrl`; keep the shared components' own calls as idempotent defense-in-depth.
- **Out of scope (noted):** Hero page-chrome content and `JediNav`'s current-user profile avatar (an auth concept) stay hard-coded; candidates for a follow-up.

## File structure

```
Create:  src/types/jedi.ts                      # entity (storage) + *View (response) types
Create:  src/lib/jedi/data.json                 # 5 normalized collections (the mock DB)
Create:  src/lib/jedi/jedi-api.ts               # RPC-shaped seam: join + rank + derive + sanitize
Create:  src/lib/jedi/jedi-api.unit.test.ts     # unit tests for the seam
Create:  src/routes/jedi.test.tsx               # jsdom component test gating the rewire
Modify:  src/routes/jedi.tsx                     # remove hard-coded data → consume jedi-api
Modify:  tsconfig.json                           # add resolveJsonModule
```

---

## [ ] Phase 1 (Claude): Data layer — types, seed, seam, unit-tested

**Deliverable:** a fully unit-tested `jediApi`. Gate: `vpr test:unit` green + `vpr check:type` clean.

### Task 1.1: Enable JSON imports + entity/response types

**Files:** Modify `tsconfig.json`; Create `src/types/jedi.ts`.

**Interfaces produced (later tasks rely on these exact names):**
`JediUser, JediCategory, JediPost, JediCaption, JediComment, JediData` (storage) and `AuthorRef, PostView, CaptionView` (response).

- [ ] **Step 1: Enable `resolveJsonModule`** (it is absent today; JSON import won't type-check without it).

In `tsconfig.json`, add the line inside `compilerOptions` (after `"esModuleInterop": true,`):

```jsonc
    "resolveJsonModule": true,
```

- [ ] **Step 2: Create `src/types/jedi.ts`**

```ts
import type { IconName } from "~/components/Icon";

/* ---- Storage shapes: one object per row, mirroring a future DB table. ----
   IDs are plain numbers (JSON has no bigint; the RPC wire format is numeric). */

export interface JediUser {
  id: number;
  name: string;
  avatarUrl: string;
}

export interface JediCategory {
  id: number;
  name: string;
  icon: IconName;
}

export interface JediPost {
  id: number;
  owner_id: number;
  title: string;
  imageSrc: string;
  imageAlt: string;
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
  category_ids: number[];
  likeCount: number;
}

export interface JediCaption {
  id: number;
  post_id: number;
  owner_id: number;
  text: string;
  likeCount: number;
}

export interface JediComment {
  id: number;
  post_id: number;
  owner_id: number;
  body: string;
}

export interface JediData {
  users: JediUser[];
  categories: JediCategory[];
  posts: JediPost[];
  captions: JediCaption[];
  comments: JediComment[];
}

/* ---- Response shapes: what jedi-api returns (author joined, categories
   resolved, counts derived, URLs sanitized). The contract components consume. */

export interface AuthorRef {
  id: number;
  name: string;
  avatarUrl: string;
}

export interface PostView {
  id: number;
  author: AuthorRef;
  title: string;
  imageSrc: string;
  imageAlt: string;
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
  categories: JediCategory[];
  likeCount: number;
  commentCount: number;
}

export interface CaptionView {
  id: number;
  postId: number;
  author: AuthorRef;
  text: string;
  likeCount: number;
}
```

- [ ] **Step 3: Verify types compile**

Run: `vpr check:type`
Expected: PASS (no errors). `src/types/jedi.ts` compiles standalone.

### Task 1.2: Seed the mock database

**Files:** Create `src/lib/jedi/data.json`.

**Note:** Post 2's `photographer`/`photographerUrl`/`sourceUrl` are valid-but-stand-in — only the featured Post 1's attribution renders in #13. `commentCount` is **not stored** (derived from `comments`). Seed keeps today's rendered content (`Little Jedi`, `Jedi Kitty protects the street`, `Lisa`, `Animals`, `Cute`, `Landscape`) so e2e stays green, and makes the Top Photos/Captions numbers self-consistent.

- [ ] **Step 1: Create `src/lib/jedi/data.json`**

```json
{
  "users": [
    {
      "id": 1,
      "name": "Lisa",
      "avatarUrl": "https://img.icons8.com/doodle/96/null/lisa-simpson.png"
    },
    {
      "id": 2,
      "name": "Homer",
      "avatarUrl": "https://img.icons8.com/doodle/96/null/homer-simpson.png"
    },
    {
      "id": 3,
      "name": "Bart",
      "avatarUrl": "https://img.icons8.com/doodle/96/null/bart-simpson.png"
    }
  ],
  "categories": [
    { "id": 1, "name": "Landscape", "icon": "landscape" },
    { "id": 2, "name": "People", "icon": "portrait" },
    { "id": 3, "name": "Animals", "icon": "dog" },
    { "id": 4, "name": "Abstract", "icon": "collage" },
    { "id": 5, "name": "Black & White", "icon": "180-degrees" },
    { "id": 6, "name": "Cute", "icon": "fire-heart" }
  ],
  "posts": [
    {
      "id": 1,
      "owner_id": 1,
      "title": "Little Jedi",
      "imageSrc": "https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg",
      "imageAlt": "Little Jedi cat",
      "photographer": "Felicity Berkleef",
      "photographerUrl": "https://www.flickr.com/photos/felicefelines/",
      "sourceUrl": "https://www.flickr.com/photos/felicefelines/50618365686/",
      "category_ids": [3, 6],
      "likeCount": 5
    },
    {
      "id": 2,
      "owner_id": 2,
      "title": "Brilliant tree",
      "imageSrc": "https://live.staticflickr.com/7374/9311425598_46cfda9977_c.jpg",
      "imageAlt": "Brilliant tree",
      "photographer": "Sunsword & Moonsabre",
      "photographerUrl": "https://www.flickr.com/photos/sunsward7/",
      "sourceUrl": "https://www.flickr.com/photos/sunsward7/9311425598/",
      "category_ids": [1],
      "likeCount": 4
    }
  ],
  "captions": [
    {
      "id": 1,
      "post_id": 1,
      "owner_id": 1,
      "text": "Jedi Kitty protects the street",
      "likeCount": 8
    },
    { "id": 2, "post_id": 1, "owner_id": 3, "text": "May the paws be with you", "likeCount": 5 },
    { "id": 3, "post_id": 2, "owner_id": 2, "text": "Nature's cathedral", "likeCount": 2 }
  ],
  "comments": [
    { "id": 1, "post_id": 1, "owner_id": 2, "body": "D'oh! Adorable." },
    { "id": 2, "post_id": 1, "owner_id": 3, "body": "Cowabunga!" },
    { "id": 3, "post_id": 1, "owner_id": 1, "body": "Thanks everyone!" }
  ]
}
```

### Task 1.3: The `jedi-api` seam (TDD)

**Files:** Create `src/lib/jedi/jedi-api.ts`; Create `src/lib/jedi/jedi-api.unit.test.ts`.

**Interfaces produced (Phase 2 consumes these):**

- `jediApi.categories.list(): Promise<JediCategory[]>`
- `jediApi.posts.list(): Promise<PostView[]>` — ranked by `likeCount` desc (Top Photos)
- `jediApi.posts.featured(): Promise<PostView>` — the top-ranked post
- `jediApi.captions.listForPost(postId: number): Promise<CaptionView[]>` — ranked desc (Top Captions)

- [ ] **Step 1: Write the failing test** — `src/lib/jedi/jedi-api.unit.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";

// Pass-through spy: lets us assert every URL field is routed through the
// sanitizer, without re-testing sanitizeUrl (it has its own unit tests).
vi.mock("~/lib/sanitizeUrl", () => ({ sanitizeUrl: vi.fn((u: string) => u) }));

import { sanitizeUrl } from "~/lib/sanitizeUrl";
import { ICON_NAMES } from "~/components/Icon";
import { jediApi } from "./jedi-api";

const sanitizeSpy = sanitizeUrl as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => sanitizeSpy.mockClear());

describe("jediApi.categories", () => {
  it("lists all categories including the added 'Cute'", async () => {
    const cats = await jediApi.categories.list();
    expect(cats.map((c) => c.name)).toEqual([
      "Landscape",
      "People",
      "Animals",
      "Abstract",
      "Black & White",
      "Cute",
    ]);
  });

  it("every category icon is a real sprite name", async () => {
    const cats = await jediApi.categories.list();
    for (const c of cats) expect(ICON_NAMES).toContain(c.icon);
  });
});

describe("jediApi.posts", () => {
  it("ranks posts by likeCount desc (Top Photos order)", async () => {
    const posts = await jediApi.posts.list();
    const likes = posts.map((p) => p.likeCount);
    expect(likes).toEqual([...likes].sort((a, b) => b - a));
    expect(posts[0].title).toBe("Little Jedi");
  });

  it("embeds the author snapshot joined from users", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.author).toEqual({
      id: 1,
      name: "Lisa",
      avatarUrl: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    });
  });

  it("resolves category_ids to full categories (tags == categories)", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.categories.map((c) => c.name)).toEqual(["Animals", "Cute"]);
  });

  it("derives commentCount from the comments collection", async () => {
    const [first] = await jediApi.posts.list();
    expect(first.commentCount).toBe(3);
  });

  it("featured() returns the top-ranked post", async () => {
    const featured = await jediApi.posts.featured();
    expect(featured.id).toBe(1);
    expect(featured.title).toBe("Little Jedi");
  });

  it("routes every URL field through the sanitizer (single boundary)", async () => {
    const [post] = await jediApi.posts.list();
    const args = sanitizeSpy.mock.calls.flat();
    expect(args).toContain(post.imageSrc);
    expect(args).toContain(post.photographerUrl);
    expect(args).toContain(post.sourceUrl);
    expect(args).toContain(post.author.avatarUrl);
  });
});

describe("jediApi.captions", () => {
  it("ranks a post's captions by likeCount desc (Top Captions)", async () => {
    const caps = await jediApi.captions.listForPost(1);
    expect(caps.map((c) => c.likeCount)).toEqual([8, 5]);
    expect(caps[0].text).toBe("Jedi Kitty protects the street");
    expect(caps[0].author.name).toBe("Lisa");
  });

  it("returns [] for a post with no captions", async () => {
    expect(await jediApi.captions.listForPost(999)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `vpr test:unit -t "jediApi"`
Expected: FAIL — cannot resolve `./jedi-api` (module not yet created).

- [ ] **Step 3: Write the seam** — `src/lib/jedi/jedi-api.ts`

```ts
import data from "./data.json";
import { sanitizeUrl } from "~/lib/sanitizeUrl";
import type {
  JediData,
  JediPost,
  JediCaption,
  JediCategory,
  AuthorRef,
  PostView,
  CaptionView,
} from "~/types/jedi";

// data.json widens `icon` to `string`; the unit test asserts every
// icon is a real sprite name, so this once-only boundary cast is safe.
const db = data as unknown as JediData;

/** Drop any URL the shared sanitizer rejects (javascript:/data:/etc.). */
const safe = (url: string): string => sanitizeUrl(url) ?? "";

const byLikesDesc = <T extends { likeCount: number }>(a: T, b: T): number =>
  b.likeCount - a.likeCount;

function authorOf(ownerId: number): AuthorRef {
  const u = db.users.find((x) => x.id === ownerId);
  if (!u) throw new Error(`jedi-api: unknown user id ${ownerId}`);
  return { id: u.id, name: u.name, avatarUrl: safe(u.avatarUrl) };
}

function categoriesOf(ids: number[]): JediCategory[] {
  return ids.map((id) => {
    const c = db.categories.find((x) => x.id === id);
    if (!c) throw new Error(`jedi-api: unknown category id ${id}`);
    return c;
  });
}

const commentCountOf = (postId: number): number =>
  db.comments.filter((c) => c.post_id === postId).length;

const toPostView = (p: JediPost): PostView => ({
  id: p.id,
  author: authorOf(p.owner_id),
  title: p.title,
  imageSrc: safe(p.imageSrc),
  imageAlt: p.imageAlt,
  photographer: p.photographer,
  photographerUrl: safe(p.photographerUrl),
  sourceUrl: safe(p.sourceUrl),
  categories: categoriesOf(p.category_ids),
  likeCount: p.likeCount,
  commentCount: commentCountOf(p.id),
});

const toCaptionView = (c: JediCaption): CaptionView => ({
  id: c.id,
  postId: c.post_id,
  author: authorOf(c.owner_id),
  text: c.text,
  likeCount: c.likeCount,
});

const rankedPosts = (): PostView[] => db.posts.map(toPostView).sort(byLikesDesc);

/**
 * RPC-shaped mock. Swapping to the real back-end later replaces each body with a
 * `rpcCall(...)` (see src/lib/backend-rpc.ts); the signatures stay identical.
 */
export const jediApi = {
  categories: {
    list: (): Promise<JediCategory[]> => Promise.resolve(db.categories),
  },
  posts: {
    list: (): Promise<PostView[]> => Promise.resolve(rankedPosts()),
    featured: (): Promise<PostView> => Promise.resolve(rankedPosts()[0]),
  },
  captions: {
    listForPost: (postId: number): Promise<CaptionView[]> =>
      Promise.resolve(
        db.captions
          .filter((c) => c.post_id === postId)
          .map(toCaptionView)
          .sort(byLikesDesc),
      ),
  },
};
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `vpr test:unit -t "jediApi"`
Expected: PASS (all cases).

- [ ] **Step 5: Type-check**

Run: `vpr check:type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json src/types/jedi.ts src/lib/jedi/data.json src/lib/jedi/jedi-api.ts src/lib/jedi/jedi-api.unit.test.ts
git commit -m "feat(jedi): back-end-faithful mock data + RPC-shaped jedi-api seam (#13)"
```

---

## [ ] Phase 2 (Claude): Rewire the `/jedi` route to consume `jedi-api`

**Deliverable:** `src/routes/jedi.tsx` with **zero hard-coded Post/Category/Top data**, gated by a jsdom component test. Gate: `vpr test:all` green + no data left + `vpr check` + `vpr build`.

### Task 2.1: Component test that drives the rewire (TDD)

**Files:** Create `src/routes/jedi.test.tsx`.

**Consumes:** `jediApi` from Task 1.3 (indirectly, via `src/routes/jedi.tsx`).

The **red** assertion is "Cute in the sidebar": today `Cute` is only an article chip (1 occurrence); after the rewire it is also a sidebar Category row (≥2). The other assertions are regression guards that must stay green across the refactor.

- [ ] **Step 1: Write the test** — `src/routes/jedi.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { MetaProvider } from "@solidjs/meta";
import Jedi from "./jedi";

function setupMatchMedia(mobile: boolean) {
  const mql = { matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
}

const renderJedi = () =>
  render(() => (
    <MetaProvider>
      <Jedi />
    </MetaProvider>
  ));

describe("Jedi route (data-driven from jedi-api)", () => {
  beforeEach(() => setupMatchMedia(false)); // desktop
  afterEach(() => vi.restoreAllMocks());

  it("renders the featured post from the mock", async () => {
    renderJedi();
    expect(await screen.findByRole("heading", { name: /little jedi/i })).toBeInTheDocument();
    expect(await screen.findByText(/jedi kitty protects the street/i)).toBeInTheDocument();
  });

  it("renders the featured post's category chips (tags == categories)", async () => {
    renderJedi();
    expect(await screen.findByRole("button", { name: /^Animals$/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Cute$/ })).toBeInTheDocument();
  });

  // RED driver: Cute must now appear as a sidebar Category row *and* an article chip.
  it("adds 'Cute' as a sidebar Category (not only an article chip)", async () => {
    renderJedi();
    await screen.findByRole("heading", { name: /little jedi/i }); // wait for load
    const cute = await screen.findAllByText("Cute");
    expect(cute.length).toBeGreaterThanOrEqual(2);
  });

  it("renders Top Photos and Top Captions from the mock", async () => {
    renderJedi();
    expect(await screen.findByText(/\(8 Likes\)/)).toBeInTheDocument();
    expect(await screen.findByText(/\(4 Likes\)/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test — verify the RED case fails**

Run: `vpr test:all -t "Jedi route"`
Expected: FAIL on "adds 'Cute' as a sidebar Category" (`length` is 1 against current hard-coded `jedi.tsx`). The other three pass.

### Task 2.2: Rewrite `src/routes/jedi.tsx` data-driven

**Files:** Modify `src/routes/jedi.tsx` (full replacement below).

**Consumes:** `jediApi` (Task 1.3). **Preserves** every class, handler, and a11y label from the current file; only the data source changes. The three `const` arrays and all inline Post literals are gone.

- [ ] **Step 1: Replace the entire file contents**

```tsx
import "@fontsource/lobster";
import "./jedi.css";
import { Title, Meta } from "@solidjs/meta";
import { createSignal, createResource, For, Show } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useListbox } from "~/lib/useListbox";
import { useDismiss } from "~/lib/useDismiss";
import { jediApi } from "~/lib/jedi/jedi-api";
import Hero from "~/components/Hero";
import JediNav from "~/components/JediNav";
import Image from "~/components/Image";
import Author from "~/components/Author";
import Card from "~/components/Card";
import Icon from "~/components/Icon";

export default function Jedi() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false);
  const [selectedCategory, setSelectedCategory] = createSignal(0);

  const [categories] = createResource(() => jediApi.categories.list());
  const [posts] = createResource(() => jediApi.posts.list());
  const [featured] = createResource(() => jediApi.posts.featured());
  const [topCaptions] = createResource(
    () => featured()?.id,
    (postId) => jediApi.captions.listForPost(postId),
  );
  const winningCaption = () => topCaptions()?.[0];

  const isMobile = useIsMobile();
  const { listboxProps, getOptionProps, focusedIndex } = useListbox({
    count: () => categories()?.length ?? 0,
    selectedIndex: selectedCategory,
    onSelect: setSelectedCategory,
    label: "Categories",
    idPrefix: "category",
  });
  const isLiked = () => false;
  useDismiss(() => setMobileSidebarOpen(false), mobileSidebarOpen);

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
            class="flex items-center font-bold text-(--theme-card-fg) bg-(--theme-card-bg) hover:text-(--theme-hover-fg) hover:bg-(--theme-hover-bg) rounded-lg p-3"
          >
            <span>Categories</span>
            <Icon
              name="expand-arrow"
              class={`w-4 h-4 ml-1.5 transition-transform ${mobileSidebarOpen() ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Main article */}
        <main class="col-span-full md:col-span-2 mx-5pct md:mx-10pct order-2 md:order-1">
          <Show when={featured()} fallback={<article class="card-style p-4">Loading…</article>}>
            {(post) => (
              <article class="card-style">
                {/* Title bar */}
                <div class="flex items-center justify-between px-4 h-14">
                  <h2 class="text-2xl font-bold w-1/2 truncate">{post().title}</h2>
                  <div class="text-sm text-(--theme-muted)">
                    flickr @{" "}
                    <a
                      href={post().photographerUrl}
                      class="hover:underline rounded"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {post().photographer}
                    </a>
                  </div>
                </div>
                {/* Image */}
                <Image
                  src={post().imageSrc}
                  alt={post().imageAlt}
                  href={post().sourceUrl}
                  loading="lazy"
                />
                {/* Body: author, caption, tags, actions */}
                <div class="p-4 pb-2">
                  <Author
                    avatarSrc={post().author.avatarUrl}
                    name={post().author.name}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert("Not implemented");
                    }}
                  />
                  <p class="text-5xl mb-10 px-4 font-hero">{winningCaption()?.text ?? ""}</p>
                  <div class="flex items-center gap-2 text-sm mb-5">
                    <For each={post().categories}>
                      {(c) => (
                        <button type="button" onClick={() => {}} class="theme-button">
                          {c.name}
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="flex items-center justify-between text-sm px-2">
                    <a
                      class="font-bold hover:underline rounded"
                      href="#"
                      aria-label={`Open Comments page, ${post().commentCount} comments`}
                      onClick={(e) => {
                        e.preventDefault();
                        alert("Not implemented");
                      }}
                    >
                      Comments
                      <span class="font-light text-(--theme-card-fg) ml-2">
                        {post().commentCount}
                      </span>
                    </a>
                    <div class="flex items-center gap-4">
                      <div class="flex items-center gap-1">
                        <Icon name="fire-heart" class="w-5 -mt-1" />
                        <span class="font-light text-(--theme-card-fg) ml-2">
                          <span class="sr-only">Likes: </span>
                          {post().likeCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {}}
                        class="theme-button"
                        aria-pressed={isLiked()}
                        aria-label={`Like post by ${post().author.name}`}
                      >
                        Like
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        class="theme-button"
                        aria-label={`Edit Post by ${post().author.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        class="theme-button"
                        aria-label={`Delete Post by ${post().author.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}
          </Show>
        </main>

        {/* Sidebar — grid-rows collapse: aside is nested grid inside parent grid-cols-3 */}
        <aside
          inert={isMobile() && !mobileSidebarOpen()}
          class={`col-span-full md:col-span-1 mx-5pct md:mr-20pct order-1 md:order-2 grid transition-[grid-template-rows,opacity] duration-300 ease-out md:opacity-100 md:grid-rows-[1fr] ${mobileSidebarOpen() ? "opacity-100 grid-rows-[1fr]" : "opacity-0 grid-rows-[0fr]"}`}
        >
          <div class="overflow-hidden min-h-0 md:overflow-visible">
            <Card title="Categories">
              <ul class="space-y-1" {...listboxProps}>
                <For each={categories() ?? []}>
                  {(c, index) => (
                    <li
                      {...getOptionProps(index())}
                      classList={{
                        "bg-(--theme-highlight)": selectedCategory() === index(),
                        "ring-2": focusedIndex() === index(),
                        "ring-(--theme-accent)": focusedIndex() === index(),
                      }}
                      class="flex items-center cursor-pointer px-2 py-1 rounded outline-none"
                    >
                      <Icon name={c.icon} class="w-8 h-8 object-cover mr-2" />
                      <span class="font-bold text-sm">{c.name}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
            <Card title="Top Photos">
              <ul class="space-y-1">
                <For each={posts() ?? []}>
                  {(p) => (
                    <li class="rounded-md">
                      <button
                        type="button"
                        onClick={() => alert("Not implemented")}
                        class="flex items-center p-2 rounded hover:bg-(--theme-hover-bg) transition-colors duration-150"
                      >
                        <img
                          class="w-10 h-10 rounded-lg object-cover mr-3"
                          src={p.imageSrc}
                          alt={p.imageAlt}
                          loading="lazy"
                        />
                        <img
                          class="w-6 h-6 rounded-full object-cover mr-0.5"
                          src={p.author.avatarUrl}
                          alt=""
                          loading="lazy"
                        />
                        <span class="font-bold text-sm mr-1">{p.author.name}</span>
                        <span class="text-sm font-light text-(--theme-card-fg)">
                          ({p.likeCount} Likes)
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
            <Card title="Top Captions">
              <ul class="space-y-1">
                <For each={topCaptions() ?? []}>
                  {(c) => (
                    <li class="rounded-md">
                      <button
                        type="button"
                        onClick={() => alert("Not implemented")}
                        class="flex items-center p-2 rounded hover:bg-(--theme-hover-bg) transition-colors duration-150"
                      >
                        <img
                          class="w-8 h-8 rounded-full object-cover mr-1"
                          src={c.author.avatarUrl}
                          alt=""
                          loading="lazy"
                        />
                        <span class="font-bold text-sm mr-1">{c.author.name}</span>
                        <span class="text-sm font-light text-(--theme-card-fg)">
                          ({c.likeCount} Likes)
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
          </div>
        </aside>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Run the component test — verify all pass**

Run: `vpr test:all -t "Jedi route"`
Expected: PASS (all four, including the previously-red "Cute" case).

- [ ] **Step 3: Prove no hard-coded page data remains**

Run: `grep -nE "Jedi Kitty|staticflickr|icons8|felicefelines|TOP_PHOTOS|TOP_CAPTIONS|CATEGORIES" src/routes/jedi.tsx`
Expected: only the **Hero `backgroundImage`** staticflickr URL (intentionally out of scope). No caption text, no author avatars, no `TOP_*`/`CATEGORIES` consts.

### Task 2.3: Full-suite verification

- [ ] **Step 1: All unit + component tests**

Run: `vpr test:all`
Expected: PASS (new jedi-api + jedi route tests green; existing suites unaffected).

- [ ] **Step 2: Lint/format/type (mutates)**

Run: `vpr check`
Expected: PASS (auto-fixes formatting). Re-run `vpr test:all` if it changed files.

- [ ] **Step 3: Production build**

Run: `vpr build`
Expected: build succeeds (JSON import bundles; route compiles under SSR).

- [ ] **Step 4: Commit**

```bash
git add src/routes/jedi.tsx src/routes/jedi.test.tsx
git commit -m "feat(jedi): render /jedi from jedi-api mock; add Cute category (#13)"
```

---

## [ ] Phase 3 (User): Manual validation

Automated Claude phases cannot run e2e (needs the back-end at `:8080`). Validate manually:

- [ ] **Start the back-end** at `:8080` (external repo).
- [ ] **Run e2e:** `vpr test:e2e` → all `e2e/jedi.spec.ts` cases pass (title, article `Little Jedi` + `Jedi Kitty protects`, sidebar `Landscape`/`Animals`, chips `Animals`/`Cute`, three sidebar cards, nav/footer/theme).
- [ ] **Visual check** (`vpr dev`, open `/jedi`, light **and** dark):
  - Article renders Little Jedi photo, winning caption, `Lisa`, `Animals`+`Cute` chips, comment count `3`, like count `5`.
  - Sidebar Categories now lists **Cute** (6th) — confirm the `fire-heart` icon reads acceptably, or change `data.json` `categories[5].icon`.
  - Top Photos (Little Jedi/Lisa, Brilliant tree/Homer) and Top Captions (Lisa 8, Bart 5) render.
  - Mobile (<768px): sidebar toggle works; `aside` inert when closed.
- [ ] **Confirm scope**: decide whether the Hero content and `JediNav` profile avatar should be externalized in a follow-up (intentionally deferred here).

---

## Coverage check (plan vs. issue #13)

```pre
| -------------------------------------| --------------------------------------------- |
| #13 requirement                      | Where                                         |
| -------------------------------------| --------------------------------------------- |
| External JSON for Posts, Categories, | Task 1.2 `data.json` + Task 1.3 derived views |
| Top Photos, Top Captions             | (`posts.list`/`captions.listForPost`)         |
| -------------------------------------| --------------------------------------------- |
| Include comments (#) and likes (#)   | `likeCount` fields + derived `commentCount`   |
|                                      | (Task 1.2/1.3)                                |
| -------------------------------------| --------------------------------------------- |
| Replace **all** hard-coded data      | Task 2.2 rewrite + Task 2.2 Step 3 grep guard |
| -------------------------------------| --------------------------------------------- |
| DB-anticipating; external for dev    | RPC-shaped `jedi-api` seam (Task 1.3) +       |
| w/o back-end                         | ADR-0002                                      |
| -------------------------------------| --------------------------------------------- |
| Sanitize all external URLs           | `safe()` boundary in `jedi-api` (Task 1.3)    |
|                                      | + spy test                                    |
| -------------------------------------| --------------------------------------------- |
```
