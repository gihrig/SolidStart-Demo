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
