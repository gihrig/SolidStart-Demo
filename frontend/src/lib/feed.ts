import { createEffect, on, onCleanup, type Accessor } from "solid-js";
import { Channel } from "~/lib/channel";
import type { WsEvent } from "~/types/backend";

/**
 * A Subscription's handler. It gets each Event on the held Channel. `undefined`
 * means "resync now": the Feed (re)connected, so an Event may have been missed
 * (ADR-0028). A poke handler refetches; a payload handler may reload or ignore it.
 */
export type FeedHandler = (event?: WsEvent) => void;

/**
 * The one live **Feed** (`CONTEXT.md`) for a client, built once at the
 * authenticated boundary and injected into each view-model through the `feed?`
 * seam (ADR-0017, ADR-0028).
 */
export interface Feed {
  connected: Accessor<boolean>;
  /**
   * Hold a **Subscription**: `handler` gets each Event on the Channel that
   * `channel` returns. When the accessor changes, the hold moves to the new
   * Channel; `undefined` holds nothing. The caller's reactive scope releases it.
   */
  subscribe: (channel: Accessor<Channel | undefined>, handler: FeedHandler) => void;
  /** Hold an error handler for the caller's reactive scope. */
  onError: (handler: (error: string) => void) => void;
}

/** Where a transport delivers what arrives on its wire. */
export interface FeedSink {
  event: (event: WsEvent) => void;
  error: (message: string) => void;
}

/** A subscription request's action on the wire. */
export type WireAction = "subscribe" | "unsubscribe";

/** What a transport gives the core: its connection state and a wire send. */
export interface FeedWire {
  connected: Accessor<boolean>;
  /** Send a subscription request. The core calls it only while connected. */
  send: (action: WireAction, channel: Channel) => void;
}

/**
 * The transport port: a WebSocket in production (`feed.websocket.ts`), in memory
 * in tests (`feed.memory.ts`). The core gives it a sink and gets its wire back.
 */
export type FeedTransport = (sink: FeedSink) => FeedWire;

/** The routing key of a Channel: `kind:id`, or `kind:` for an id-less poke. */
export const channelKey = (channel: Channel): string =>
  `${channel.kind}:${"id" in channel ? channel.id : ""}`;

// The Channel an Event is addressed to, as the back-end `event.channel()`
// derives it: a poke carries its Channel; a payload Event reads it from its
// payload. A new payload variant adds one line here.
const channelOf = (event: WsEvent): Channel =>
  event.event_type === "conv_msg" ? Channel.conv(event.payload.conv_id) : event;

/** One holder: the identity the refcount counts. */
interface Subscription {
  handler: FeedHandler;
}

/**
 * The Feed core over a transport: routing by Channel key, the per-holder
 * refcount, the replay on (re)connect, and the resync call (ADR-0028). Call it
 * inside a reactive scope; the scope owns the core's connection effect.
 */
export function createFeed(transport: FeedTransport): Feed {
  // Held Channels by key, each with its holders. The server hears one
  // `subscribe` at the first holder and one `unsubscribe` at the last, so one
  // view-model never cuts a Channel another still holds (ADR-0017).
  const heldChannels = new Map<string, { channel: Channel; subs: Set<Subscription> }>();
  const errorHandlers = new Set<(error: string) => void>();

  const wire = transport({
    event: (event) => {
      const entry = heldChannels.get(channelKey(channelOf(event)));
      if (!entry) return;
      for (const sub of entry.subs) sub.handler(event);
    },
    error: (message) => {
      console.error(message);
      for (const handler of errorHandlers) handler(message);
    },
  });

  // True from the replay of a connect until the next drop. A hold sends only
  // while live; before that, the replay sends it. So a Subscription made in the
  // same update as the connect reaches the wire once, not twice.
  let live = false;
  const send = (action: WireAction, channel: Channel) => {
    if (live) wire.send(action, channel);
  };

  const hold = (channel: Channel, sub: Subscription) => {
    const key = channelKey(channel);
    const entry = heldChannels.get(key);
    if (entry) {
      entry.subs.add(sub);
      return;
    }
    heldChannels.set(key, { channel, subs: new Set([sub]) });
    send("subscribe", channel);
  };

  const release = (channel: Channel, sub: Subscription) => {
    const key = channelKey(channel);
    const entry = heldChannels.get(key);
    if (!entry?.subs.delete(sub) || entry.subs.size > 0) return;
    heldChannels.delete(key);
    send("unsubscribe", channel);
  };

  // On each (re)connect: the server authorizes per connection and
  // default-denies (ADR-0015), so replay every held Channel first. A poke sent
  // while the wire was down is lost, so then ask each holder to resync.
  createEffect(
    on(wire.connected, (connected) => {
      live = connected;
      if (!connected) return;
      for (const { channel } of heldChannels.values()) wire.send("subscribe", channel);
      for (const { subs } of heldChannels.values()) {
        for (const sub of subs) sub.handler(undefined);
      }
    }),
  );

  const subscribe = (channel: Accessor<Channel | undefined>, handler: FeedHandler) => {
    const sub: Subscription = { handler };
    let current: Channel | undefined;
    // Move the hold only when the key changes: an accessor that returns an
    // equal Channel (e.g. a refetched Post with the same id) must not churn the
    // wire.
    createEffect(() => {
      const next = channel();
      if ((next && channelKey(next)) === (current && channelKey(current))) return;
      if (current) release(current, sub);
      if (next) hold(next, sub);
      current = next;
    });
    onCleanup(() => {
      if (current) release(current, sub);
      current = undefined;
    });
  };

  const onError = (handler: (error: string) => void) => {
    errorHandlers.add(handler);
    onCleanup(() => errorHandlers.delete(handler));
  };

  return { connected: wire.connected, subscribe, onError };
}
