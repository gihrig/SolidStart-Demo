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
