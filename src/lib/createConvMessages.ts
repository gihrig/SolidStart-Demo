import { createSignal, createEffect } from "solid-js";
import { backendRpc } from "~/lib/backend-rpc";
import { useWebSocket, type MessageFeedFactory } from "~/lib/websocket";
import type { Conv, ConvMsg } from "~/types/backend";

/** The live-message protocol for one conversation, behind a small interface. */
export interface ConvMessages {
  messages: () => ConvMsg[];
  /** Sends `content`; resolves `true` when it was accepted, `false` on failure. */
  send: (content: string) => Promise<boolean>;
  connected: () => boolean;
  error: () => string | null;
}

/** Injectable seam: live WebSocket by default, an in-memory adapter in tests. */
export interface ConvMessagesDeps {
  feed?: MessageFeedFactory;
}

/** Only new ids append — the single de-duplication point for feed + send. */
function appendMsg(prev: ConvMsg[], msg: ConvMsg): ConvMsg[] {
  return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
}

/**
 * Owns the subscribe/unsubscribe lifecycle, history load, live merge, dedupe,
 * and the stale-history-after-send guard for the given conversation.
 */
export function createConvMessages(
  conv: () => Conv | null,
  deps: ConvMessagesDeps = {},
): ConvMessages {
  const [messages, setMessages] = createSignal<ConvMsg[]>([]);
  const [error, setError] = createSignal<string | null>(null);

  // Prevents a stale convMsg.list response from overwriting a message added via send().
  let listStale = false;

  const { connected, subscribe, unsubscribe } = (deps.feed ?? useWebSocket)({
    onConvMsg: (convId, msg) => {
      const c = conv();
      if (c && c.id === convId) setMessages((prev) => appendMsg(prev, msg));
    },
    onError: (err) => setError(err),
  });

  // Subscribe + load history when the conversation changes.
  createEffect(() => {
    const c = conv();
    if (!c) return;
    listStale = false;
    subscribe("conv", c.id);
    setMessages([]);
    backendRpc.convMsg
      .list(c.id)
      .then((msgs) => {
        if (!listStale) setMessages(msgs);
      })
      .catch((e) => {
        if (!listStale) setError(e instanceof Error ? e.message : "Failed to load messages");
      });
  });

  // Unsubscribe from the previous conversation on change / cleanup.
  createEffect((prevConvId: number | null) => {
    const currentConvId = conv()?.id ?? null;
    if (prevConvId && prevConvId !== currentConvId) unsubscribe("conv", prevConvId);
    return currentConvId;
  }, null);

  const send = async (content: string): Promise<boolean> => {
    const c = conv();
    if (!c) return false;
    setError(null);
    try {
      const msg = await backendRpc.convMsg.add({ conv_id: c.id, content });
      // Any in-flight history load is now stale; drop it when it resolves.
      listStale = true;
      setMessages((prev) => appendMsg(prev, msg));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      return false;
    }
  };

  return { messages, send, connected, error };
}
