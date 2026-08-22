import { createSignal, onCleanup, onMount } from "solid-js";
import type { WsEvent, ConvMsg } from "~/types/backend";

const WS_URL = "ws://localhost:8080/ws";

/** Callbacks a consumer registers with a message feed. */
export interface MessageFeedOptions {
  onConvMsg?: (convId: number, msg: ConvMsg) => void;
  onError?: (error: string) => void;
}

/** The slice of a live socket a message view actually consumes. */
export interface MessageFeed {
  connected: () => boolean;
  subscribe: (channel: string, id?: number) => void;
  unsubscribe: (channel: string, id?: number) => void;
}

/** Port: live socket in prod, in-memory adapter in tests. `useWebSocket` satisfies it. */
export type MessageFeedFactory = (options: MessageFeedOptions) => MessageFeed;

/**
 * The live WebSocket adapter behind the {@link MessageFeed} port. Connects on
 * mount (client only — `onMount` is the SSR guard, so no socket is opened during
 * server render) and reconnects unconditionally 3s after an unintended drop.
 * Desired subscriptions are remembered and replayed on every (re)connect, since
 * the server authorizes per connection and default-denies (ADR-0015).
 * `conv_msg` events and errors reach the consumer through the registered
 * callbacks; a failure is also logged at this boundary via `console.error`.
 *
 * Its public surface is exactly `MessageFeed`: reconnect and disconnect stay
 * private (driven by the reconnect timer and `onCleanup`), and there is no
 * readable error signal — errors flow only through `onError`.
 */
export function useWebSocket(options: MessageFeedOptions = {}): MessageFeed {
  const [connected, setConnected] = createSignal(false);
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  // Set while we close on purpose (cleanup/disconnect) so the resulting
  // `onclose` does not schedule a reconnect after the consumer is gone.
  let intentionalClose = false;

  // Desired subscriptions, replayed on every (re)connect. The server authorizes
  // per connection and default-denies (ADR-0015), so a fresh socket must
  // re-subscribe or it silently receives nothing.
  const desired = new Map<string, { channel: string; id?: number }>();
  const subKey = (channel: string, id?: number) => `${channel}:${id ?? ""}`;
  const sendSub = (action: "subscribe" | "unsubscribe", channel: string, id?: number) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, channel, id }));
    }
  };

  const fail = (message: string) => {
    console.error(message);
    options.onError?.(message);
  };

  const connect = () => {
    intentionalClose = false;
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        // Replay desired subscriptions onto the (re)connected socket.
        for (const { channel, id } of desired.values()) {
          sendSub("subscribe", channel, id);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (intentionalClose) return;
        reconnectTimeout = window.setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        fail("WebSocket connection error");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsEvent;
          if (data.event_type === "conv_msg" && options.onConvMsg) {
            const msg = data.payload as ConvMsg;
            options.onConvMsg(msg.conv_id, msg);
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };
    } catch {
      fail("Failed to connect to WebSocket");
    }
  };

  const subscribe = (channel: string, id?: number) => {
    desired.set(subKey(channel, id), { channel, id });
    sendSub("subscribe", channel, id);
  };

  const unsubscribe = (channel: string, id?: number) => {
    desired.delete(subKey(channel, id));
    sendSub("unsubscribe", channel, id);
  };

  const disconnect = () => {
    intentionalClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    ws?.close();
    ws = null;
  };

  onMount(connect);
  onCleanup(disconnect);

  return { connected, subscribe, unsubscribe };
}
