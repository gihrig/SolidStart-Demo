import { createSignal, createEffect } from "solid-js";
import { backendRpc } from "~/lib/backend-rpc";
import { createRpcAction } from "~/lib/createRpcAction";
import { useWebSocket, type MessageFeedFactory } from "~/lib/websocket";
import type { Conv, ConvMsg } from "~/types/backend";

/** The live-message protocol for one conversation, behind a small interface. */
export interface ConvMessages {
  messages: () => ConvMsg[];
  /** Sends `content`; resolves `true` when it was accepted, `false` on failure. */
  send: (content: string) => Promise<boolean>;
  /** True while a send RPC is in flight (owned by the send action). */
  pending: () => boolean;
  connected: () => boolean;
  /** A send failure, else the standing feed/history error (send takes precedence). */
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
  // Connection + history-load failures. Send failures live in `sendAction.error`;
  // the exposed `error()` merges the two with send taking precedence.
  const [feedError, setFeedError] = createSignal<string | null>(null);

  // Prevents a stale convMsg.list response from overwriting a message added via send().
  let listStale = false;

  const { connected, subscribe, unsubscribe } = (deps.feed ?? useWebSocket)({
    onConvMsg: (convId, msg) => {
      const c = conv();
      if (c && c.id === convId) setMessages((prev) => appendMsg(prev, msg));
    },
    onError: (err) => setFeedError(err),
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
        if (!listStale) setFeedError(e instanceof Error ? e.message : "Failed to load messages");
      });
  });

  // Unsubscribe from the previous conversation on change / cleanup.
  createEffect((prevConvId: number | null) => {
    const currentConvId = conv()?.id ?? null;
    if (prevConvId && prevConvId !== currentConvId) unsubscribe("conv", prevConvId);
    return currentConvId;
  }, null);

  // The send choreography (reset error → pending → try/catch/finally) is owned by
  // createRpcAction; the success step runs inside so its rejection lands in error.
  const sendAction = createRpcAction(
    async ({ c, content }: { c: Conv; content: string }) => {
      const msg = await backendRpc.convMsg.add({ conv_id: c.id, content });
      // Any in-flight history load is now stale; drop it when it resolves.
      listStale = true;
      setMessages((prev) => appendMsg(prev, msg));
      return msg;
    },
    { fallbackError: "Failed to send message" },
  );

  // Conv pre-check runs outside run() so "no conversation" never flips pending.
  const send = async (content: string): Promise<boolean> => {
    const c = conv();
    if (!c) return false;
    return (await sendAction.run({ c, content })) !== undefined;
  };

  // One displayed error: a send failure wins over a standing feed/history error.
  const error = () => sendAction.error() ?? feedError();

  return { messages, send, pending: sendAction.pending, connected, error };
}
