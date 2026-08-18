# Back-end — SolidStart Demo

Rust/Axum back-end (rust10x blueprint): JSON-RPC over HTTP + WebSocket, Postgres
via `sqlx`/`sea-query`/`modql`, ts-rs TypeScript bindings. Toolchain: Rust/`cargo`,
driven via `cgs`. This is the `backend/` subtree of the mono-repo (a SolidJS
front-end in `frontend/` + this back-end). Cross-cutting rules live in the root
`CLAUDE.md`; this file holds the back-end-specific rules and loads when Claude
works in `backend/`.

See [ADR-0010](../../docs/adr/0010-monorepo-structure.md) for the mono-repo
structure and [ADR-0011](../../docs/adr/0011-jedi-backend-domain-contract.md) for
what this back-end does.

---

## Commands

This subtree runs via `cgs <script>` (`run-cargo-script` on `backend/Scripts.toml`);
`cgs` reads the `Scripts.toml` in the working directory, so **run these from
`backend/`**. Cross-cutting recipes (`cgs dev`/`build`/`test`/`check`/`bindings`
over **both** subtrees) live in the root `Scripts.toml` and run **from the repo
root** — same `cgs` binary, different `Scripts.toml`.

Prefer the `cgs` recipes over raw `cargo`; each recipe wraps the exact `cargo`
invocation and keeps flags consistent. Raw `cargo` stays available for one-offs
that have no recipe (e.g. `cargo run -p gen-key`).

```text
| Command         | Description                                              |
| --------------- | -------------------------------------------------------- |
| `cgs dev`       | Start the web-server (`cargo run -p web-server`)         |
| `cgs dev-watch` | Start the web-server in watch mode                       |
| `cgs quick`     | Run the `quick_dev` example (login, CRUD, logout)        |
| `cgs db`        | Start the Postgres docker container                      |
| `cgs test`      | Run tests (`cargo nextest run -j1`)                      |
| `cgs test-watch`| Run tests in watch mode                                  |
| `cgs cover`     | Run tests with coverage + open report (`cargo llvm-cov --open`)|
| `cgs check`     | Format (fix) + lint (`cargo fmt --all && cargo clippy --all-targets`)|
| `cgs build`     | Build with debug symbols                                 |
| `cgs release`   | Build in release mode (`cargo build --release`)          |
| `cgs start`     | Build + run web-server in release (`cargo run -p web-server --release`)|
| `cgs bindings`  | Regenerate ts-rs bindings (`cargo test export_bindings`) |
| `cgs doc`       | Build & open project docs                                |
| `cgs update`    | Update dependencies (`cargo update`)                     |
| `cgs upgrade`   | Update the Rust toolchain (`rustup update`)              |
```

## Tech Stack

- **Framework**: Axum (HTTP) + `rpc-router` (JSON-RPC dynamic router)
- **DB**: Postgres via `sqlx`, `sea-query` (SQL builder), `modql` (filter DSL)
- **Auth**: cookie-based; `POST /api/login`, `POST /api/logoff`
- **RPC**: `POST /api/rpc`; **WebSocket**: `GET /ws`
- **Bindings**: ts-rs exports to `crates/services/web-server/bindings/`

Workspace crates: `lib-utils`, `lib-rpc-core`, `lib-auth`, `lib-core`, `lib-web`
(libs); `web-server` (service); `gen-key` (tool).

## Gotchas

- **`cgs` is overloaded by working directory**: from `backend/` it runs
  back-end recipes; from the repo root it runs the cross-cutting recipes. Check
  where you are before running `cgs dev`/`test`/`build`.
- **Postgres must be running** for the server, `quick_dev`, and the tests that
  touch the DB. Start it with `cgs db` (Postgres 17 docker container).
- **HTTP-layer integration test** lives in `crates/services/web-server/src/app.rs`
  (`#[cfg(test)] mod tests`): drives the shared `app()` router in-process via
  `axum-test` (login → rpc CRUD → logoff), the assert-based counterpart to the
  `quick_dev` example. Model-level `#[tokio::test]`s test the Bmc layer directly.
- **ts-rs bindings are the front-end's source of truth**: the front-end imports
  them via a tsconfig `paths` alias into `crates/services/web-server/bindings/`
  (ADR-0010). After changing a `#[derive(TS)]` type, run `cgs bindings` to keep
  them in step; ADR-0010 specs a CI bindings-drift guard (`cgs bindings` +
  `git diff --exit-code`) once the workflow lands.
- **CORS is configured for the front-end** at `http://localhost:3000` with
  credentials enabled (`crates/services/web-server/src/main.rs`).
- **`cargo watch` needs installing**: `cargo install cargo-watch` before
  `cgs dev-watch`/`cgs test-watch`.
