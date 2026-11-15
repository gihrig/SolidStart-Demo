# SolidStart for the front-end; Full-Rust (Leptos / Topcoat) as a trade-off study

Origin: #17

A full-Rust front-end, Leptos or Topcoat, would put one language across the
stack. The question is whether to switch now.

## Decision

Keep SolidStart and TypeScript for the front-end. Grow the Rust back-end behind
it. The full-Rust path stays open as a study, not as a plan.

## Reasons

- This project is a SolidStart production reference. A front-end rewrite
  discards that purpose.
- The mono-repo and the back-end work pay off with either front-end. So this
  decision closes no door.
- The rewrite cost dominates, whichever Rust UI layer is chosen.

## Considered and rejected

- **Leptos (full-Rust SSR/CSR).** It gives one language, shared domain types
  with no ts-rs seam, and signals close to Solid's model. It discards the
  SolidStart reference, narrows the ecosystem, and drops the Vite+/Bun/TypeScript
  tooling. `backend/planning/leptos_axum_integration.md` holds earlier notes
  for a later spike.
- **Topcoat.** Not studied in depth. The rewrite cost decides the question for
  any Rust UI layer.

## When to revisit

Reopen this decision if the SolidStart reference goal ends. Reopen it also if
one language across the stack becomes more important than the TypeScript tooling.
A Leptos front-end would replace the ts-rs contract
([ADR-0010](0010-monorepo-structure.md), [ADR-0027](0027-backend-integers-cross-seam-as-number.md)).
