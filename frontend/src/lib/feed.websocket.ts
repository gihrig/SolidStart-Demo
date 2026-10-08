import { createSignal, onCleanup, onMount } from "solid-js";
import { createFeed, type Feed, type FeedTransport } from "~/lib/feed";
import type { WsEvent } from "~/types/backend";

const WS_URL = "ws://localhost:8080/ws";

// Reconnect back-off. The socket only exists inside the authenticated app (the
// `<Show when={isAuthenticated()}>` in `fullstack.tsx` and the Jedi route), so a
// logged-out client never dials and logout tears the socket down; this back-off
// governs the one remaining case — a mid-session token expiry, where the upgrade
// 401s and a browser cannot read that status. Exponential from a 3s base, capped
// and jittered, giving up after a bounded number of attempts (a new login remounts
// this Feed with a fresh counter — the resume path). NOTE: cooperative client
// robustness, not a security boundary — server-side connection rate-limiting is
// tracked separately (#91 "Realtime hardening II").
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MAX_RETRIES = 6;

/**
 * The WebSocket transport (ADR-0028). Connects on mount (client only — `onMount`
 * is the SSR guard, so no socket is opened during server render) and reconnects
 * with exponential back-off after an unintended drop, pausing after
 * {@link RECONNECT_MAX_RETRIES} consecutive failures. The core replays the held
 * Channels each time `connected` turns true.
 */
const webSocketTransport: FeedTransport = (sink) => {
  const [connected, setConnected] = createSignal(false);
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  // Set while we close on purpose (cleanup) so the resulting `onclose` does not
  // schedule a reconnect after the consumers are gone.
  let intentionalClose = false;
  // Consecutive failed reconnects; drives the back-off and the give-up cap. A
  // successful open resets it to 0.
  let retryCount = 0;

  const connect = () => {
    intentionalClose = false;
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        // A successful connection resets the back-off.
        retryCount = 0;
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        if (intentionalClose) return;
        if (retryCount >= RECONNECT_MAX_RETRIES) {
          // Give up rather than retry a doomed upgrade forever (e.g. an expired
          // session that keeps 401ing). A new login remounts this Feed with a
          // fresh counter — that is the resume path.
          sink.error(`WebSocket reconnect paused after ${RECONNECT_MAX_RETRIES} attempts`);
          return;
        }
        const backoff = Math.min(RECONNECT_BASE_MS * 2 ** retryCount, RECONNECT_MAX_MS);
        // ±20% jitter to avoid synchronized retries.
        const delay = backoff * (0.8 + Math.random() * 0.4);
        retryCount += 1;
        reconnectTimeout = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        sink.error("WebSocket connection error");
      };

      ws.onmessage = (event) => {
        try {
          sink.event(JSON.parse(event.data) as WsEvent);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };
    } catch {
      sink.error("Failed to connect to WebSocket");
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

  return {
    connected,
    send: (action, channel) => {
      if (ws?.readyState === WebSocket.OPEN) {
        // The wire flattens the Channel onto the request: `{ action, kind, id? }`.
        ws.send(JSON.stringify({ action, ...channel }));
      }
    },
  };
};

/**
 * The one live **Feed** (`CONTEXT.md`) for a client, over a WebSocket. Build it
 * once at the authenticated boundary (`routes/fullstack.tsx`, `routes/index.tsx`)
 * and inject it into each view-model (ADR-0028). Its scope closes the socket.
 */
export function createWebSocketFeed(): Feed {
  return createFeed(webSocketTransport);
}
