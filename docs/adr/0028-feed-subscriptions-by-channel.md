# One client Feed; Subscriptions are held by Channel over a swappable transport

## Decisions

- **One Feed for each logged-in client.** `routes/index.tsx` creates it.
  Each view-model takes it through the `feed?` seam.
- **A Subscription is a Channel and a handler.** `feed.subscribe(channel,
  handler)` takes a reactive accessor. When the accessor changes, the hold
  moves. `undefined` holds nothing. The reactive scope releases the
  Subscription, so the Feed has no `unsubscribe`.
- **The Feed routes by Channel key.** A new poke Channel needs no Feed edit.
- **Holds are counted for each Subscription.** The server gets one `subscribe`
  at the first holder of a Channel, and one `unsubscribe` at the last.
- **The Feed recovers missed Events.** On each connect, the Feed replays the
  held Channels. Then it calls each handler with `undefined`, so a poke handler
  refetches.
- **One core, two transports.** `lib/feed.ts` holds the routing, the counts and
  the recovery. `feed.websocket.ts` reconnects with back-off. `feed.memory.ts`
  serves the tests, so the tests run the real core.

## Considered and rejected

- **One socket for each view-model.** Each socket has its own reconnect state.
- **Callbacks for each kind.** Each new Channel then takes about seven edits.
- **Count subscribe calls, not holders.** A double subscribe then miscounts.
- **A client copy of the subscription cap.** The server already enforces it.
