import { createSignal, createEffect, Show, For } from "solid-js";
import { createConvMessages } from "~/lib/createConvMessages";
import type { MessageFeedFactory } from "~/lib/websocket";
import type { Conv } from "~/types/backend";

interface MessagePanelProps {
  conv: Conv | null;
  /** Message feed port; defaults to the live WebSocket. Tests inject an in-memory adapter. */
  feed?: MessageFeedFactory;
}

export default function MessagePanel(props: MessagePanelProps) {
  const [sending, setSending] = createSignal(false);
  let scrollEl: HTMLDivElement | undefined;

  // The live-message protocol (subscribe, history, merge, dedupe, stale-guard) lives here.
  const { messages, send, connected, error } = createConvMessages(() => props.conv, {
    feed: props.feed,
  });

  // Scroll to bottom whenever messages change
  createEffect(() => {
    messages();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  });

  const handleSend = async (e: Event) => {
    e.preventDefault();
    if (!props.conv) return;

    const form = e.target as HTMLFormElement;
    const content = new FormData(form).get("content") as string;

    setSending(true);
    const sent = await send(content);
    setSending(false);
    if (sent) form.reset();
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
          <div
            ref={(el) => (scrollEl = el)}
            class="max-h-60 space-y-2 overflow-y-auto rounded border border-gray-200 p-2"
          >
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
