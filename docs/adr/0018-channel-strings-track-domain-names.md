# Channel strings track domain names, mirrored front-end from a generated `ChannelKind`

The realtime **Channel** (`CONTEXT.md`) is the routing key an Event is addressed to
and a Subscription names. On the back-end it is a typed enum —
`Channel { Conv(i64), Agents, Convs }` (`web/routes_ws.rs`) with `parse` / `key` /
`authorize`. On the front-end the same names were bare string literals at four call
sites (`lib/conversationWorkspace.ts:177-178`, `lib/createConvMessages.ts:65,80`),
passed through a `subscribe(channel: string, id?)` port (`lib/websocket.ts:33`). A
typo — `subscribe("agentz")` — compiled; the back-end's `parse` returned `None`
(`web/routes_ws.rs:134`); the client then silently received nothing. Two entity
renames are also coming: Agent → Topic (#31) and the `Conv*` family → `Thread*`
(`CONTEXT.md` rename table).

This ADR records mirroring the Channel vocabulary on the front-end, sourcing it from
the back-end, and deciding that a channel string tracks its entity's domain name.

## Decisions

**The back-end is the one source; generate `ChannelKind`.** A kind-only enum
`ChannelKind { conv, agents, convs }` derives ts-rs (`#[ts(export)]`), the same
pattern `ConvKind` already uses (`lib-core/src/model/conv.rs:24-27`). `cgs bindings`
emits `ChannelKind.d.ts`; the front-end consumes it through the `~/types/backend`
barrel, re-exported unchanged like the other string unions
(`types/backend/index.ts:24`). The existing CI `bindings-drift` guard
(`.github/workflows/ci.yml:110`) covers it for free.

**Load-bearing: the wire field is `ChannelKind`, not a string.**
`SubscriptionRequest.channel` becomes `ChannelKind`, and `Channel::parse` matches the
enum instead of `req.channel.as_str()` (`web/routes_ws.rs:130`). This is what makes
generation reliable: the parsed vocabulary and the exported vocabulary are the same
type, so they cannot drift. Export without this step would only relocate the
hand-sync from front-end↔back-end to a back-end-internal enum↔`parse` gap.

**Keep `Channel` and `ChannelKind` as two types.** `ChannelKind` is the id-less
wire and binding vocabulary. `Channel` (`Conv(i64)`, kind + id) stays internal for the
routing key `conv:{id}` (`web/routes_ws.rs:142`) and the subscribe-time authorization
`ConvBmc::get` (ADR-0014 / ADR-0015). Two jobs, two types; `key` and `authorize` are
untouched.

**Front-end mirror is a constructor module (Level 2), not a bare union.** A `Channel`
module (`lib/channel.ts`) exposes `Channel.conv(id)`, `Channel.agents`,
`Channel.convs`, built on the generated `ChannelKind`; `subscribe` / `unsubscribe`
take a `Channel`. This adds the arity a bare union cannot: `conv` requires an id,
`agents` / `convs` reject one. Generation gives the names; the constructor gives the
shape.

**Track: a channel string equals its entity's domain name.** When Agent → Topic
lands, `agents` → `topics` and `AgentUpdate` → `TopicUpdate`; when `Conv*` → `Thread*`
lands, `conv` / `convs` → `thread` / `threads` and `conv:{id}` → `thread:{id}`. The
wire vocabulary follows the domain, not a frozen protocol name. The load-bearing
`ChannelKind` is what makes each such rename a single, compile-checked edit.

**Scope: this installs the mechanism with today's names.** The change introduces
`ChannelKind`, the internal `Channel`, and the front-end module carrying `conv`,
`agents`, `convs`. It renames nothing. #31 and the `Conv*` → `Thread*` work perform
the renames later, each riding the safety this ADR installs.

## Considered and rejected

- **Hand-mirror the names on the front-end only** — a `Channel` module typed by hand,
  guarded by a contract test. Rejected: with renames imminent (#31, `Conv*` →
  `Thread*`) and this repo serving as a reference for future ones, a generated source
  makes drift a *build* failure; a hand-mirror makes it, at best, a *test* failure.
  The front-end already carried a dead hand-authored union (`WsSubscription`,
  `types/backend/index.ts:113`) that had drifted out of use — the concrete failure
  mode of hand-mirroring.
- **Freeze the channel strings as a stable wire vocabulary**, decoupled from domain
  names. Rejected: a channel named `agents` that pokes a *Topic* list is exactly the
  incoherence the ubiquitous-language rule exists to prevent. Track was chosen; its
  cost — a rename touches the wire — is paid down by the load-bearing enum.
- **Consume the generated union directly (Level 1)** — a bare
  `"conv" | "agents" | "convs"`. Rejected: it catches typos but not arity;
  `subscribe("conv")` with no id, or `subscribe("agents", 5)` with a stray one, still
  compiles.
- **Merge `Channel` and `ChannelKind`** into one type holding a kind + `Option<i64>`.
  Rejected: it churns `key` / `authorize` / `WsEvent::channel` for no gain; the id-less
  wire kind and the id-bearing routed key are genuinely different jobs.

## Consequences

- **Unknown-kind failure moves, but stays a silent ignore.** With
  `channel: ChannelKind`, serde rejects an unknown kind while deserializing
  `SubscriptionRequest`, so the whole request is dropped by the existing
  `if let Ok(req)` guard (`web/routes_ws.rs:252`) — where today `parse` accepts the
  string and returns `None`. Same outcome (ignored); the three parse tests that build
  an unknown-kind request (`web/routes_ws.rs:378-408`) are reworked to assert the
  deserialize-level rejection.
- **A future rename is one compile-checked edit.** A back-end `ChannelKind` variant
  rename → `cgs bindings` regenerates → the front-end `Channel` constructor's literal
  no longer matches the union → the front-end build fails in CI → fix the one
  constructor and its call sites. That chain is the whole point.
- **Wire-breaking by design.** Because strings track domain names (Track), a rename
  changes the `conv:{id}` shape on the wire; back-end and front-end must ship together,
  and an old client breaks. Acceptable here — a same-origin dev app with no external
  clients; a public protocol would reconsider.
- **Companion to ADR-0015 / 0016 / 0017.** ADR-0015 typed the routing key and
  authorized it; 0016 gave the poke a typed receipt; 0017 made the client Feed
  singular. This one makes the Channel *vocabulary* a single generated source the
  front-end mirrors. All four sharpen the same realtime seam.
