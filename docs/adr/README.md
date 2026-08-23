# Architecture Decision Records

One decision per file, titled with the decision itself. Numbered and immutable
once accepted — a reversal is a **new** ADR that supersedes the old one, never an
edit. `CONTEXT.md` cites ADRs inline where a topic comes up; this table is the
flat "what has been decided" view.

> **Generated file — do not edit by hand.** Regenerate with `cgs adr:index`
> (from the repo root); CI verifies it is current via `cgs adr:index:check`.

| #   | Decision | Status |
| --- | -------- | ------ |
| [0001](0001-frontend-modular-monolith.md) | Front-end is a modular monolith; package split deferred to the back-end merge | Accepted |
| [0002](0002-jedi-mock-data-contract.md) | Jedi content is served by a back-end-faithful mock that doubles as the data contract | Accepted |
| [0003](0003-entity-identity-number-at-barrel.md) | Entity identity is `number`, made honest at the type barrel | Accepted |
| [0004](0004-conversation-navigator-disclosure-listbox.md) | Conversation navigator is a single-open accordion of disclosure + listbox, not a `role=tree` | Accepted |
| [0005](0005-rpc-mutations-via-rpcaction.md) | RPC mutations own their pending + error via `createRpcAction` | Accepted |
| [0006](0006-safeurl-brand-enforces-sanitize-boundary.md) | A `SafeUrl` branded type enforces the single sanitize boundary | Accepted |
| [0007](0007-consolidate-jedi-shell-unified-identity.md) | Consolidate to a single Jedi-shell app with a root-level unified identity | Accepted |
| [0008](0008-keep-solidstart-leptos-tradeoff.md) | Keep SolidStart for the front-end; treat full-Rust (Leptos / Topcoat) as a trade-off study, not a migration | Accepted |
| [0009](0009-db-swap-seam-postgres-sqlite.md) | Swap Postgres ↔ SQLite behind a compile-time feature flag over a portable-subset schema | Superseded by [0012](0012-postgres-turso-db-swap-seam.md) |
| [0010](0010-monorepo-structure.md) | Merge the front-end and back-end into one mono-repo (`frontend/` + `backend/`) | Accepted (amended) |
| [0011](0011-jedi-backend-domain-contract.md) | The back-end owns the Jedi domain; the mock becomes its fixture | Accepted |
| [0012](0012-postgres-turso-db-swap-seam.md) | Swap Postgres ↔ Turso Database behind a compile-time feature flag over a portable-subset schema | Accepted |
| [0013](0013-in-browser-turso-server-sync.md) | Run an in-browser Turso Database that syncs to the server (optional, on the Turso build) | Accepted |
| [0014](0014-backend-row-scoped-authorization-seam.md) | Row-scoped authorization lives in a per-Bmc `access_scope` hook | Accepted |
| [0015](0015-realtime-push-authorization-at-subscribe-time.md) | Realtime push authorization lives at subscribe-time, reusing the read scope | Accepted |
