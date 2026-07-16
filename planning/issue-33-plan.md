# #33 build plan — Sidebar cards as listboxes (Categories / Top Photos / Top Captions) + category filter + caption selection

Status: **design (to build with #33)**. Date: 2026-07-14.

Design captured during a brainstorm after the arch-review candidates (C1/#29,
C3, C2) landed and C4 was rejected. It bundles the structural sidebar refactor
with #33's two enhancements and one user-added behavior (caption selection).

## Context

The Jedi route (`src/routes/jedi.tsx`) still renders the whole sidebar inline:
the `<aside>` owns `useListbox` (`jedi.tsx:30-36`) and ~70 lines of markup for
three cards — Categories, Top Photos, Top Captions. C1 (`createJediFeed`) gave
the route a DOM-free view-model seam; C2 (`FeaturedPost`) moved the main article
out. This plan finishes that direction for the sidebar.

The three cards are each a _list + per-item interaction_. All three become full
keyboard-nav **listboxes** (shared a11y via `useListbox`), but the selection
_semantics diverge_: Categories selects a category index (drives the filter), Top
Photos calls `selectPost(id)`, Top Captions calls `selectCaption(id)` — and each
maps its list index to a different entity, with Top Photos additionally carrying a
photo thumbnail. So the right cut is **one dedicated component per card** (each
owns its `useListbox` wiring, its index↔entity mapping, and what selection does),
not a shared row (C4, rejected: thin shared surface) and not a single generic
list (the per-card selection semantics and index↔entity mapping would leak back
in as variant props).

## Goals

1. **Structural** — extract `CategoriesCard`, `TopPhotosCard`, `TopCaptionsCard`;
   move `useListbox` into `CategoriesCard`; reduce the route's `<aside>` to three
   component tags (layout + seam wiring only). Behavior-preserving.
2. **#33-a** — promote **Top Photos and Top Captions** to full listboxes
   (roving-tabindex keyboard nav, `role="option"`), reusing `src/lib/useListbox.ts`
   as Categories does, so all three cards share the same a11y pattern.
3. **#33-b** — filter Top Photos by the current Categories selection, on the seam.
4. **#33-c** — filter Top Captions by the current Top Photos selection, on the seam.
5. **Caption selection (new)** — selecting a Top Caption displays it under the
   post in `<main>`.

## Non-goals

- Real like/edit/delete/comment handlers (still placeholders).
- Real back-end (`jedi-api` stays the mock; ADR-0002).
- Changing the visual design of the cards.

## Component design (three dedicated components, `src/components/`)

Each wraps the existing `Card` for chrome and takes **narrow accessor + callback
props from the `createJediFeed` seam** (not the whole feed) — decoupled and
testable at its own seam, mirroring `FeaturedPost`.

The prop interfaces below are the **end-state** (after all four goals). The step-1
behavior-preserving extraction starts minimal: `TopCaptionsCard` initially takes
only `captions` and keeps today's alert placeholder; its `selectedCaption` /
`onSelect` props arrive with the caption-selection step, and the `useListbox`
wiring with #33-a.

### `CategoriesCard`

```ts
interface CategoriesCardProps {
  categories: Accessor<JediCategory[] | undefined>;
  selectedCategory: Accessor<number>;
  onSelect: (index: number) => void;
}
```

Owns `useListbox({ count, selectedIndex: selectedCategory, onSelect, label:
"Categories", idPrefix: "category" })` internally and renders the option `<li>`s
(moves `jedi.tsx:30-36` + `jedi.tsx:80-99` into the component).

### `TopPhotosCard`

```ts
interface TopPhotosCardProps {
  posts: Accessor<PostView[] | undefined>;
  selectedPost: Accessor<PostView | undefined>;
  onSelect: (id: number) => void;
}
```

Renders the ranked post rows (thumbnail + avatar + name + likes). **#33-a**: owns
its own `useListbox` (roving tabindex, `role="option"`) like `CategoriesCard`,
replacing the plain buttons from #29. Because `useListbox` works in list indices
but the seam selects by id, the card maps internally: `selectedIndex` = index of
`selectedPost()` in `posts()`; `onSelect(index)` → `onSelect(posts()[index].id)`.
Highlights + `aria-current` on `selectedPost()`.

### `TopCaptionsCard`

```ts
interface TopCaptionsCardProps {
  captions: Accessor<CaptionView[] | undefined>;
  selectedCaption: Accessor<CaptionView | undefined>; // for the caption-selection feature
  onSelect: (id: number) => void; // for the caption-selection feature
}
```

Renders the selected post's captions (avatar + name + likes). **#33-a**: owns its
own `useListbox` (roving tabindex, `role="option"`) like the other two cards,
replacing the placeholder alert button. Same index↔id mapping as `TopPhotosCard`:
`selectedIndex` = index of `selectedCaption()` in `captions()`; `onSelect(index)`
→ `onSelect(captions()[index].id)`. Highlights + `aria-current` on
`selectedCaption()`.

Note: Top Photos and Top Captions share the same index↔id listbox adapter shape.
Keep it inline in each card for now; extract a tiny helper only if a third id-keyed
listbox appears (YAGNI — avoid the C4 thin-surface trap).

## Seam changes (`createJediFeed`)

**Already live (preserve, do not rebuild):** Top Captions is already the selected
post's captions ranked by likes desc — `topCaptions` re-keys off `selectedPost()`
and `jediApi.captions.listForPost` sorts `byLikesDesc`:

```ts
const [topCaptions] = createResource(
  () => selectedPost()?.id,
  (postId) => jediApi.captions.listForPost(postId),
);
const winningCaption = () => topCaptions()?.[0];
```

**#33-b — category filter.** `selectedCategory` already lives on the seam. Derive a
filtered posts view keyed off it and hand _that_ to `TopPhotosCard`:

```ts
// selectedCategory() === 0 (or the resolved category id) → filter posts()
const visiblePosts = () => filterByCategory(posts(), categories(), selectedCategory());
```

`TopPhotosCard` renders whatever `posts` accessor it is handed, so filtering is
invisible to the card — it stays presentational. (Exact filter semantics —
including the "all"/default row — decided at build time.)

**Caption selection (new).** Mirror #29's Top-Photo selection exactly:

```ts
const [selectedCaptionId, setSelectedCaptionId] = createSignal<number | undefined>();
const selectedCaption = (): CaptionView | undefined =>
  topCaptions()?.find((c) => c.id === selectedCaptionId()) ?? winningCaption();
const selectCaption = (id: number): void => setSelectedCaptionId(id);
```

`selectedCaption` falls back to `winningCaption` and **self-resets** when the post
changes (the old caption id is absent from the new post's captions → falls back),
the same trick `selectedPost` uses against `featured`. `<main>` then renders
`caption={selectedCaption()}` instead of `winningCaption()` (the `FeaturedPost`
`{ post, caption }` interface is unchanged).

## Route after

`useListbox` import + call leave the route. The `<aside>` inner becomes:

```tsx
<CategoriesCard categories={categories} selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
<TopPhotosCard posts={visiblePosts} selectedPost={selectedPost} onSelect={selectPost} />
<TopCaptionsCard captions={topCaptions} selectedCaption={selectedCaption} onSelect={selectCaption} />
```

and `<main>`’s `FeaturedPost` takes `caption={selectedCaption()}`.

## Testing

- One component test per card at its props seam (like `FeaturedPost.test.tsx`):
  - `CategoriesCard` — renders category names, `role="listbox"`, selection highlight.
  - `TopPhotosCard` — renders posts, `role="listbox"`, row click calls `onSelect`,
    `aria-current` on selected; keyboard nav once #33-a lands.
  - `TopCaptionsCard` — renders captions, `role="listbox"`, row click calls
    `onSelect`, `aria-current` on selected; keyboard nav once #33-a lands.
- Seam tests (`createJediFeed.unit.test.ts`) for `visiblePosts` filtering and
  `selectedCaption` (default = winning, `selectCaption` switches, self-resets on
  post change) — DOM-free, TDD at the seam.
- The existing `jedi.test.tsx` stays green as the behavior-preserving safety net.

## Suggested sequencing (at build time)

1. Structural extraction (behavior-preserving): three cards + move `useListbox`.
   Route shrinks; all existing tests stay green.
2. Caption selection: seam (`selectedCaption`/`selectCaption`) → `TopCaptionsCard`
   interaction → `<main>` renders `selectedCaption()`.
3. #33-a: `TopPhotosCard` and `TopCaptionsCard` → full listboxes.
4. #33-b: `visiblePosts` category filter on the seam.
5. #33-c: `visibleCaptions` post filter on the seam.

Each step is independently shippable and testable.

## Issue tracking

Issue #33 is used for tracking.

---

## Execution log

❯ /implement #33 be concise

⏺ Built 2026-07-15. All five goals landed; `vpr check` clean, 249 tests pass.

**Build-time decisions** (the plan left filter semantics open):

- **"All" row.** `categories()` on the seam now returns a synthetic
  `{ id: 0, name: "All", icon: "menu" }` row ahead of the real categories, so
  `selectedCategory` index 0 means _no filter_ and the default view is unfiltered.
  Id 0 is unused by the real categories. The seam exposes one accessor, not a raw
  list plus an options list.
- **Selection follows the filter.** `selectedPost` falls back to the first
  _visible_ post (`visible?.find(id) ?? visible?.[0] ?? featured()`), so a filter
  that hides the selection moves `<main>` to a post the sidebar actually lists.

**Deviation from the suggested sequencing:** steps 1 and 3 were merged — each card
was extracted _as_ a listbox rather than extracted first and promoted after, so the
card tests were written once against the end-state props instead of being rewritten.

**Known gaps** (observed by driving the app, out of scope here):

- Categories with no posts (People, Abstract, Black & White — 3 of 6) render an
  empty Top Photos card with no empty-state message, and `<main>` falls back to
  `featured()`, a post the empty list does not contain. Worth a follow-up.
- Caption selection resurrects per post: the `selectedCaptionId` signal survives a
  post change, so returning to a post whose caption you had picked re-selects it.
  Falls out of the specified `find(...) ?? winningCaption()` fallback. The same is
  true of `selectedPostId` across a filter round-trip — select a post, filter it
  away, return to "All", and it reclaims the selection. Both are inherent to the
  `find(...) ?? fallback` shape this plan specified; neither is a bug, but neither
  was designed for either.
- `winningCaption` now has no production caller — `<main>` reads `selectedCaption`
  and nothing else reads the winner directly. It stays on the `JediFeed` interface
  as documented seam vocabulary, exercised only by unit tests. Prune if it is still
  unread after the next feed change.

**Terminology correction:** this plan and issue #33-a both say the cards get
"roving-tabindex" keyboard nav. They do not, and should not — `useListbox` is the
**`aria-activedescendant`** pattern (`tabIndex: 0` on the `<ul>`, `-1` on every
option, focus tracked by `aria-activedescendant`). The cards reuse it faithfully,
which is what the rest of that same sentence asks for ("reusing `src/lib/useListbox.ts`
as Categories does"). All three cards do share one a11y pattern — just not the one
the label names.
