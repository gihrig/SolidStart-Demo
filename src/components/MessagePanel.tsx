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
    <div class="flex h-full flex-col gap-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">Messages</h3>
        <Show when={props.conv}>
          <span class={`text-xs ${connected() ? "text-green-600" : "text-red-600"}`}>
            {connected() ? "Live" : "Offline"}
          </span>
        </Show>
      </div>

      <Show when={!props.conv}>
        <p class="text-(--theme-muted)">Select a conversation</p>
      </Show>

      <Show when={props.conv}>
        {/* Send Message Form — fills the remaining pane height */}
        <form onSubmit={handleSend} class="flex min-h-0 flex-1 flex-col gap-2">
          <Show when={error()}>
            <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
          </Show>

          <button
            type="submit"
            disabled={sending()}
            class="w-full rounded bg-(--theme-btn-primary) px-12 py-2 text-white hover:bg-(--theme-btn-primary-hover) disabled:opacity-50"
          >
            {sending() ? "Sending..." : "Send"}
          </button>

          {/* Messages Display — fills the pane, scrolls internally */}
          <div
            ref={(el) => (scrollEl = el)}
            class="hoverlist max-h-[70dvh] min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-(--theme-card-bg) p-2 text-(--theme-card-fg)"
          >
            <Show when={messages().length === 0}>
              <p class="text-(--theme-muted)">No messages yet</p>
            </Show>
            <For each={messages()}>{(msg) => <div class="p-2">{msg.content}</div>}</For>
          </div>

          <input
            name="content"
            placeholder="Type a message..."
            required
            class="w-full rounded border border-gray-300 bg-(--theme-card-bg) px-3 py-2 text-(--theme-card-fg)"
          />
        </form>
      </Show>
    </div>
  );
}
