# AR C03 — Realtime push authorization at the WebSocket channel — Design spec

- **Status:** Reviewed and confirmed. **ready for agent.**
- **Source:** `docs/ar/architecture-review-20260818-223636.html`, candidate 03 ("The WebSocket channel that nothing routes on").
- **Branch:** `arch-review-8-18` · **Drafted:** 2026-08-21
- **Scope of this slice:** enforce the **Owner** boundary on the realtime **push** path — a socket receives a Conversation Event only for a Channel it is entitled to read. The read/write path is already scoped by [ADR-0014](../../../docs/adr/0014-backend-row-scoped-authorization-seam.md); this is its push-path companion, recorded in [ADR-0015](../../../docs/adr/0015-realtime-push-authorization-at-subscribe-time.md).

---

## 1. Problem

The realtime feed is an **inverted module**: its interface (per-channel subscription) is richer than its behavior (fan-out to all). Three facts, from the code:

- **Every socket receives every event.** The send task forwards each `rx.recv()` unconditionally (`web/routes_ws.rs:85-107`); the `SubscriptionRequest` handler is a no-op — `// … all connected clients receive all broadcasts.` (`web/routes_ws.rs:122-124`).
- **The socket has no identity and no auth.** `ws_handler` extracts only `State<Arc<WsState>>` (`web/routes_ws.rs:73-78`); `/ws` gets no `mw_ctx_require` — `// WebSocket routes (auth handled in the WS handler if needed).` (`app.rs:26`), though the global `mw_ctx_resolver` already runs for it (`app.rs:47`).
- **The one live emitter carries a full `ConvMsg`.** `add_conv_msg → ws_state.broadcast_conv_msg(conv_id, &payload)` (`web/rpcs/conv_rpc.rs:42-48`), stamped `channel: format!("conv:{}", conv_id)` (`web/routes_ws.rs:160`).

Consequence: a private (`OwnerOnly`) Conversation's message payloads reach **every** connected socket — including anonymous ones — and the front-end only _appears_ to filter, with a client-side guard `if (c && c.id === convId)` (`createConvMessages.ts:55`). That guard is not a security boundary, exactly as the landed `conv.list` filter was not. **This is [ADR-0014](../../../docs/adr/0014-backend-row-scoped-authorization-seam.md)'s Owner boundary, unenforced on the push path.**

Two of the three broadcast helpers are dead: `broadcast_conv_update` (`web/routes_ws.rs:166`) and `broadcast_agent_update` (`web/routes_ws.rs:175`) have **zero callers** (grep), and the front-end `onmessage` handles only `conv_msg` (`websocket.ts:68`).

`CONTEXT.md` already specifies the access rules the push path does not honor: `OwnerOnly` is private, `MultiUsers` is public (`CONTEXT.md`, _Conversation kind_).

---

## 2. Decision log

Every decision below was settled in the grilling session (Q1–Q9).

| #   | Decision                       | Choice                                                                                                                                          |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Objective                      | **Security fix** — close the push-path confidentiality leak; reject pure-shrink (it does not fix the `conv_msg` fan-out, and the FE subscribes) |
| Q2  | Socket auth + identity         | `/ws` requires auth (`mw_ctx_require`); identity captured at **upgrade** via `CtxW`, threaded into the connection                               |
| Q3  | Dead broadcast helpers         | **Delete** `broadcast_conv_update` + `broadcast_agent_update` now; re-add with real emitters for #85                                            |
| Q4  | Where authz lives              | **Subscribe-time**, reusing `ConvBmc::get` (ADR-0014 read scope); emit flips to **default-deny**; per-connection set shared `Arc<RwLock<…>>`    |
| Q5  | Slice scope                    | Back-end **+ a minimal front-end change**: `useWebSocket` replays subscriptions on `onopen` (fixes first-connect race + reconnect)              |
| Q6  | Vocabulary                     | Keep **Channel** for the WS routing key; rename **Agent → Topic** (#31); add a **Realtime feed** section to `CONTEXT.md`                        |
| Q7  | Event contract                 | `WsEvent` gains `#[derive(TS)]` + export; FE consumes the generated type; `payload` stays `serde_json::Value`                                   |
| Q8  | Revocation limitation recorded | ADR-0015 _Consequences_ + §7 here + issue **#88** — **not** `CONTEXT.md` (glossary-only)                                                        |
| Q9  | Lifecycle semantics            | Empty set → receives nothing; `unsubscribe` removes; accept only `channel == "conv"` (unknown kinds ignored); DoS hardening deferred (#88)      |

---

## 3. Mechanism — the seam

### 3.1 Authenticate the socket, capture identity at upgrade

- `app.rs`: add `.route_layer(middleware::from_fn(mw_ctx_require))` to `routes_ws` (mirrors `routes_rpc`, `app.rs:22-23`). The global `mw_ctx_resolver` (`app.rs:47`) has already stashed the `CtxExtResult`, so `mw_ctx_require` (`mw_auth.rs:18-28`) 401s an anonymous upgrade.
- `routes_ws.rs`: `ws_handler(ctx: CtxW, ws: WebSocketUpgrade, State(state): State<…>)` — both are `FromRequestParts`, so they coexist. Move `ctx.0` into `handle_socket`; a WebSocket has no per-message auth, so identity is fixed **once**, at upgrade.

### 3.2 A per-connection subscription set, shared across the split tasks

`handle_socket` splits the socket into a receive task and a send task (`routes_ws.rs:80-107`). They share:

```rust
let subs: Arc<RwLock<HashSet<String>>> = Arc::new(RwLock::new(HashSet::new()));
```

- **Receive task** (`routes_ws.rs:110-138`): on a `SubscriptionRequest`, require `channel == "conv"` and `id = Some(n)` (Q9); the Channel key is `format!("conv:{n}")` — the same shape the event carries (`routes_ws.rs:160`). Then:
  - `action == "subscribe"` → **authorize**: `ConvBmc::get(&ctx, &mm, n).await` (ADR-0014 read scope). `Ok(_)` → `subs.write().await.insert(key)`; `Err(EntityNotFound)` → ignore (not entitled).
  - `action == "unsubscribe"` → `subs.write().await.remove(&key)`.
- **Send task** (`routes_ws.rs:85-107`): forward an event only if `subs.read().await.contains(&event.channel)` — otherwise skip. This is the **default-deny** flip: a connection with an empty set receives nothing.

Authorization reuses ADR-0014's `access_scope` through `ConvBmc::get` — **no predicate is duplicated** into the WS layer. This needs the `ModelManager` at the socket: thread it in via `routes_ws::routes(ws_state, mm)` (mirroring `routes_rpc::routes(mm, ws_state)`), carried in the route state alongside `WsState`.

### 3.3 Remove the dead helpers

Delete `broadcast_conv_update` (`routes_ws.rs:166-172`) and `broadcast_agent_update` (`routes_ws.rs:175-181`). `broadcast_conv_msg` (the one live helper, `routes_ws.rs:157`) stays.

### 3.4 Bring the event envelope under ts-rs

`WsEvent` (`routes_ws.rs:18-23`) gains `#[derive(TS)]` + `#[ts(export)]`; run `cgs bindings`. The front-end's hand-authored `WsMessage` (`frontend/src/types/backend/index.ts:98`) is replaced by the generated type. `payload: serde_json::Value` remains untyped (consumer casts per `event_type`).

---

## 4. The front-end half (Q5) — required, not optional

Default-deny breaks the current FE, which subscribes only on conversation change and never replays:

- The subscribe effect depends only on `conv()` — `createEffect(() => { … subscribe("conv", c.id) … })` (`createConvMessages.ts:61-65`) — and `subscribe` no-ops unless the socket is open, `if (ws?.readyState === WebSocket.OPEN)` (`websocket.ts:82`). Since `connect` is deferred to `onMount` (`websocket.ts:100`), the **first** subscribe is dropped.
- A reconnect builds a **new** socket, `setTimeout(connect, 3000)` → `ws = new WebSocket(WS_URL)` (`websocket.ts:58,49`), with **no replay** — the new connection's server-side set is empty → silence.

**Change (`websocket.ts`):** keep a `Set<string>` of desired subscriptions that `subscribe`/`unsubscribe` update; in `ws.onopen`, replay every tracked subscription. This fixes both the first-connect race and reconnect. Keep the `if (c.id === convId)` guard (`createConvMessages.ts:55`) as harmless belt-and-suspenders. The BE and FE halves must land together.

---

## 5. Channel vs Topic (Q6)

"Channel" stays the realtime routing key (`conv:{id}`). The planned `Agent` rename is retargeted **`Agent → Topic`** (#31, `CONTEXT.md` rename table) so it no longer collides. New `CONTEXT.md` _Realtime feed_ section defines **Feed / Channel / Subscription / Event**. A Topic groups Threads; a Channel routes live Events.

---

## 6. Verification plan

WebSocket flows are awkward to drive in the in-process `axum-test` harness (`app.rs`), so split the proof:

- **Unit — the filter is a pure decision.** Factor "forward this event?" to `subs.contains(&event.channel)` and test: empty set → drop; matching key → forward; non-matching → drop.
- **Unit/Bmc — the authorization decision** reuses the ADR-0014 two-user fixture: for User B, `ConvBmc::get(B, A_owneronly)` → `EntityNotFound` (so `conv:{A_owneronly}` is never inserted); `ConvBmc::get(B, A_multiusers)` → `Ok` (inserted). This asserts the subscribe gate without a live socket.
- **Integration (one case).** A real bound server + a WebSocket client (e.g. `tokio-tungstenite`): B subscribes to A's `OwnerOnly` → receives no `conv_msg` when A posts; B subscribes to A's `MultiUsers` → receives it. If a bound-server harness is too heavy for this slice, record it as the one deferred test and lean on the two unit layers.
- **Front-end.** Extend `websocket.unit.test.ts`: subscriptions are replayed after a simulated reconnect; `onConvMsg` still filters by conv id.

---

## 7. Out of scope (documented gaps — deferred, not silent) → #88

1. **Mid-session revocation (TOCTOU).** Authz is cached at subscribe-time; a Conversation narrowed `MultiUsers → OwnerOnly` (or a Member removed) after a client subscribed keeps delivering until reconnect. Closed later by an emit-time re-check or subscription-invalidation.
2. **Subscribe DoS.** Each subscribe costs one `ConvBmc::get`; add rate-limiting + a per-connection subscription cap.
3. **`conv_update` / `agent_update` events.** Removed here; re-introduced with real emitters when #85's live-propagation needs them.
4. **Cross-site production cookie flow.** The auth cookie is `HttpOnly`, default `SameSite=Lax` (`token.rs:18-20`) — fine for the same-site dev upgrade; a cross-_site_ prod deploy needs `SameSite=None; Secure` or a token handshake.

Items 1–2 are tracked in **#88**; none belongs in `CONTEXT.md` (glossary only — Q8).

---

## 8. Files to change

| File                                                             | Change                                                                                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/services/web-server/src/app.rs`                          | `mw_ctx_require` on `routes_ws`; pass `mm` into `routes_ws::routes`                                                                                                          |
| `crates/services/web-server/src/web/routes_ws.rs`                | Extract `CtxW`; per-connection `Arc<RwLock<HashSet>>`; authorize subscribe via `ConvBmc::get`; default-deny send filter; `#[derive(TS)]` on `WsEvent`; delete 2 dead helpers |
| `crates/services/web-server/src/main.rs`                         | Thread `mm` to `routes_ws::routes` if constructed there                                                                                                                      |
| `crates/services/web-server/bindings/` (generated)               | `cgs bindings` — new `WsEvent` binding                                                                                                                                       |
| `frontend/src/lib/websocket.ts`                                  | Track desired subscriptions; replay on `onopen`; consume generated `WsEvent`                                                                                                 |
| `frontend/src/types/backend/index.ts`                            | Drop hand-authored `WsMessage`; alias the generated type                                                                                                                     |
| `frontend/src/lib/websocket.unit.test.ts`                        | Replay-on-reconnect + filter tests                                                                                                                                           |
| `CONTEXT.md`                                                     | _Realtime feed_ section; `Agent → Topic` in the rename table (done)                                                                                                          |
| `docs/adr/0015-realtime-push-authorization-at-subscribe-time.md` | ADR (done)                                                                                                                                                                   |
| `docs/ar/architecture-review-20260818-223636.html`               | Mark C03 landed (per the C01 pattern) once merged                                                                                                                            |

---

## 9. ADR

The durable decision — socket auth at upgrade, subscribe-time authorization reusing ADR-0014's read scope, default-deny fan-out, and the `WsEvent` ts-rs binding — is recorded in [ADR-0015](../../../docs/adr/0015-realtime-push-authorization-at-subscribe-time.md), the push-path companion to [ADR-0014](../../../docs/adr/0014-backend-row-scoped-authorization-seam.md).
