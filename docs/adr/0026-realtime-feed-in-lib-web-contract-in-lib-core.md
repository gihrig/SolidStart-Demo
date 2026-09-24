# The realtime Feed lives in `lib-web::ws`, its exported contract in `lib-core::realtime`

The realtime **Feed** (CONTEXT.md "Real-time feed") is the WebSocket stream a client
receives Events on: a broadcast hub, a per-connection socket driver, subscription
authorization, the exported `Channel` / `WsEvent` contract, and the compile-time **Poke**
rule ([ADR-0016](0016-poke-rule-typed-receipt.md)). Until this decision the whole
subsystem lived inline in the `web-server` service crate
(`crates/services/web-server/src/web/routes_ws.rs`, ~860 lines, plus `web/poke.rs`).

Every other handler in the service already delegates: `routes_login` and `routes_rpc` are
thin wiring that funnel into `lib-web` handlers. The Feed was the one handler that did
not — it carried its whole mechanism, and the exported `Channel` / `WsEvent` contract
(the front-end's source of truth via ts-rs) was defined in the service binary rather than
beside the rest of the domain in `lib-core`.

The `web-server` architecture review after #163 raised this as cards **C-16** (relocate
the Feed behind a lib seam) and **C-17** (co-locate the Poke rule)
(`backend/docs/ar/architecture-review-20260922-084743.html`, issue #167). Issue #167 asks
to "keep the service thin, delegate to the libs."

This is the counterpart to [ADR-0025](0025-login-handler-keeps-blueprint-inline-orchestration.md),
which **kept** the login handler inline. That decision rested on the login flow being a
line-for-line copy of the rust10x blueprint (`rust10x/rust-web-app`). The Feed is
different: the blueprint ships **no** WebSocket / realtime layer at all (verified against
its tree — its `web-server` is `config` · `error` · `main` · `web/{routes_login,
routes_rpc, rpcs}`), so the Feed is project-specific code, not a blueprint copy. There is
no blueprint shape to diverge from, and the thin-service rule applies with full force.

## Decision

**The realtime Feed is split across the two crates that already own its two natures.**

- **The exported contract lives in `lib-core::realtime`** — `Channel`
  (`realtime/channel.rs`) and `WsEvent` (`realtime/event.rs`). `lib-core` owns the domain
  and every other ts-rs-exported type; `TS_RS_EXPORT_DIR` is global, so the generated
  bindings are unchanged. `Channel` keeps `key()` and its DB-backed `authorize()`
  read-scope rule as methods, beside `ConvBmc` — the authorization rule is domain policy
  ([ADR-0014](0014-backend-row-scoped-authorization-seam.md) /
  [ADR-0015](0015-realtime-push-authorization-at-subscribe-time.md)), and its exhaustive
  match welds "a new channel variant must force an authorization decision" to the type.

- **The mechanism lives in `lib-web::ws`** — the broadcast hub (`ws/hub.rs`), the socket
  driver and subscription-authorization fan-out (`ws/socket.rs`), and the co-located Poke
  rule (`ws/poke.rs`). `lib-web` is the presentation crate; it already has `axum`,
  `tokio`, `lib-core`, and `rpc-router`, and `ws` sits beside `handlers` / `middleware` /
  `routes`.

- **The service keeps only the mount.** `app.rs` calls `lib_web::ws::routes(ws_state,
  mm)`; the RPC handlers import `WsState` and the `poke` module from `lib-web`. The
  service no longer contains any Feed code.

- **C-17: the Poke rule is one module.** `PokeReceipt`, `PokedRpcResult`, and the channel
  markers now share `ws/poke.rs`. `PokeReceipt::new` is `pub(super)`, so only the
  `broadcast_*` helpers inside `lib-web::ws` mint one — an external handler still cannot
  fabricate a receipt, so [ADR-0016](0016-poke-rule-typed-receipt.md) holds.

## Considered and rejected

- **Keep the Feed inline in the service** (status quo). Rejected: it was the only handler
  that did not delegate, and #167 asks to delegate. Unlike login
  ([ADR-0025](0025-login-handler-keeps-blueprint-inline-orchestration.md)), no blueprint
  reason keeps it there — rust10x has no ws layer.

- **Move only `Channel` to `lib-core`, keep `WsEvent` with the broadcaster.** Rejected:
  both are `#[ts(export)]` domain vocabulary (CONTEXT.md "Channel" / "Event"); keeping
  them together in `lib-core::realtime` gives the exported contract one home.

- **Make `authorize` a `lib-web` free function.** Rejected: it is DB-bound
  (`ConvBmc::get`); `lib-web` has no DB-test infrastructure, while `lib-core` already
  runs the two-user scope tests. Keeping it a `Channel` method fits the existing tests and
  keeps the exhaustiveness guard on the type.

- **Move `PokedRpcResult` to `lib-rpc-core`, next to its wire twin `DataRpcResult`.**
  Rejected: it re-splits the Poke rule across crates, the opposite of C-17.

- **A dedicated `lib-ws` crate.** Rejected: over-scoped; the mechanism fits `lib-web` with
  no new crate and no new dependency but `futures`.

- **Unify the phantom markers with `Channel`** (drop the separate `Convs` / `Agents` /
  `Conv` markers). Rejected: it reopens [ADR-0016](0016-poke-rule-typed-receipt.md)'s
  typed proof for no gain here; a possible future candidate, not this pass.

## Consequences

- **The service is uniformly thin** — login, RPC, and ws handlers all delegate to
  `lib-web`.
- **`lib-core::realtime` owns the exported realtime contract**; bindings are byte-identical
  (one intra-doc link demoted where `SubscriptionRequest` became cross-crate).
- **`lib-web::ws` owns the transport and the co-located Poke rule**; the mint is
  `pub(super)`.
- **Dependencies shift:** `web-server` sheds `futures`, `time`, and `ts-rs` (the moved code
  was their only user); `lib-web` gains `futures`. The four Jedi `broadcast_*` helpers drop
  their `#[allow(dead_code)]` — in a library crate a `pub` API is not dead code.
- **`CONTEXT.md` pins the new module homes** for Feed / Channel / Event.
- **Future reviews should not re-suggest inlining the Feed.** This ADR is the counterpart to
  [ADR-0025](0025-login-handler-keeps-blueprint-inline-orchestration.md): the login handler
  stays inline because it is a blueprint copy; the Feed moves out because it is
  project-specific. A change of this decision is a new ADR that supersedes this one.
- The ADR index regenerates via `cgs adr:index`.
