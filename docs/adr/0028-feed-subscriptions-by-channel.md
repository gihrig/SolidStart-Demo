# Feed Subscriptions are held by Channel, over a swappable transport

_Supersedes [ADR-0017](0017-shared-client-feed-multiplexed.md) in part: its factory
seam and its callback registry. Its one Feed at the authenticated boundary and its
per-holder refcount carry over._

ADR-0017 made the client **Feed** (`CONTEXT.md`) singular. Each consumer registered
callbacks per kind on `MessageFeedOptions`. One `onmessage` branch per kind sent each
Event to every consumer. By #123, the Jedi view-model held four Channels. Each new
poke Channel took about seven hand edits in two modules: one callback option, one
`onmessage` branch, one guard in the view-model, one effect that moves the hold when
the selection moves, and one reconnect refetch. No test reached the Jedi dispatch
branches. The Jedi tests built five Feed fakes by hand. #124 and later tickets add
payload Channels for Comments.

## Decisions

**A Subscription is a Channel and a handler, held for its reactive scope.** A
view-model calls `feed.subscribe(channel, handler)`. `channel` is a reactive accessor
that returns a `Channel` or `undefined`. When the accessor changes, the Feed moves
the hold to the new Channel. `undefined` holds nothing. The view-model's reactive
scope releases the Subscription, so `Feed` has no `unsubscribe`. Only the held
Channel reaches the handler, so a view-model needs no guard per kind.

**The Feed routes by Channel key.** The Feed gets the Channel of each Event. A poke
carries its Channel. A payload Event derives it from its payload, as the back-end
`event.channel()` does. The Feed then calls each handler held on that key. A new
poke Channel needs no Feed edit. A new payload variant adds one line to the Channel
derivation.

**The seam is one `Feed` instance.** `createWebSocketFeed()` builds it at the
authenticated boundary (`routes/fullstack.tsx`, `routes/index.tsx`). Each view-model
takes it through the `feed?` seam. `Feed` is `{ connected, subscribe, onError }`.
ADR-0017 kept a factory because the callbacks lived on `MessageFeedOptions`, passed
at construction. A Subscription now brings its own handler, so that reason is gone.

**The holder is a Subscription.** The per-holder refcount carries over. The server
gets one `subscribe` at the first Subscription on a Channel, and one `unsubscribe`
at the last. Two `subscribe` calls on one Channel are two holders with two handlers.
ADR-0017's rejection of a call-count refcount still holds.

**The Feed recovers a missed Event.** On each connect, the first connect included,
the Feed replays the held Channels. Then it calls each handler one time
with no Event: `handler(undefined)`. A poke handler refetches. A payload handler can
reload, or it can ignore the call. A new or moved Subscription gets no such call,
because the view-model's own fetch covers it.

**One core, two transports.** `lib/feed.ts` holds the routing, the refcount, the
replay and the recovery, over a transport port. `lib/feed.websocket.ts` is the
WebSocket transport, with the reconnect and the back-off. `lib/feed.memory.ts` is
the in-memory transport for tests. It can emit an Event, raise a Feed error, set the
connection state, and list the held Channels. Tests run the real core.

**Feed errors go to a scope-held handler.** `feed.onError(handler)` replaces
`MessageFeedOptions.onError`. Its scope releases it. Each error still reaches every
held handler.

## Considered and rejected

- **Keep the callbacks per kind (ADR-0017).** Each new Channel costs about seven
  edits, and #124 would copy the pattern.
- **A fixed Channel per Subscription.** Each view-model then keeps one move effect
  per selection. Jedi already had two copies.
- **Keep the factory.** With no callbacks to pass, a factory adds a layer and gives
  nothing.
- **A list of poke kinds in the Feed**, so only poke Subscriptions get the resync
  call. That is a second list to edit per kind, and payload Subscriptions get no
  recovery.
- **An in-memory Feed that copies the core.** Tests would then exercise the copy, not
  the routing that runs in production.
- **Move only the Jedi view-model.** The Feed would keep two dispatch paths until
  #128 retires `conv`.
- **A client-side cap check** (a front-end copy of `MAX_SUBSCRIPTIONS = 16`). The
  server already enforces the cap. The correct fix is a server reply, logged to #91.

## Consequences

- The Conversation `agents` and `convs` lists now refetch after a reconnect. Before,
  they did not. The `conv_msg` handler ignores the resync call, as before. #128
  retires `conv`.
- `lib/websocket.ts`, `MessageFeed`, `MessageFeedOptions`, `MessageFeedFactory` and
  `useWebSocket` are gone. Each consumer test uses the in-memory transport.
- The wire protocol does not change, so ADR-0015 still applies. An over-cap or
  unauthorized `subscribe` still gets no server reply. #91 tracks a reject message.
- #124 adds its `post_comment` payload with one line in the Channel derivation.
