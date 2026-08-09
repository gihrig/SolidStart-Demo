# Keep SolidStart for the front-end; treat full-Rust (Leptos / Topcoat) as a trade-off study, not a migration

Issue #17 pairs a back-end expansion and a mono-repo (see [ADR-0009](0009-db-swap-seam-postgres-sqlite.md),
[ADR-0010](0010-monorepo-structure.md)) with a third question: is this the moment
to also switch the front-end to a full-Rust stack — **Leptos**, or the
**Topcoat** option referenced in the issue — and how does that DX compare to
SolidJS/TypeScript/Vite+? We **keep SolidStart/TypeScript** and expand the Rust
back-end behind it. The full-Rust path is recorded here as analysis so the door
stays open, not as a commitment.

Why keep SolidStart:

- The project's declared purpose is a **SolidStart production reference**
  (`CONTEXT.md:1-3`). A front-end rewrite discards that purpose along with seven
  front-end ADRs (0001–0007) of accumulated, deliberate design.
- #17 itself frames Leptos as _"the difficulties and trade-offs of switching"_ —
  i.e. it asks for this analysis, not for the switch.
- The back-end expansion and the mono-repo pay off under **either** front-end
  stack, so nothing decided in #17 forecloses a later change of heart.

## Considered and rejected (for now)

- **Leptos (full-Rust SSR/CSR).** Attractive: one language across the stack,
  shared domain types without the ts-rs boundary, and fine-grained reactivity
  close to Solid's own signal model. Rejected now because it throws away the
  SolidStart-reference value and the 7 ADRs, narrows the ecosystem/hiring pool,
  and abandons the team's demonstrated DX investment in Vite+/Bun/TypeScript. The
  WASM toolchain is already installed (`trunk`, `wasm-bindgen-test-runner`) and
  the back-end already carries a `web-folder/` + `[profile.wasm-release]`, so a
  future spike is cheap; prior notes exist at `backend/planning/leptos_axum_integration.md`.
- **Topcoat (the full-Rust option linked in #17).** Not evaluated in depth: the
  rewrite-cost argument above dominates regardless of which Rust UI layer is
  chosen, so a deep comparison adds no decision value today.
- **Freeze the back-end and change nothing.** Rejected by #17 directly — the
  back-end expansion is the point of the issue.

## When to revisit

Reopen this if the SolidStart-reference goal is retired, or if a single-language
codebase / cross-stack type-sharing becomes a higher priority than the current
TypeScript DX. The mono-repo and the ts-rs contract are the seams a future Leptos
front-end would replace; neither is made harder to remove by the #17 work.

## Consequences

- ts-rs remains the FE/BE contract boundary ([ADR-0003](0003-entity-identity-number-at-barrel.md),
  [ADR-0010](0010-monorepo-structure.md), [ADR-0011](0011-jedi-backend-domain-contract.md)).
- The back-end keeps `web-folder/` and its WASM release profile — harmless today,
  and they lower the cost of a future Leptos experiment.
