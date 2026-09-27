# The login handler keeps the rust10x blueprint's inline orchestration

`lib-web` is the back-end presentation crate — Axum handlers, middleware, the web
`Error`. Its `api_login_handler` (`crates/libs/lib-web/src/handlers/handlers_login.rs`)
orchestrates the login flow inline: look the user up (`UserBmc::first_by_username`),
validate the password (`pwd::validate_pwd`), upgrade the stored hash when the scheme is
outdated (`UserBmc::update_pwd`), then mint the auth cookie (`set_token_cookie`).
(`CONTEXT.md` does not cover `lib-web` — it is infrastructure, not Jedi domain.)

The lib-web architecture review after #162 raised this as card **C-14 — give the login
use-case its own seam** (`backend/docs/ar/architecture-review-20260921-211857.html`,
issue #166): extract a `login()` function so the handler is thin and the flow is testable
without HTTP. The review flagged the tension with the rust10x blueprint, and grilling
confirmed it: our `api_login_handler` is a **line-for-line copy of the blueprint's**
(`rust10x/rust-web-app`, `crates/libs/lib-web/src/handlers/handlers_login.rs`). The RPC
handlers in the same crate already delegate (both funnel through `rpc_dispatch`), so login
is the one handler with inline orchestration — and that inline shape *is* the blueprint.

This repeats the #164 pattern, where cards C-08 / C-09 were rejected in favor of the
blueprint (commit `4a613da`; the C-09 rejection is recorded in
[ADR-0023](0023-typed-scheme-name-lib-auth.md)). This ADR records the same decision for
the login handler so future reviews do not re-suggest it.

## Decision

**The login orchestration stays inline in `api_login_handler`.** We do not extract a
`login()` use-case seam. Auth/presentation handlers in `lib-web` follow the rust10x
blueprint shape; a single-caller handler flow is not extracted for testability alone.

This does not loosen the thin-handler rule elsewhere: handlers that already delegate (the
RPC handlers) stay thin. The decision is specific to the login/auth handler flow, which
the blueprint deliberately keeps inline.

## Considered and rejected

- **Extract `login(&mm, username, pwd)` inside `lib-web`** (card C-14, option B).
  Rejected: the gain is marginal and DB-bound. The flow calls `UserBmc::first_by_username`
  and `UserBmc::update_pwd`, so an extracted `login()` still needs Postgres — its test is a
  DB test minus the HTTP layer, not a unit test. The happy path is already covered by the
  in-process HTTP integration test (`crates/services/web-server/src/app.rs`,
  `test_web_login_rpc_logoff_ok`). The only branch not exercised in isolation is the
  password-scheme upgrade, which does not justify diverging from the blueprint on a
  ~40-line, single-caller flow.
- **Relocate the use-case to `lib-core` / `lib-auth`** (card C-14, option C). Rejected: a
  larger divergence with cross-crate ripple, further from the blueprint, for the same
  marginal gain.

## Consequences

- **`api_login_handler` is unchanged**; no code, test, or ts-rs binding change lands with
  this ADR.
- **`lib-web` stays in step with the rust10x blueprint** for auth handlers; future
  blueprint updates to the login flow apply cleanly.
- **Future architecture reviews should not re-suggest** extracting the login/auth handler
  use-case. If the password-scheme-upgrade branch needs coverage, add a targeted case to
  the HTTP integration harness rather than extracting a seam; a change of this decision is
  a new ADR that supersedes this one.
- The ADR index regenerates via `cgs adr:index`.
