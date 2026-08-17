# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the shared domain model.
- **`docs/adr/`** at the repo root — read the ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a **single-context mono-repo**: one `CONTEXT.md` + one `docs/adr/` at the repo root, shared across both subtrees. [ADR-0010](../adr/0010-monorepo-structure.md) chose this deliberately — the domain is **one bounded context with two surfaces** (front-end + back-end), unified by a single `User` ([ADR-0007](../adr/0007-consolidate-jedi-shell-unified-identity.md), [ADR-0011](../adr/0011-jedi-backend-domain-contract.md)) — so there is **no per-subtree `CONTEXT.md` or `docs/adr/`**.

```
/
├── CONTEXT.md                  ← shared domain model (both surfaces)
├── docs/adr/                   ← all architecture decisions, one number sequence
│   ├── 0001-frontend-modular-monolith.md
│   ├── …
│   └── 0013-in-browser-turso-server-sync.md
├── frontend/                   ← SolidStart code + tool-specific CLAUDE.md
└── backend/                    ← Rust/Axum code + tool-specific CLAUDE.md
```

Only **code and tool-config** descend into the subtrees. The domain docs stay at the root; do **not** create `frontend/CONTEXT.md`, `backend/CONTEXT.md`, or per-subtree `docs/adr/` without a new ADR superseding ADR-0010's "single root `CONTEXT.md`" decision.

> **Note — `CONTEXT.md` scope.** The root `CONTEXT.md` currently documents the front-end surface only. Per ADR-0010 it is meant to cover **both** surfaces; the back-end domain (the Jedi entities and unified `User` of [ADR-0011](../adr/0011-jedi-backend-domain-contract.md)) still lives only in the ADRs. Broadening `CONTEXT.md` is a **content** task, not a layout change — the single-context layout above is already correct.

`CLAUDE.md` follows the same split ([ADR-0010](../adr/0010-monorepo-structure.md)): cross-cutting rules at the root (`.claude/CLAUDE.md`, always loaded), tool-specific rules in `frontend/.claude/CLAUDE.md` and `backend/.claude/CLAUDE.md` (loaded when Claude works in that subtree). The domain docs are **not** split this way — they stay whole at the root.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (each entry lists its _Avoid_ terms).

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0009 (Postgres/SQLite db-swap seam) — but worth reopening because…_
