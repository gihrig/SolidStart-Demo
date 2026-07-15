Results from improve-codebase-architecture run on completed
#13-std-data-structures branch

Report at docs/architecture-review-20260711-013631.html (21 KB)
file:///Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo/docs/architecture-review-20260711-013631.html

⏺ 4 candidates (all quote real code in the cards):

```pre
┌───┬──────────────────────────────────────────────────────────────────┬────────────────────┐
│ # │                               Deepening                          │        Strength    │
├───┼──────────────────────────────────────────────────────────────────┼────────────────────┤
│ 1 │ Feed view-model seam (createJediFeed) — pull the 4 resources +   │ Strong             │
│   │ winningCaption + selectedCategory out of the 268-line route      │                    │
├───┼──────────────────────────────────────────────────────────────────┼────────────────────┤
│ 2 │ FeaturedPost module — collapse the ~100-line inline article      │ Worth exploring    │
│   │ (jedi.tsx:77–176)                                                │ (depends on C1)    │
├───┼──────────────────────────────────────────────────────────────────┼────────────────────┤
│ 3 │ useDisclosure — dedupe the signal + isMobile + useDismiss +      │ Worth exploring (2 │
│   │ inert wiring copied in route + JediNav                           │ real call sites)   │
├───┼──────────────────────────────────────────────────────────────────┼────────────────────┤
│ 4 │ AuthorLikesRow — share the row between Top Photos / Top Captions │ Speculative        │
└───┴──────────────────────────────────────────────────────────────────┴────────────────────┘
```

Core finding: jedi-api.ts is already a deep module — its 8 tests cross one interface, no DOM. Every one of the route's 5 tests must render(<Jedi/>) because the route's derivations have no seam. Candidate 1 closes that gap and unblocks C2.

Top rec: Candidate 1.

Which would you like to explore? (Picking one starts the grilling loop — constraints, the shape of the deepened module, what tests survive.)

Resume this session with:
claude-max --resume 11405286-f40b-4d05-9c12-1bbab32e62c6
claude --model claude-opus-4-8 --effort high --model claude-opus-4-8 --effort 93.29s user 12.76s system 1% cpu 1:43:26.62 total

---

❯ /ask-matt Nearly complete on #13 I ran improve-codebase-architecture, it produced three candidate refactors. see `docs/architecture-review-20260711-013631.html`. I also have #29 and #32 which affect similar areas to #13. Which Should I address first: The three candidates from improve-codebase-architecture or #29 and 32?

⏺ Note: the file has 4 candidates (C1 Strong · C2/C3 Worth exploring · C4 Speculative), not 3.

Verified. The framing "candidates or #29/#32" is a false choice — the review's own logic couples C1 with #29, and #32 isn't a refactor at all.

C1 is the enabling refactor for #29 (not a competitor):

- Review: "the seam #29 filtering lands behind" / "#29 filtering gets a home."
- C1 is greenfield — ls src/lib/jedi/ → only data.json, jedi-api.ts, jedi-api.unit.test.ts; no createJediFeed.ts yet.

The other candidates are gated:

- C2 badge "depends on C1" — "Without C1, action handlers become props and the module goes shallow."
- C4 — "real payoff only once the rows become interactive (post-#29)."
- C3 (useDisclosure) is the one independent candidate — 2 real call sites (jedi.tsx + JediNav.tsx).

#32 is not a refactor — it's more #13:

- Issue #32 body: "Create a data mock file similar to #13 but for header/hero data." None of C1–C4 touch hero/header data. It's orthogonal, blocks nothing.

Recommended order

1. #13 is code-complete and validated — tidy the loose planning/ changes, merge the branch, close the issue, then proceed to C1 → #29.
2. C1 → then #29, as a pair. C1 is the only "Strong" candidate and it's why #29 gets a clean home. Don't build #29's selection into the current 268-line DOM-only route — refactor the seam first (make the change easy), then land the feature behind it.
3. #32 — by appetite, not dependency. Independent #13-style data work. Ride #13's momentum and do it next, or defer indefinitely; nothing waits on it.
4. Defer C2 (needs C1), C4 (post-#29). C3 is a free-standing small a11y win — slot it whenever.

Where this routes (ask-matt map)

```pre
┌──────┬────────────────────────┬───────────────────────────────────────────────────────────────┐
│ Work │         Skill          │                                       Why                     │
├──────┼────────────────────────┼───────────────────────────────────────────────────────────────┤
│      │ /implement (drives     │ Chosen deepening opportunity, but the review is already sharp │
│ C1   │ /tdd, closes           │ (before/after, interface sketch, "Aligns with ADR-0002 &      │
│      │ /code-review)          │ ADR-0001"). Skip the heavy /grill-with-docs. Optionally open  │
│      │                        │ with /codebase-design to lock createJediFeed's interface      │
├──────┼────────────────────────┼───────────────────────────────────────────────────────────────┤
│ #29  │ /implement — behind    │ Don't /triage — it's your own ticket, not incoming.           │
│      │ C1's seam              │                                                               │
├──────┼────────────────────────┼───────────────────────────────────────────────────────────────┤
│ #32  │ /implement             │ Spec is enough ("data mock similar to #13").                  │
├──────┼────────────────────────┼───────────────────────────────────────────────────────────────┤
│ C3   │ /implement             │ Independent; small, clean win.                                │
├──────┼────────────────────────┼───────────────────────────────────────────────────────────────┤
│ C2   │ /implement             │ Depends on C1                                                 │ ├──────┼────────────────────────┼───────────────────────────────────────────────────────────────┤
│ C4   │ /implement             │ Post-#29                                                      │
└──────┴────────────────────────┴───────────────────────────────────────────────────────────────┘
```

---

❯ /implement `docs/architecture-review-20260711-013631.html` C1

⏺ On branch post-#13-arch-review (not the default). Committing the three C1 files:

Done. C1 implemented, reviewed, committed.

What shipped (d5be192, branch post-#13-arch-review):

- src/lib/jedi/createJediFeed.ts — new view-model module owning the 4 resources (categories/posts/featured/topCaptions), the winningCaption derivation, and selectedCategory state behind a small JediFeed accessor interface.
- src/lib/jedi/createJediFeed.unit.test.ts — 6 tests that cross the seam via createRoot + accessors, no DOM — the whole point of C1 (mirrors how jedi-api is tested).
- src/routes/jedi.tsx — now destructures accessors from createJediFeed(); dropped createResource/jediApi imports and inline orchestration.

Process: TDD (RED → GREEN), then two-axis /code-review.

Verification (all green):

- vpr check:type — clean
- vp check — 139 files formatted, 0 lint/type errors
- vpr test:all — 198 passed / 25 files (incl. new seam test + existing route test)

Review verdict — ship-quality, no required changes:

- Spec: faithful to C1; #29 selection/filtering correctly deferred (seam named, no filter applied).
- Standards: no violations. Kept it (matches sibling jedi-api.unit.test.ts/jedi.test.tsx).

Note: the pre-existing planning/arch-review-notes-\*.md edit was out of scope and left uncommitted. C1 also unblocks Candidates 2 & 4, which now have the seam they depend on.

---

❯ /implement #29

After discussion w/ Claude...

⏺ Design — #29 Select Top Photo

Seam (src/lib/jedi/createJediFeed.ts) — the TDD seam:

- Add `selectedPostId` signal (default undefined = follow the featured default).
- Add derived `selectedPost = () => posts()?.find(p => p.id === selectedPostId()) ?? featured()`.
- Re-key the topCaptions resource off `selectedPost()?.id` (was `featured()?.id`) — so caption + winningCaption follow the selection.
- Expose selectedPost: `Accessor<PostView|undefined>` and `selectPost: (id: number) => void`. Keep featured (default) and winningCaption.

Route (src/routes/jedi.tsx):

- Main article renders `selectedPost()` instead of `featured()` — all metadata (author, caption, categories, like/comment counts) follows automatically.
- Top Photos buttons: `onClick={() => selectPost(p.id)}; selected item gets bg-(--theme-highlight) + aria-current="true"` (mirrors the Categories highlight pattern).

Tests (createJediFeed.unit.test.ts): default `selectedPost = featured (id 1)`; `selectPost(2)` switches selectedPost, re-keys topCaptions, and updates winningCaption. Written test-first at the seam.

Out of scope → new GH issue: full listbox/keyboard-nav for Top Photos + Categories-driven filtering of the list.

⏺ Committed as 31b8497 on post-#13-arch-review.

Done — #29 Select Top Photo

What shipped:

- Seam (createJediFeed.ts): added selectedPostId signal + derived selectedPost (falls back to featured), a selectPost(id) action, and re-keyed topCaptions off the selection so caption/metadata follow.
- Route (jedi.tsx): main article now renders selectedPost(); Top Photos buttons call selectPost(p.id), with bg-(--theme-highlight) + aria-current="true" on the selected item.
- Tests: 4 new seam tests, written test-first (RED→GREEN).

Verification:

- Typecheck: clean
- Full suite: 201/201 pass
- Lint/format: clean
- Code review (Standards + Spec, parallel): no hard violations, spec faithful, no scope creep

Follow-up: opened #33 for the two deferred items you called out (full keyboard-nav listbox + Categories-driven filtering of Top Photos). The seam comment that referenced #29 for category filtering was corrected to point at #33.

Not done (out of scope / your call): the parked loading/error + ErrorBoundary comment on #29 is a separate bucket and wasn't touched. Note the commit ran through the vp check --fix pre-commit hook, so the three files are auto-formatted as committed.

Moved to #16 (2026-07-13).

The deferred loading/error states + ErrorBoundary follow-up originally parked here has been relocated to #16, where it is relevant as a prerequisite of swapping jedi-api.ts to the real back-end. See #16 (comment).

---

❯ /implement #32

#32 — Externalize Jedi header/hero + nav profile

⏺ What shipped (follows #13 / ADR-0002 mock-data contract):

- data.json — added hero singleton + profile: { userId: 3 } (joined from users, not denormalized).
- jedi-api.ts — jediApi.hero.get() / jediApi.profile.get(), RPC-shaped, URLs sanitized at the seam boundary.
- createJediFeed.ts — exposes hero + profile resources.
- jedi.tsx — <Hero> renders from hero(); profile() passed to <JediNav>.
- JediNav.tsx — presentational, optional profile prop (was hard-coded "Bart").

TDD at both DOM-free seams (jedi-api, createJediFeed), RED→GREEN, plus component/route tests.

Verification (all green): typecheck clean · vp check clean · vpr test:all 209/209 (+8).

Code review (two-axis, parallel):

- Standards: 1 hard violation — import order in JediNav.tsx → fixed. Rest judgement notes.
- Spec: core faithful. Notable notes I consciously left, with rationale:
  - Meta description duplicates hero.subtitle — left synchronous; it's SEO metadata (not "Hero content"), and binding it to the async resource risks it missing from SSR HTML.
  - Double sanitization (Hero/JediNav re-guard props) — kept as layered defense; Hero's own test asserts it blocks javascript: URLs, so removing it would break standalone safety. The ADR's "single boundary" governs the data seam.

One thing worth your call: the hero.subtitle / <Meta> duplication — leave as-is (my recommendation, for SSR) or accept an async-bound meta? Say the word if you want it wired.

❯ close #32 with a summary comment

⏺ Closed #32 with the summary comment.

❯ /implement `docs/architecture-review-20260711-013631.html` C3

⏺ Committed as 9c0fff2 on post-#13-arch-review. The pre-existing planning/ edit remains uncommitted (out of scope).

C3 — useDisclosure seam

What shipped:

- src/lib/useDisclosure.ts (new deep module) — useDisclosure(options?): { open, toggle, inert }, wrapping the duplicated signal + useIsMobile() + useDismiss + inert quartet. inert = isMobile() && !open(); optional dismissWhen guard for nested disclosures.
- src/lib/useDisclosure.unit.test.ts (new) — 7 DOM-free tests at the seam (mirrors useDismiss/useIsMobile style).
- jedi.tsx sidebar + JediNav.tsx mobile menu now consume it; dropped their local createSignal/useIsMobile/useDismiss wiring.
- JediNav's profile dropdown (ref-based, different pattern) intentionally left as-is — C3's two real call sites are the sidebar + mobile menu.

TDD: RED (missing module) → GREEN → refactored both call sites, behavior preserved.

Verification (all green): typecheck clean · vp check clean · vpr test:all 216/216 (+7); existing route/JediNav DOM tests unchanged and passing.

Code review (two-axis, parallel):

- Standards: no hard violations. Caught a JSDoc overstatement ("Escape / click-away" — only Escape is wired since no ref is passed to useDismiss) → fixed. dismissWhen flagged as possible Speculative Generality but judged to earn its keep (real requirement + dedicated test).
- Spec: faithful. Sole deviation — returning inert rather than the sketch's dismissProps — is the correct realization given useDismiss uses document-level listeners (no spreadable props exist). Scope discipline (excluding the dropdown) matches C3 exactly.

Per the review notes, C3 was the one free-standing candidate. Remaining from the arch review: C2 (FeaturedPost) and C4 (AuthorLikesRow), both now unblocked by C1/#29 if you want them next.

❯ /implement `docs/architecture-review-20260711-013631.html` C2

⏺ Committed as 01c024a on main. The pre-existing planning/ edit remains uncommitted (out of scope).

C2 — FeaturedPost module

What shipped:

- src/components/FeaturedPost.tsx (new) — presentational module with a small { post: PostView; caption?: CaptionView } interface, holding the ~100 lines of extracted article markup.
- src/components/FeaturedPost.test.tsx (new) — 6 tests at the { post, caption } seam (title/caption, photographer link, category chips, author + counts, accessible Like/Edit/Delete actions, empty-caption fallback).
- jedi.tsx — the article block drops from ~101 lines to {(post) => <FeaturedPost post={post()} caption={winningCaption()} />}; isLiked and the Image/Author imports moved into the component.

TDD: RED (missing component) → GREEN → refactored the route; the existing jedi.test.tsx served as the behavior-preserving safety net.

Verification (all green): typecheck clean · vp check clean · vpr test:all 222/222 (+6); existing route DOM tests unchanged and passing.

Code review (two-axis, parallel):

- Spec: faithful. The load-bearing requirement is met — small {post, caption} interface, route shrinks to layout + seam wiring, and the "handler-props → shallow module" Risk (C2's explicit warning) is avoided by keeping the placeholder actions internal. Wiring actions "behind C1's seam" is a no-op today since they're still unimplemented.
- Standards: no hard violations. Acted on the one domain-language note — changed caption: string → caption?: CaptionView so the boundary carries the first-class Caption entity (per CONTEXT.md), consistent with the seam's winningCaption. The notImplemented helper also de-duplicated the two identical alert handlers.

The arch review is now fully worked through: C1 (seam) ✓, #29 (selection) ✓, C3 (useDisclosure) ✓, C2 (FeaturedPost) ✓. Only C4 (AuthorLikesRow) remains — rated Speculative, with "real payoff only once the rows become interactive."

❯ /implement `docs/architecture-review-20260711-013631.html` C4

After reconsidering C4 and needed features for Top Captions...

⏺ Current branch state on post-#13-arch-review: C1/#29, C3, C2 shipped; C4 reverted; this spec committed.

#33 expanded.

Title: Jedi: Top Photos/Captions listboxes + filter by Categories + caption selection

Body now has three scope items — the original two (Top Photos listbox; filter by Categories) plus new item 3: select a Top Caption to display it under the post (with the seam mechanism, and noting Top Captions also becomes a listbox). It records that items 1–2 were deferred from #29 and item 3 was added during design, and links planning/issue-33-plan.md as the build plan.

Net state on main: arch-review fully worked through (C1/#29, C3, C2 shipped; C4 rejected/reverted), the #33 design spec committed (cf9c442), and #33 updated to match. The build is queued for when you pick up #33. The only uncommitted change remains the pre-existing planning/arch-review-notes edit.

---

Post #29 review items complete - merge into main.
