# Conversation navigator is a single-open accordion of disclosure + listbox, not a `role=tree`

Issue #47 asks the live-conversation page to become an "expandable tree structure"
of Agents → Conversations that is ARIA-compliant and follows the Jedi page's
standards. A two-level Agent→Conversation hierarchy could be a canonical WAI
`role=tree`/`treeitem`/`group` with one roving tabindex and Left/Right
expand-collapse, but we instead model it as a **single-open accordion**: each Agent
is a disclosure `<button aria-expanded>` (as Jedi's sidebar toggle already is,
`src/routes/jedi.tsx:50-51`), and the one open Agent's Conversations render as a
`useListbox` (`src/lib/useListbox.ts`) — which already supplies `role="listbox"`/
`"option"`, `aria-selected`, Arrow/Home/End/Enter navigation, and the house
selection-vs-focus discipline (`bg-(--theme-highlight)` selection plus the
keyboard-only `ring-(--theme-accent)` active ring, #37/#38). On mobile the whole
navigator collapses into a `useDisclosure` drawer, exactly as the Jedi sidebar does.
Because the accordion keeps exactly one Agent open, "which Agent is expanded" is
just the existing `selectedAgent` signal (`src/lib/conversationWorkspace.ts`), so no
new tree-state and no new tree primitive is introduced.

## Considered and rejected

- **Canonical `role=tree` with a new `useTree` primitive** — rejected: it cannot
  reuse `useListbox`, so it would re-implement the roving focus, `aria-activedescendant`,
  and the #37/#38 selection/focus-ring modality discipline that `useListbox` already
  gets right, plus the flattened-node Up/Down and Left/Right collapse logic — a large
  new accessibility surface to build and test. Its headline payoff, fluid
  arrow-navigation across several _simultaneously_ expanded branches, is exactly what
  the single-open accordion removes, so we would pay for canonical semantics we never
  exercise.
- **Multi-expand tree** (several Agents open at once) — rejected: it would force
  per-Agent conversation loading in place of the single `selectedAgent`-keyed `convs`
  resource (`src/lib/conversationWorkspace.ts:38-43`), and a taller, busier sidebar
  works against this refactor's central goal of an enlarged message pane.

## Consequences

- A screen reader is not _told_ that a Conversation sits under its Agent — it hears a
  disclosure button, then a separate listbox; the depth a `role=tree` announces
  (level, set size, position-in-level) is conveyed structurally and visually, not
  semantically. Acceptable for a two-level, open-one-then-read flow; revisit if the
  hierarchy ever deepens past Agent→Conversation.
- The navigator stays consistent with Jedi's documented listbox pattern (`CONTEXT.md`,
  "Sidebar selection & focus"), so a future fix to the shared selection/focus behaviour
  in `useListbox` lands on both pages at once.

## `useDisclosure` returns spreadable props, with `drawer` / `popup` modes (#55 C5)

`useDisclosure` originally returned raw state (`open`, `toggle`, `inert`), so every
call site re-hand-wired the same `aria-expanded` / `aria-controls` / `id` / `inert`
wiring — and did it inconsistently (two of four sites omitted the `aria-controls`↔`id`
link). It now returns two spreadable prop bags matching `useListbox`'s shape:
`triggerProps` (`aria-expanded`, `aria-controls`, `onClick`) and `panelProps`
(`id`, `inert`), while still exposing `open()`/`toggle()` for the site-specific paint
(each panel animates differently — grid-rows, opacity/translate, block/hidden,
opacity/scale — so paint stays at the call site, off the seam). One `id` option feeds
both `panelProps.id` and `triggerProps['aria-controls']`, so the a11y link can no
longer be forgotten. This deepens the module (behaviour behind a small interface,
testable through it) and gives the disclosure a11y one owner, mirroring
[ADR-0005](0005-rpc-mutations-via-rpcaction.md) (mutation choreography) and
[ADR-0006](0006-safeurl-brand-enforces-sanitize-boundary.md) (sanitize boundary).

A `mode` option names the one axis the four call sites genuinely differ on — **when
the panel is inert**:

- `drawer` (default) — always shown on desktop, a collapsible drawer on mobile:
  `inert` only when `isMobile() && !open()`. The Jedi sidebar, JediNav's mobile menu,
  and the conversation navigator drawer.
- `popup` — hidden on every viewport until opened: `inert` whenever `!open()`.
  JediNav's profile dropdown, which folds into `useDisclosure` here rather than staying
  hand-rolled; it also supplies the opt-in `ref` boundary that adds click-outside
  dismissal (the drawers stay Escape-only — trigger and panel sit in separate DOM
  subtrees with no single boundary element). Its redundant `aria-hidden` is dropped:
  `inert` alone owns "hidden from assistive tech", consistent with the drawers.

### Considered and rejected

- **Keep the profile dropdown hand-rolled** — rejected: its differing inert regime is
  captured cleanly by `mode: "popup"`, so folding it in removes the last bespoke
  `createSignal + useDismiss + inert` copy and gives the pattern a single owner. The
  cost is a `mode` flag currently serving one popup caller — accepted as the smaller
  price than a second, drifting implementation of the same wiring.
- **`panelProps` owns the show/hide paint too** (a shared `classList`, as
  `useListbox`'s option props do) — rejected: the four panels animate through different
  CSS properties, so no shared class fits; the seam owns only the invariant a11y
  wiring, and `open()` stays exposed for each site's own transitions.
