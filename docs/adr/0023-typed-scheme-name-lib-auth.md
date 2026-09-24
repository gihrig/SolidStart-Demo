# The lib-auth password scheme is a typed `SchemeName`, identity owned by the scheme module

`lib-auth` hashes passwords under a **multi-scheme** design: each stored hash is an
envelope `#<scheme>#<hashed>`, where the scheme token (`01` = HMAC-SHA-512, `02` =
Argon2id) selects the algorithm and the current default marks whether a stored hash
needs re-hashing (`CONTEXT.md` does not cover `lib-auth` — it is infrastructure, not
Jedi domain).

Before this ADR the scheme name was a bare `&str` threaded through the crate, and its
identity was split. `DEFAULT_SCHEME: &str = "02"` and the `SchemeStatus` type lived in
`pwd/scheme/dispatch.rs`; the "is this hash current?" verdict (`== DEFAULT_SCHEME`) and
the `#<scheme>#<hashed>` codec (`PwdParts`) lived in `pwd/hasher.rs`; `get_scheme(&str)`
returned a `Result` because any string could miss. Understanding "which scheme, and is
it current?" meant bouncing between two modules.

The architecture review after #163 raised this as card **C-07 — concentrate scheme
identity** (`backend/docs/ar/architecture-review-20260920-173449.html`, issue #164).
This ADR records the deepening: a typed scheme, its identity owned in one place.

## Decisions

**The scheme name is a typed enum.** `SchemeName { Scheme01, Scheme02 }`
(`pwd/scheme/name.rs`) replaces the `&str`. An unknown scheme is unrepresentable past
the one edge where a raw string enters. `as_str` maps each variant to its stable wire
token (`01` / `02`).

**One parse edge mints the not-found error.** `impl FromStr for SchemeName` is the only
`&str → SchemeName` conversion; an unknown token yields `scheme::Error::SchemeNotFound`.
The error variant keeps its `String` payload, so the ts-rs binding
(`lib_auth_pwd_Error.d.ts`) is unchanged.

**`get_scheme` is total.** `get_scheme(SchemeName) -> impl Scheme` drops its `Result`:
every variant has an implementation, so the lookup cannot fail.

**Currency is a property of the name.** `SchemeName::status(self) -> SchemeStatus` owns
the `== DEFAULT_SCHEME` rule; `DEFAULT_SCHEME` is a typed const. The verdict and the
type now sit together in `name.rs`.

**The stored envelope is a `pwd`-owned codec.** `PwdParts { scheme, hashed }`
(`pwd/pwd_parts.rs`) owns the `#<scheme>#<hashed>` wire format both ways — `FromStr`
decodes, `Display` encodes. It lives in `pwd`, not `scheme`, because the envelope is a
password-storage concern; `scheme` supplies only the token vocabulary. `pwd/hasher.rs`
is left as orchestration only.

**The public seam is frozen.** `hash_pwd`, `validate_pwd`, `ContentToHash`,
`SchemeStatus` are byte-identical; the two external callers (`lib-core/src/model/user.rs`,
`lib-web/src/handlers/handlers_login.rs`) are untouched. No ts-rs binding changes.

## Considered and rejected

- **A validated newtype `SchemeName(String)`.** Rejected: it stays string-backed and
  keeps `get_scheme` fallible. The scheme set is compile-time, so open-endedness buys
  nothing; an enum makes the match exhaustive and the lookup total.
- **`PwdParts` in the `scheme` module** (as card C-07's wording first implied).
  Rejected: it would widen the scheme interface with a storage-format job. Split by
  responsibility instead — `scheme` owns the token, `pwd` owns its envelope.
- **Re-typing `SchemeNotFound(String)`.** Rejected: it would churn the
  `lib_auth_pwd_Error.d.ts` binding (which the front-end does not consume) for no gain.
  The raw bad token is exactly what a parse error should report.
- **A macro to collapse the three error boilerplate blocks** (card C-09). Rejected here:
  its deletion test fails — a macro relocates the boilerplate, it does not concentrate
  it — and it adds indirection the rust10x blueprint avoids. Out of scope.

## Consequences

- **An invalid scheme is unrepresentable** past the `FromStr` edge; `get_scheme` cannot
  fail.
- **`hasher.rs` is orchestration only** — hash, wrap, `Display`; parse, `status`,
  validate.
- **The wire tokens `01` / `02` stay byte-stable**, so every existing stored hash
  validates unchanged.
- **The ts-rs bindings are unchanged**; the CI drift guard stays green with no
  `cgs bindings` diff.
- **New files** `pwd/scheme/name.rs` and `pwd/pwd_parts.rs`; `mod.rs` files stay
  wiring-only. The ADR index regenerates via `cgs adr:index`.
