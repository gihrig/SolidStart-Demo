# Swap Postgres ↔ Turso Database behind a compile-time feature flag over a portable-subset schema

_Supersedes [ADR-0009](0009-db-swap-seam-postgres-sqlite.md), which modelled the
second backend as plain SQLite over `sqlx`. #17's requirement is **Turso**, and the
latest Turso technology is the `turso` crate — the Rust rewrite of SQLite — which is
**not** an `sqlx` backend. So the seam **mechanism** changes even though ADR-0009's
schema-normalization carries over intact._

#17 asks the back-end to "add database flexibility; switch between **Turso** db or
PG SQL by swapping a module" (linking `docs.turso.tech/local-development`). We make
the database a **compile-time choice**: a Cargo feature (`--features postgres | turso`,
mutually exclusive, guarded by `compile_error!`) selects one backend and produces
**one binary per backend**. The default is **Turso** — zero-infra local dev, because
the `turso` crate runs in-process against a local SQLite-format file (no server, no
Docker); Postgres is `--features postgres` for production. Plain SQLite over `sqlx`
is **not** a third arm — the embedded `turso` crate already fills the zero-infra dev
role SQLite would have.

## What "Turso" means here

ADR-0009 and #17 blurred three distinct things; this ADR is precise:

- **Turso Database** — the [`turso`](https://crates.io/crates/turso) crate, a
  clean-room Rust rewrite of SQLite (formerly _Limbo_). In Turso's words it
  _"replaces libSQL as our intended direction."_ **This is the arm.**
- **libSQL** (`sqld` / `turso dev`, the `libsql` crate) — Turso's older C fork; the
  _"battle-tested foundation today"_ but the one being superseded. Not this arm
  (kept only as a candidate sync server in [ADR-0013](0013-in-browser-turso-server-sync.md)).
- **Plain SQLite over `sqlx`** — what ADR-0009 actually specified when it wrote
  "SQLite." Retired.

## The seam — and why it is not an `sqlx` feature-swap

ADR-0009 assumed **both** arms were `sqlx` (a `postgres` feature vs a `sqlite`
feature), sharing one execution path and _"a single `FromRow` decode path."_ That is
false for Turso: the `turso` crate is its **own async driver**, not a
`sqlx::Database`. Bridging it to `sqlx` needs the separate `sqlx-turso` adapter,
still `0.1.0-alpha.1` (_"APIs and behavior may change before this crate is ready for
production use"_). So the seam abstracts over **two different driver families**,
selected by `cfg`:

- `#[cfg(feature = "postgres")]` → today's `sqlx`-Postgres path.
- `#[cfg(feature = "turso")]` → the `turso` crate's own async driver.

The coupling to unwind is **total, not one module** — every query is built and run
through `sqlx`-Postgres and every row decoded through `sqlx`:

- `crud_fns.rs:37-38` — `query.build_sqlx(PostgresQueryBuilder)` →
  `sqlx::query_as_with::<_, (i64,), _>(&sql, values)`.
- `crud_fns.rs:92,126,163` — the read bound is `E: for<'r> FromRow<'r, PgRow>`, and
  every entity derives it (`#[derive(… FromRow …)]` on `Agent`/`Conv`/`ConvMsg`/
  `ConvUser`/`User`).
- `dbx/mod.rs:137-203` — `QueryAs<'q, Postgres, …>`,
  `FromRow<'r, <Postgres as sqlx::Database>::Row>`, `IntoArguments<'q, Postgres>`,
  `Transaction<'static, Postgres>`, `Pool<Postgres>`.
- `store/mod.rs:11` — `pub type Db = Pool<Postgres>`.

A `db_backend` cfg-module must therefore export **backend-agnostic** aliases/traits —
`Db` (the pool), `new_db_pool()`, the exec/fetch surface, and a row-decode
abstraction replacing the `FromRow<'r, PgRow>` bound — with `crud_fns.rs`,
`dbx/mod.rs`, and every `model/*.rs` calling through them instead of naming
`Postgres` / `PgRow` / `PostgresQueryBuilder` directly. This is essentially the
enum-/trait-dispatch ADR-0009 rejected as "invasive" — but ADR-0009 rejected it for a
_runtime_ switch. Here it is **compile-time** (`cfg`-selected): only one backend is
ever compiled in, so there is no per-call dispatch cost, only a one-time refactor.

## Type parity: normalize to a portable subset (carried from ADR-0009)

Turso is SQLite-compatible _"at the SQL dialect, file format, and C API levels"_
(Turso README), so ADR-0009's normalization still buys parity:

- **Enums → `TEXT` (+ `CHECK`) on both backends** — drop the Postgres named-type
  decode (`#[sqlx(type_name)]`, `conv_kind`, `conv_state`).
- **Salts generated in the app on both backends** — drop the `gen_random_uuid()` DDL
  default; the BMC mints the salt.
- **`timestamptz` → `TEXT` / RFC3339.**

The one change from ADR-0009: parity is no longer enforced by a **shared `sqlx`
`FromRow`** (Turso rows are not `sqlx` rows) but by each backend's decode impl
producing the same entity from the same portable columns.

## Schema & bootstrap — one source, rendered per dialect

**The schema is defined once in Rust via sea-query** — the same builder that already
constructs every runtime query — and rendered per backend at bootstrap:
`PostgresQueryBuilder` for Postgres, `SqliteQueryBuilder` for Turso (SQLite-compatible).
sea-query emits the dialect-correct forms of the only two constructs that actually
diverge after normalization: the **auto-increment PK** (`… GENERATED … AS IDENTITY` vs
`INTEGER PRIMARY KEY AUTOINCREMENT`) and **foreign keys** (FK-via-`ALTER` vs inline in
`CREATE TABLE`). Because both backends render from the **same source, parity is
structural — there is no second DDL tree and no schema-parity test**; nothing can
drift. `dev_db.rs` branches only the _bootstrap wrapper_: Postgres gets
`CREATE DATABASE` / `USER` / `pg_terminate_backend` (no analog on Turso); Turso manages
the local `.db` file and enables `PRAGMA foreign_keys = ON`. Seed data is portable
`INSERT`s. (Verify at build time that Turso accepts sea-query's `SqliteQueryBuilder`
DDL output — expected, since Turso is SQLite-dialect-compatible.)

## Maturity: Turso is pre-1.0 — accepted, with eyes open

Turso Database _"[has] not yet reached 1.0… some features are explicitly marked
experimental"_ (README), and Turso itself recommends _libSQL_ for _"mission-critical
workloads that need a battle-tested foundation today"_ and Turso Database _"if you're
starting a new project."_ We accept the pre-1.0 risk because this repo is a
**technology demo / production-standard reference** (CONTEXT.md), Turso is #17's
stated direction, and **Postgres stays one flag away** as the production backend.
SQLite-compatibility is _"not at 100% yet"_, so the portable-subset schema and the CI both-backend
matrix are what keep us inside the supported overlap.

## Considered and rejected

- **Keep plain SQLite over `sqlx` as the second (or a third) arm** — rejected: it is
  not "the latest Turso technology" #17 asks for, and the embedded `turso` crate
  already delivers the zero-infra / no-Docker dev role SQLite was there for. One
  backend fewer.
- **Two hand-maintained DDL trees + a schema-parity test** (ADR-0009's approach) —
  rejected: only the auto-increment PK and FK-via-`ALTER` actually diverge, and
  sea-query (already the builder for every runtime query) renders both dialects from
  one source — making parity structural, not test-guarded.
- **libSQL (`sqld` / `turso dev`) as the arm** — rejected: it is the _older_ fork
  Turso now positions behind Turso Database (_"replaces libSQL as our intended
  direction"_). Reconsidered only as a possible sync server in ADR-0013.
- **`sqlx-turso` to preserve the `sqlx` feature-swap shape** — rejected for now:
  `0.1.0-alpha.1`, _"not ready for production use."_ If it stabilizes it could
  collapse the two driver families back under one `sqlx` surface; revisit then.
- **Runtime enum-dispatch / `sqlx::Any`** — as ADR-0009: `Any` is a dead end
  (sea-query-binder's `SqlxValues` has no `Any` builder, and Turso is not an `Any`
  backend); runtime dispatch buys a "both backends live at once" capability we never
  use.

## Consequences

- The **Postgres** build also changes (enums → `TEXT`, app-side salts). Intentional —
  parity is only a guarantee if both builds share the shape.
- **CI runs both backends** (matrix `{turso, postgres}`) — verifying each dialect's
  _rendered_ schema and queries actually build and run; schema parity itself is
  structural (one sea-query source), not something CI must guard
  ([ADR-0010](0010-monorepo-structure.md)).
- **Browser sync is a separate, optional feature** on the Turso build —
  [ADR-0013](0013-in-browser-turso-server-sync.md), not this seam.
- The **no-Docker `cgs test:e2e` self-boot** rides this Turso arm (it needs the
  embedded Turso backend to exist), so it is **not** part of the mono-repo merge.
- This is a **larger refactor than ADR-0009 implied** — it rewrites the `sqlx`-welded
  `dbx` / `crud_fns` / model-decode paths, not "~20 concrete mentions" — which is why
  it is broken out of the mono-repo merge into its own back-end-expansion track.
