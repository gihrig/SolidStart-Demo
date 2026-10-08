import { createRoot, createSignal } from "solid-js";
import { channelKey, createFeed, type Feed, type FeedSink } from "~/lib/feed";
import type { Channel } from "~/lib/channel";
import type { WsEvent } from "~/types/backend";

/** A real Feed core over an in-memory wire, and the controls a test drives. */
export interface MemoryFeed {
  feed: Feed;
  /** Deliver an Event as if the server pushed it. */
  emit: (event: WsEvent) => void;
  /** Raise a Feed error as if the transport failed. */
  fail: (message: string) => void;
  /** Connect or drop the wire. A drop clears what the server holds. */
  setConnected: (connected: boolean) => void;
  /** The Channels the server holds now, in subscribe order. */
  held: () => Channel[];
}

/**
 * The in-memory transport for tests (ADR-0028). It runs the production core
 * (`createFeed`), so a test exercises the real routing, refcount, replay and
 * resync. Its wire acts as a strict server: a repeat `subscribe`, or an
 * `unsubscribe` of a Channel it does not hold, throws. The wire starts
 * disconnected, as a socket does. The core lives in its own root, so a test can
 * build the Feed outside the view-model's scope; each Subscription still ends
 * with the scope that made it.
 */
export function createMemoryFeed(): MemoryFeed {
  const [connected, setConnected] = createSignal(false);
  const server = new Map<string, Channel>();
  let sink!: FeedSink;

  const feed = createRoot(() =>
    createFeed((s) => {
      sink = s;
      return {
        connected,
        send: (action, channel) => {
          const key = channelKey(channel);
          if (action === "subscribe") {
            if (server.has(key)) throw new Error(`repeat subscribe: ${key}`);
            server.set(key, channel);
          } else if (!server.delete(key)) {
            throw new Error(`unsubscribe of an unheld Channel: ${key}`);
          }
        },
      };
    }),
  );

  return {
    feed,
    emit: (event) => sink.event(event),
    fail: (message) => sink.error(message),
    setConnected: (value) => {
      if (!value) server.clear();
      setConnected(value);
    },
    held: () => [...server.values()],
  };
}
