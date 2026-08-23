# Realtime push authorization lives at subscribe-time, reusing the read scope

The back-end's realtime feed (`GET /ws`) fans **every** event to **every**
connected socket: the send task forwards each broadcast unconditionally, the
`SubscriptionRequest` handler is a no-op (`// … all connected clients receive all
broadcasts.`), and the socket carries no caller identity — `/ws` is not behind
`mw_ctx_require` and the handler discards the resolved `Ctx`. The one live emitter
broadcasts a full `ConvMsg` on every `add_conv_msg`. So a private (`OwnerOnly`)
Conversation's message payloads reach every socket — even anonymous ones — and the
front-end only *appears* to filter, with a client-side `if (c.id === convId)`
guard. That guard is not a security boundary, exactly as the landed front-end
`conv.list` filter was not: this is [ADR-0014](0014-backend-row-scoped-authorization-seam.md)'s
Owner boundary, unenforced on the **push path**.

This ADR records **where realtime authorization lives**. The enforcing slice (for
`Conv` message events) is specified in
`backend/docs/ar/c03-realtime-channel-design.md`; this ADR distills the durable
decision. It is the push-path companion to ADR-0014 (which governs the read/write
path) and reuses ADR-0014's scope verbatim rather than inventing a second one.

## Decisions

**The socket is authenticated, with identity captured at upgrade.** `/ws` gains
`mw_ctx_require`, and the handler extracts `CtxW` at the HTTP upgrade (where
`mw_ctx_resolver` has already run and the cookie is present), threading
`ctx.user_id()` into the long-lived connection. A WebSocket has no per-message
auth, so identity is fixed once, at upgrade.

**Authorization is evaluated at subscribe-time, not per emitted event.** On a
`subscribe conv:N` the server calls `ConvBmc::get(ctx, mm, N)` — already
read-scoped by ADR-0014 (owner ∪ `MultiUsers`). Success adds the Channel to the
connection's authorized subscription set; an `EntityNotFound` refuses it. The
authorization predicate therefore lives in **one** place (ADR-0014's
`access_scope`), never duplicated onto the push path.

**Fan-out is default-deny.** The send task forwards an event to a connection only
if the event's Channel is in that connection's authorized subscription set. A
connection with no subscription — including the transient window after a
reconnect — receives nothing. This replaces the previous "everyone receives
everything" default and is what actually closes the leak.

**Subscription state is per-connection, shared across the split socket tasks.** The
socket splits into a receive task (parses `subscribe`/`unsubscribe`) and a send
task (filters the broadcast); they share the authorized set via an
`Arc<RwLock<HashSet<Channel>>>` — receiver writes, sender reads.

**The event envelope is a ts-rs binding.** `WsEvent` gains `#[derive(TS)]` and
exports, so the realtime contract joins the one-generated-source-of-truth guard
([ADR-0010](0010-monorepo-structure.md)) instead of being hand-mirrored on the
front-end. The `payload` stays `serde_json::Value` (typed per `event_type` by the
consumer) for this slice.

**"Channel" names the realtime routing key.** A Channel is `conv:{id}` — the key an
event is addressed to and a subscription names. It is deliberately **not** the
planned `Agent → Topic` rename (#31, retargeted from `Channel` to `Topic` by this
decision): a Channel routes live Events, a Topic groups Threads.

## Considered and rejected

- **Emit-time per-event authorization** — for each event, re-check every subscribed
  socket's scope. Rejected: it duplicates ADR-0014's predicate onto the push path,
  pays a check per (event × socket), and forces the event payload to carry
  `owner_id`/`kind`. Subscribe-time reuses `ConvBmc::get` and checks once.
- **Server auto-subscribes each connection to all readable Conversations** — avoids
  a client protocol. Rejected: `MultiUsers` is world-readable, so this floods every
  socket with all public traffic and fights the front-end's one-conversation-at-a-time
  view. Client-driven subscription matches the UI.
- **Keep client-side filtering as the boundary** — rejected: identical in kind to
  the `conv.list` filter leak ADR-0014 exists to fix; the payload still crosses the
  wire to a client that may not read it.
- **Shrink the interface (drop `SubscriptionRequest` / the channel field)** — the
  architecture review's "honest" alternative. Rejected: it does not fix the leak
  (the `conv_msg` fan-out, not the subscription protocol, is what leaks) and the
  front-end already drives per-conversation `subscribe`.

## Consequences

- **The default-deny flip requires a front-end change**, landing with this slice:
  `useWebSocket` remembers desired subscriptions and **replays them on
  `onopen`** (fixing both the first-connect race and reconnect). Without it a
  reconnected socket would silently go dead. The client-side `if` guard is kept as
  harmless belt-and-suspenders.
- **The front-end `conv.list` `owner_id` filter and the client-side conv guard
  become view conveniences**, no longer boundaries — kept, not removed.
- **Two dead broadcast helpers are removed** (`broadcast_conv_update`,
  `broadcast_agent_update`, zero callers); a real `conv_update`/`agent_update`
  emitter is (re)introduced with a caller when #85's live-propagation needs it.
- **Deferred, tracked in #88 → #91 "Realtime hardening II"** (not built in the
  original slice):
  - *Mid-session revocation (TOCTOU)* — because authz is cached at subscribe-time,
    a Conversation narrowed `MultiUsers → OwnerOnly` under a live subscription would
    keep delivering to that connection until it reconnects. **This is latent today:
    `kind` is immutable (`ConvForUpdate` has no `kind` field) and no Members exist
    (`ConvBmc::access_scope` is `owner ∪ MultiUsers`), so no operation can narrow a
    Conversation under a live subscription.** Guarded by
    `test_conv_kind_is_immutable_guard`; when `kind` becomes mutable or Members
    land, close it with an emit-time re-check or subscription-invalidation.
  - *Subscribe DoS* — each subscribe costs one `ConvBmc::get`. A **per-connection
    subscription cap (16)**, checked before the authorizing read, now bounds the
    held set and the concurrent authorizing reads (#88); **subscribe-frequency and
    server-side connection rate-limiting** remain deferred.
- **Cross-site production cookie flow.** The auth cookie is `HttpOnly` with the
  default `SameSite=Lax`, which rides the same-site `localhost:3000 → :8080`
  upgrade in dev. A cross-*site* production deploy would need `SameSite=None;
  Secure` (or a token handshake) for the cookie to reach the upgrade.
- **Anonymous `/ws` now 401s.** The socket is only opened inside the authenticated
  app (`fullstack.tsx`), so this bites on mid-session token expiry rather than
  steady state; the front-end reconnect is now bounded — exponential back-off then
  pause, not an unconditional 3s loop (#88). Server-side connection rate-limiting
  remains deferred (#91 "Realtime hardening II").
