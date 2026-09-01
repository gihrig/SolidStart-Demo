import { createSignal, onCleanup, onMount } from "solid-js";
import type { WsEvent, ConvMsg } from "~/types/backend";

const WS_URL = "ws://localhost:8080/ws";

// Reconnect back-off. The socket only exists inside the authenticated app
// (`fullstack.tsx`'s `<Show when={isAuthenticated()}>`), so a logged-out client
// never dials and logout tears the socket down; this back-off governs the one
// remaining case — a mid-session token expiry, where the upgrade 401s and a
// browser cannot read that status. Exponential from a 3s base, capped and
// jittered, giving up after a bounded number of attempts (a new login remounts
// this Feed with a fresh counter — the resume path). NOTE: cooperative client
// robustness, not a security boundary — server-side connection rate-limiting is
// tracked separately (#91 "Realtime hardening II").
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MAX_RETRIES = 6;

/** Callbacks a consumer registers with a message feed. */
export interface MessageFeedOptions {
  onConvMsg?: (convId: number, msg: ConvMsg) => void;
  // List-feed pokes: a contentless signal that the Agent list or a Conversation
  // list may have changed (#85). The consumer refetches through the scoped RPC —
  // the event carries no row, so nothing here narrows access.
  onAgentUpdate?: () => void;
  onConvUpdate?: () => void;
  onError?: (error: string) => void;
}

/** The slice of a live socket a message view actually consumes. */
export interface MessageFeed {
  connected: () => boolean;
  subscribe: (channel: string, id?: number) => void;
  unsubscribe: (channel: string, id?: number) => void;
}

/** Port: live socket in prod, in-memory adapter in tests. A Feed factory satisfies it. */
export type MessageFeedFactory = (options: MessageFeedOptions) => MessageFeed;

/**
 * The one live **Feed** (CONTEXT.md) for a client: a single WebSocket every
 * view-model shares, created once at the authenticated boundary
 * (`routes/fullstack.tsx`) and injected through the `feed?` seam (ADR-0017).
 * Connects on mount (client only — `onMount` is the SSR guard, so no socket is
 * opened during server render) and reconnects with exponential back-off after an
 * unintended drop, pausing after {@link RECONNECT_MAX_RETRIES} consecutive
 * failures. Desired subscriptions are remembered and replayed on every
 * (re)connect, since the server authorizes per connection and default-denies
 * (ADR-0015).
 *
 * It returns a {@link MessageFeedFactory}. Each `factory(options)` call registers
 * that consumer's callbacks and returns a per-consumer {@link MessageFeed} view:
 * - **Fan-out.** Every `conv_msg`/`agent_update`/`conv_update` Event, and every
 *   error, reaches *all* registered consumers; each keeps its own guard.
 * - **Per-holder subscriptions.** A view refcounts its own Channels, so the server
 *   hears one `subscribe` at the first holder and one `unsubscribe` at the last —
 *   an unsubscribe never cuts a Channel another view still holds. The view's
 *   cleanup releases only what it held.
 */
export function createFeed(): MessageFeedFactory {
  const [connected, setConnected] = createSignal(false);
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  // Set while we close on purpose (cleanup/disconnect) so the resulting
  // `onclose` does not schedule a reconnect after the consumers are gone.
  let intentionalClose = false;
  // Consecutive failed reconnects; drives the back-off and the give-up cap. A
  // successful open resets it to 0.
  let retryCount = 0;

  // Registered consumers. Each view-model registers its own callbacks; every
  // Event fans out to all of them. The per-consumer guard (e.g. the conv-id
  // match) stays in the consumer.
  const consumers = new Set<MessageFeedOptions>();

  // Desired subscriptions with a holder count, replayed on every (re)connect. The
  // server authorizes per connection and default-denies (ADR-0015), so a fresh
  // socket must re-subscribe or it silently receives nothing. The count tells the
  // server only at the edges, so overlapping consumers never cut each other's
  // Channel.
  const desired = new Map<string, { channel: string; id?: number; count: number }>();
  const subKey = (channel: string, id?: number) => `${channel}:${id ?? ""}`;
  const sendSub = (action: "subscribe" | "unsubscribe", channel: string, id?: number) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, channel, id }));
    }
  };

  // First holder subscribes on the wire; a later holder just bumps the count.
  const holdSub = (channel: string, id?: number) => {
    const entry = desired.get(subKey(channel, id));
    if (entry) {
      entry.count += 1;
      return;
    }
    desired.set(subKey(channel, id), { channel, id, count: 1 });
    sendSub("subscribe", channel, id);
  };
  // Last holder unsubscribes on the wire; earlier releases just drop the count.
  const releaseSub = (channel: string, id?: number) => {
    const entry = desired.get(subKey(channel, id));
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    desired.delete(subKey(channel, id));
    sendSub("unsubscribe", channel, id);
  };

  const fail = (message: string) => {
    console.error(message);
    for (const c of consumers) c.onError?.(message);
  };

  const connect = () => {
    intentionalClose = false;
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        // A successful connection resets the back-off.
        retryCount = 0;
        // Replay desired subscriptions onto the (re)connected socket, once per key.
        for (const { channel, id } of desired.values()) {
          sendSub("subscribe", channel, id);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (intentionalClose) return;
        if (retryCount >= RECONNECT_MAX_RETRIES) {
          // Give up rather than retry a doomed upgrade forever (e.g. an expired
          // session that keeps 401ing). A new login remounts this Feed with a
          // fresh counter — that is the resume path.
          fail(`WebSocket reconnect paused after ${RECONNECT_MAX_RETRIES} attempts`);
          return;
        }
        const backoff = Math.min(RECONNECT_BASE_MS * 2 ** retryCount, RECONNECT_MAX_MS);
        // ±20% jitter to avoid synchronized retries.
        const delay = backoff * (0.8 + Math.random() * 0.4);
        retryCount += 1;
        reconnectTimeout = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        fail("WebSocket connection error");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsEvent;
          if (data.event_type === "conv_msg") {
            // Narrowed by the discriminant: `payload` is a typed ConvMsg, no cast.
            const msg = data.payload;
            for (const c of consumers) c.onConvMsg?.(msg.conv_id, msg);
          } else if (data.event_type === "agent_update") {
            for (const c of consumers) c.onAgentUpdate?.();
          } else if (data.event_type === "conv_update") {
            for (const c of consumers) c.onConvUpdate?.();
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };
    } catch {
      fail("Failed to connect to WebSocket");
    }
  };

  const disconnect = () => {
    intentionalClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    ws?.close();
    ws = null;
  };

  onMount(connect);
  onCleanup(disconnect);

  return (options: MessageFeedOptions): MessageFeed => {
    consumers.add(options);
    // This view's own subscriptions, so its cleanup releases only what it held
    // and a repeated subscribe of the same Channel is idempotent per view.
    const held = new Set<string>();

    const subscribe = (channel: string, id?: number) => {
      const key = subKey(channel, id);
      if (held.has(key)) return;
      held.add(key);
      holdSub(channel, id);
    };

    const unsubscribe = (channel: string, id?: number) => {
      const key = subKey(channel, id);
      if (!held.delete(key)) return;
      releaseSub(channel, id);
    };

    onCleanup(() => {
      // Release only this view's holds, then deregister its callbacks. The socket
      // itself is torn down by the Feed's own `onCleanup`, at the boundary.
      for (const key of held) {
        const entry = desired.get(key);
        if (entry) releaseSub(entry.channel, entry.id);
      }
      held.clear();
      consumers.delete(options);
    });

    return { connected, subscribe, unsubscribe };
  };
}

/**
 * A private Feed for a single consumer: {@link createFeed} used standalone. Kept
 * as the default when no shared Feed is injected (`?? useWebSocket`). In the
 * authenticated app the boundary injects one shared `createFeed()` instead, so a
 * client holds one socket, not one per view-model (ADR-0017).
 */
export function useWebSocket(options: MessageFeedOptions = {}): MessageFeed {
  return createFeed()(options);
}
