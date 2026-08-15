# Swap Postgres ↔ SQLite behind a compile-time feature flag over a portable-subset schema

> **⚠️ Superseded by [ADR-0012](0012-postgres-turso-db-swap-seam.md).** This ADR
> modelled the second backend as plain **SQLite over `sqlx`**. #17's actual
> requirement is **Turso**, and the latest Turso technology is the `turso` crate (a
> Rust rewrite of SQLite) — which is **not** an `sqlx` backend, so the seam mechanism
> is redesigned in ADR-0012. The **schema-normalization** below (enums → `TEXT`,
> app-side salts, RFC3339 timestamps) carries over and is still valid. Kept as the
> record of the SQLite-via-`sqlx` path that was considered, and why it changed.

#17 asks the back-end to "add database flexibility; switch between Turso and
Postgres by swapping a module." We make the database a **compile-time choice**: a
Cargo feature (`--features postgres | sqlite`, mutually exclusive, guarded by
`compile_error!`) selects one backend and produces **one binary per backend**.
The default is **SQLite** (zero-infra local dev, and the shape Turso/libSQL runs
locally); Postgres is `--features postgres` for production. A single `db_backend`
cfg-module is the "module" #17 swaps.

## The seam

`db_backend` exports the backend-specific aliases the rest of the code references:
`Backend` (= `Postgres` | `Sqlite`), `Db` (the pool), `DbRow`, `query_builder()`,
and `new_db_pool()`. `store/mod.rs`, `dbx/mod.rs`, and `crud_fns.rs` use those
aliases instead of naming `Postgres`/`PgRow`/`PostgresQueryBuilder` directly
(collapsing ~20 concrete mentions). Swapping the backend swaps this one module.

## Why compile-time, not a runtime switch

The decisive fact is that **there are no `sqlx` compile-time macros in the
codebase** (`grep -E 'sqlx::query(_as|_scalar)?!' = 0`). Every query is built at
runtime with sea-query — `build_sqlx(PostgresQueryBuilder)` → `sqlx::query_as_with`
(`crud_fns.rs:37-41`). So the usual "compile-time typed queries" argument for a
particular backend does not apply here. What _does_ apply: `sqlx` is monomorphized
per `Database` (`Pool<Postgres>`, `QueryAs<'q, Postgres, …>`, `FromRow<'r, PgRow>`),
so a _runtime_ swap would need either invasive enum-dispatch or `sqlx::Any`. #17's
own wording — "swap a **module**" — leans compile-time, and the application never
needs both backends live in one process.

## Type parity: normalize to a portable subset

Rather than translate between two schemas at runtime, both backends use the same
portable column shapes, so there is a single `FromRow` decode path and identical
behavior:

- **Enums → `TEXT` (+ `CHECK`) on both backends** — drop the Postgres named-type
  decode (`#[sqlx(type_name="user_typ")]`, `conv_kind`, `conv_state`). The write
  path is already portable (`impl From<UserTyp> for sea_query::Value` via
  `to_string()`).
- **Salts generated in the app on both backends** — drop the `gen_random_uuid()`
  DDL default; `UserBmc::create` mints the salt. (Today no app-side salt exists;
  the default is DDL-only.)
- **`timestamptz` → `TEXT` / RFC3339.**

## Schema & bootstrap

Two hand-maintained DDL trees, `sql/dev_initial/{pg,sqlite}/`, selected by
feature. `dev_db.rs` branches the bootstrap: for SQLite it skips
`00-recreate-db.sql` (the Postgres-root `CREATE DATABASE`/`USER`/`pg_terminate_backend`,
which has no SQLite analog) and deletes the `.db` file instead. A **schema-parity
test** guards drift between the two trees.

## Considered and rejected

- **(ii) Runtime enum-dispatch trait** over both pools — rejected: invasive
  (every `dbx` signature grows a dispatch layer) for a capability we never use
  (both backends live at once).
- **(iii) `sqlx::Any`** — a dead end: sea-query-binder's `SqlxValues` has no `Any`
  builder/args, so the entire `build_sqlx → query_as_with` layer would be
  abandoned; and true Turso/libSQL-remote is not an `Any` backend either.
- **Keep the Postgres-idiomatic schema** (native `ENUM`s, `gen_random_uuid()`
  defaults, `timestamptz`) — rejected: it is exactly what blocks SQLite, and the
  normalization cost is paid once.

## Consequences

- The Postgres build also changes: enums become `TEXT`, salts move into the app.
  This is intentional — parity is only a guarantee if both builds share the shape.
- **CI must run both backends (matrix `{sqlite, postgres}`)** — this is the only
  thing that keeps the portable subset honest ([ADR-0010](0010-monorepo-structure.md)).
- **Turso** local is a plain `local.db` file that `sqlx` opens natively (verified:
  _"local database file, no server needed"_). `turso dev` / `sqld` (libSQL over
  HTTP, not `sqlx`) is a **deferred future third backend**, reached via the
  `libsql` crate, not this seam.
- **Future DML-dialect residue** (tracked in implementation issues, not blocking):
  the idempotent Like in [ADR-0011](0011-jedi-backend-domain-contract.md) needs
  `ON CONFLICT(owner_id, target_id) DO NOTHING` (portable across Postgres and
  SQLite ≥ 3.35); any `contains` / `starts_with` search needs case-insensitive
  handling (`ILIKE` is Postgres-only). There are zero upserts/`ILIKE` today.
