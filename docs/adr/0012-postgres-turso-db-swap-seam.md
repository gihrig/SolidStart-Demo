# Swap Postgres ↔ Turso Database behind a compile-time feature flag over a portable-subset schema

_Status: Proposed_

Origin: #17

The back-end runs on Postgres only, through `sqlx`. #17 asks for a switch
between Postgres and Turso by a module swap. "Turso" here is the `turso` crate,
the Rust rewrite of SQLite. It is its own async driver, not an `sqlx` backend.

## Decisions

- **The database is a compile-time choice.** A Cargo feature,
  `--features postgres` or `--features turso`, selects one backend. The two
  features are mutually exclusive, and `compile_error!` guards them. Each backend
  gives its own binary, so no call pays for a runtime dispatch.
- **Turso is the dev default; Postgres is for production.** The `turso` crate
  runs in-process against a local file. So dev and e2e need no Docker.
- **The seam covers two driver families.** A `db_backend` module, selected by
  `cfg`, exports the pool type, the pool constructor, the exec and fetch calls,
  and a row-decode trait. The model code calls through them, and never names
  `Postgres`, `PgRow` or `PostgresQueryBuilder`.
- **The schema is in a portable subset on both backends.** It needs these
  changes:
  - the `user_typ` ENUM becomes `TEXT` with a `CHECK`;
  - `gen_random_uuid()` defaults go, and the app makes each salt;
  - `timestamptz` becomes RFC3339 `TEXT`.
- **The schema is defined one time, in sea-query.** At bootstrap,
  `PostgresQueryBuilder` or `SqliteQueryBuilder` renders it. The two dialects
  differ only in the auto-increment key and the foreign-key form, and sea-query
  emits each one. So parity is structural, and no parity test is needed.
- **Queries stay portable now.** Derived counts use a correlated `COUNT`, never
  `array_agg`, so the seam needs no query rewrite.

## Reasons

- The embedded `turso` crate gives a zero-infra dev setup.
- Postgres stays one flag away for production. That limits the pre-1.0 risk of
  Turso Database.

## Considered and rejected

- **Plain SQLite over `sqlx`.** It is not the Turso direction that #17 asks
  for, and the embedded `turso` crate already fills the zero-infra role.
- **Two DDL trees and a schema-parity test.** sea-query renders both dialects
  from one source, so a second tree only adds drift.
- **libSQL (`sqld`, the `libsql` crate).** Turso Database "replaces libSQL as
  our intended direction". libSQL stays a candidate sync server for
  [ADR-0013](0013-in-browser-turso-server-sync.md).
- **`sqlx-turso`, to keep one `sqlx` surface.** It is alpha and "not ready for
  production use". Revisit it if it becomes stable.
- **Runtime dispatch or `sqlx::Any`.** sea-query-binder has no `Any` builder,
  and Turso is not an `Any` backend. Both backends live at one time is a
  feature the app never uses.

## Consequences

- The Postgres build changes too: `TEXT` enums, app-made salts and `TEXT`
  times. Parity holds only if both builds share one shape.
- CI runs both backends in a `{turso, postgres}` matrix.
- The seam rewrites each `sqlx`-Postgres path in `dbx`, `crud_fns` and the model
  decode, so it is a large refactor.
