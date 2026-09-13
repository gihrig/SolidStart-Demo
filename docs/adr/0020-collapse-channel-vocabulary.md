# Collapse the realtime Channel vocabulary into one exported type

The realtime **Channel** (`CONTEXT.md`) was spelled in three types in
`web/routes_ws.rs`: the outbound envelope `WsEvent`, the inbound wire vocabulary
`ChannelKind`, and the internal routing key `Channel`. Adding one channel touched up
to seven sites across the three. `WsEvent::channel()` mapped each event variant to a
`Channel` by hand (`routes_ws.rs:77-88`); the compiler checked only exhaustiveness, so
a wrong arm still compiled, and two tests backfilled the guarantee
(`jedi_poke_wire_shape_is_stable`, `jedi_channel_keys_are_stable`).

This is candidate **C-04** of `backend/docs/ar/architecture-review-20260911-215934.html`.
It collapses the three types into one exported `Channel`. It **supersedes** two
ADR-0018 decisions: "Keep `Channel` and `ChannelKind` as two types" and the rejection
of merging them.

## Decisions

**One exported `Channel` type.** `Channel` becomes a typed enum with one variant per
channel, carrying its id where the routing key needs one (`Channel::PostLike(i64)`,
`Channel::Posts`). It derives `Serialize`, `Deserialize`, and `TS`, and replaces
`ChannelKind`. The wire kind string and the routing key both derive from the variant;
`key()` stays the one place the `post_like:{id}` format lives.

**`WsEvent` carries a `Channel`; the pokes stop re-enumerating.** `WsEvent` holds its
payload variants (`ConvMsg`, and the two comment channels once #113 builds
`CommentView`) plus one `Poke(Channel)` for the contentless pokes. A poke carries its
`Channel`; a payload event derives its `Channel` from the payload — `ConvMsg` reads
`payload.conv_id`, as it already did (`routes_ws.rs:79`). The hand-written
variant→variant map is gone, so a wrong arm can no longer compile.

**`authorize` stays an async method on `Channel`.** `Channel::authorize(&self, ctx,
mm).await` matches per variant. `Conv` keeps the ADR-0014 / ADR-0015 read scope
(`ConvBmc::get`, `routes_ws.rs:248`); every other channel is authenticated-read. An
async DB read does not fit a const descriptor table, so a method — not data — carries
the rule.

**The type stays in `web/routes_ws.rs`.** It keeps `key` and `authorize` next to its
only users. #128 reworks `authorize`, so an extraction now would be redone then.

**Wire-breaking by design.** The outbound `WsEvent` shape and the inbound
`SubscriptionRequest` shape change. Back-end and front-end ship together; `cgs
bindings` regenerates `Channel` (replacing `ChannelKind` and, for pokes, the `WsEvent`
variants), and `lib/channel.ts` rebuilds its constructors on the generated `Channel`.
This is acceptable for a same-origin dev app with no external clients — the same basis
ADR-0018 used.

## Considered and rejected

- **One struct — `WsEvent { channel: Channel, payload: Payload }`.** Rejected: the
  channel and the payload can disagree, which re-introduces a hand-checked invariant —
  the very thing this ADR removes.
- **`Channel { kind: ChannelKind, id: Option<i64> }`.** The literal form ADR-0018
  rejected. Rejected again: it loses arity — `conv` needs an id and `agents` rejects
  one, which the typed variants encode for free.
- **Keep `ChannelKind`, derive it from `Channel`.** Rejected: two types survive, so it
  is not the merge; it only moves the sync point.
- **Amend ADR-0018 with a second addendum.** Rejected: an accepted ADR would then
  argue both for and against two types in one file. A reversal earns its own entry.
- **Hold the wire byte-identical.** Rejected: it needs a custom `Serialize` to keep the
  old shape while the type merges, paying real complexity to protect a dev-only client
  that ships in the same commit.

## Consequences

- **The poke correctness is now structural.** The two backfill tests go; the wire-lock
  tests are rewritten to the new `WsEvent` / `Channel` shape (`routes_ws.rs:589-771`).
- **`authorize` is non-uniform until #128.** `Conv` runs `ConvBmc::get`; the rest
  return `true`. #128 ("Remove the FullStack surface") removes `Conv` / `Agents` /
  `Convs` from `Channel`, drops `WsEvent::ConvMsg`, and collapses `authorize` to
  uniform authenticated-read.
- **`CONTEXT.md` changes.** The Event entry no longer reads "one variant per Channel";
  a poke is `Poke(Channel)`. The Channel and Subscription entries name `Channel`, not
  `ChannelKind`, as the exported type.
- **`SubscriptionRequest` carries a `Channel`.** The id rides inside the variant, so a
  `conv` request with no id fails to deserialize — the check `Channel::parse` did by
  hand.
- **Companion to ADR-0015 / 0016 / 0017 / 0018.** All sharpen the one realtime seam;
  this one makes its vocabulary a single exported type.
