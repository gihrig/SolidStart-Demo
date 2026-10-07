# Back-end integers cross the contract seam as `number`, emitted by ts-rs

_Supersedes [ADR-0003](0003-entity-identity-number-at-barrel.md), which made the
types honest at the `~/types/backend` barrel. Its `number` choice and the 2⁵³ limit
carry over; its barrel rewrite does not._

Every back-end integer reaches the front-end as a JSON number: `response.json()` and
`JSON.parse` yield `number`, never `bigint`. By default, ts-rs declares an `i64` as
`bigint`. ADR-0003 closed that gap at the barrel, where a `NumericIds<T>` mapped type
rewrote each `bigint` field. By #188, 20 of 30 bindings declared `bigint`. The
barrel needed three rewrite types, hand `Omit` re-types (`PostView`, `CaptionView`,
`PostForCreate`), and a 90-line guard test.

**Decision.** The generator emits `number`. `backend/.cargo/config.toml` sets
`TS_RS_LARGE_INT = "number"` beside `TS_RS_EXPORT_DIR`. Each `i64`, `u64`, `i128` and
`u128` field is then a `number` in the bindings. That covers entity ids, audit ids
(`cid` / `mid`), counts, and error fields. The rule covers every integer, not only
ids: a count has the same wire and the same limit as an id. The barrel only
re-exports.

The setting lives in the cargo config, not in the `bindings` recipe. Every
`cargo test` runs the ts-rs export tests, and they rewrite the bindings. With a
recipe-only setting, a plain `cargo test` would write `bigint` back.

ADR-0003 rejected a ts-rs override because "the Rust back-end is not in this repo".
[ADR-0010](0010-monorepo-structure.md) moved the back-end here and logged the
follow-on that this ADR closes. ADR-0010's other reason, "keep generated files
pristine", still holds: nobody edits a generated file.

## Considered and rejected

- **Keep the barrel rewrite (ADR-0003).** Each new binding with an id needs a
  wrapper, each nested id needs a hand re-type, and the rewrite needs its own guard
  test.
- **`#[ts(type = "number")]` on each field.** There are 51 such fields today. Each
  new integer field needs one more, and a missed field emits `bigint` with no
  warning.
- **A branded `Id` type** — still rejected, for ADR-0003's reasons: a minting cast at
  each boundary, against an id-mixing bug that the code has not shown.
- **`bigint` end-to-end** (an i64-safe JSON parse) — still rejected. JSON makes each
  integer a `number` before any code runs; a custom parser would fight the wire.

## Consequences

- An integer above `Number.MAX_SAFE_INTEGER` (2⁵³−1) loses precision. This was
  already true at run time. ADR-0003 accepted it for ids; it now covers every
  integer. Revisit if the back-end ever issues a value in that range.
- Nothing changes at run time. The types that callers use do not change, except
  `ParamsIded` and `ParamsForUpdate`: their `id` becomes `number`. No caller imports
  them.
- `wsEvent.unit.test.ts` goes with the rewrite. Two checks catch a return to
  `bigint`: the CI bindings-drift guard, and tsc wherever code passes a binding id
  into a `number` parameter.
- A ts-rs upgrade that drops or renames `TS_RS_LARGE_INT` would emit `bigint` again.
  The same two checks catch it.
