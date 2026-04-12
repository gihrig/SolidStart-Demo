import { createSignal, createEffect, Show, For } from "solid-js";
import { backendRpc } from "~/lib/backend-rpc";
import { useWebSocket } from "~/lib/websocket";
import type { Conv, ConvMsg } from "~/types/backend";

interface Props {
  conv: Conv | null;
}

export default function MessagePanel(props: Props) {
  const [messages, setMessages] = createSignal<ConvMsg[]>([]);
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Prevents a stale convMsg.list response from overwriting a message added via handleSend
  let listStale = false;

  // WebSocket for real-time updates
  const { connected, subscribe, unsubscribe } = useWebSocket({
    onConvMsg: (convId, msg) => {
      // Only add message if it's for the current conversation
      if (props.conv && Number(props.conv.id) === convId) {
        setMessages((prev) => {
          // Avoid duplicates (in case we just sent this message)
          if (prev.some((m) => Number(m.id) === Number(msg.id))) {
            return prev;
          }
          return [...prev, msg];
        });
      }
    },
    onError: (err) => setError(err),
  });

  // Subscribe to conversation updates when conv changes and load history
  createEffect(() => {
    const conv = props.conv;
    if (conv) {
      listStale = false;
      subscribe("conv", conv.id);
      setMessages([]);
      backendRpc.convMsg
        .list(conv.id)
        .then((msgs) => {
          if (!listStale) setMessages(msgs);
        })
        .catch((e) => {
          if (!listStale) setError(e instanceof Error ? e.message : "Failed to load messages");
        });
    }
  });

  // Unsubscribe when conversation changes or component unmounts
  createEffect((prevConvId: bigint | number | null) => {
    const currentConvId = props.conv?.id ?? null;
    if (prevConvId && prevConvId !== currentConvId) {
      unsubscribe("conv", prevConvId);
    }
    return currentConvId;
  }, null);

  const handleSend = async (e: Event) => {
    e.preventDefault();
    if (!props.conv) return;

    setError(null);
    setSending(true);
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    try {
      const msg = await backendRpc.convMsg.add({
        conv_id: props.conv.id,
        content: formData.get("content") as string,
      });
      // Prevent any in-flight convMsg.list response from overwriting this message
      listStale = true;
      // Add message immediately; dedupe in case WebSocket already delivered it
      setMessages((prev) =>
        prev.some((m) => Number(m.id) === Number(msg.id)) ? prev : [...prev, msg],
      );
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">Messages</h3>
        <Show when={props.conv}>
          <span class={`text-xs ${connected() ? "text-green-600" : "text-red-600"}`}>
            {connected() ? "Live" : "Offline"}
          </span>
        </Show>
      </div>

      <Show when={!props.conv}>
        <p class="text-gray-500">Select a conversation</p>
      </Show>

      <Show when={props.conv}>
        <Show when={error()}>
          <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
        </Show>

        {/* Send Message Form */}
        <form onSubmit={handleSend} class="flex flex-col gap-2">
          <button
            type="submit"
            disabled={sending()}
            class="w-full rounded bg-blue-600 px-12 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending() ? "Sending..." : "Send"}
          </button>

          {/* Messages Display */}
          <div class="max-h-60 space-y-2 overflow-y-auto rounded border border-gray-200 p-2">
            <Show when={messages().length === 0}>
              <p class="text-gray-500">No messages yet</p>
            </Show>
            <For each={messages()}>
              {(msg) => (
                <div class="rounded bg-auto p-2">
                  <p>{msg.content}</p>
                  <span class="text-xs text-gray-500">ID: {String(msg.id)}</span>
                </div>
              )}
            </For>
          </div>

          <input
            name="content"
            placeholder="Type a message..."
            required
            class="w-full rounded border border-gray-300 px-3 py-2"
          />
        </form>
      </Show>
    </div>
  );
}
