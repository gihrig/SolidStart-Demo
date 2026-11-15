# Back-end integers cross the contract seam as `number`, emitted by ts-rs

Origin: #188

Each back-end integer reaches the front-end as a JSON number: `response.json()`
and `JSON.parse` give `number`, never `bigint`. By default, ts-rs declares an
`i64` as `bigint`, so the bindings would not match the wire.

## Decisions

- **The generator emits `number`.** `backend/.cargo/config.toml` sets
  `TS_RS_LARGE_INT = "number"` beside `TS_RS_EXPORT_DIR`. Each `i64`, `u64`,
  `i128` and `u128` field is then a `number` in the bindings: entity ids, audit
  ids (`cid` / `mid`), counts and error fields. A count has the same wire and
  the same limit as an id, so the rule covers each integer. The front-end barrel
  only re-exports.
- **The setting lives in the cargo config, not in the `bindings` recipe.** Each
  `cargo test` runs the ts-rs export tests, and they rewrite the bindings. With
  a recipe-only setting, a plain `cargo test` would write `bigint` back.
- **Nobody edits a generated file.** No front-end type rewrites a binding.

## Considered and rejected

- **A front-end mapped type that rewrites each `bigint` field.** Each new binding
  with an id needs a wrapper, each nested id needs a hand re-type, and the
  rewrite needs its own guard test.
- **`#[ts(type = "number")]` on each field.** Each new integer field needs one
  more, and a missed field emits `bigint` with no warning.
- **A branded `Id` type.** It needs a minting cast at each boundary, against an
  id-mixing bug that the code has not shown.
- **`bigint` end to end** (an i64-safe JSON parse). JSON makes each integer a
  `number` before any code runs, so a custom parser would fight the wire.

## Consequences

- An integer above `Number.MAX_SAFE_INTEGER` (2⁵³−1) loses precision. Revisit
  this if the back-end ever issues a value in that range.
- Two checks catch a return to `bigint`: the CI bindings-drift guard, and `tsc`
  where code passes a binding id into a `number` parameter. A ts-rs upgrade that
  drops or renames `TS_RS_LARGE_INT` fails the same two checks.
