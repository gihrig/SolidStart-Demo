import { For, Show } from "solid-js";
import type { ConversationWorkspace } from "~/lib/conversationWorkspace";

export interface ConversationManagerProps {
  ws: ConversationWorkspace;
}

export default function ConversationManager(props: ConversationManagerProps) {
  // `ws` is created once by the route and never reassigned, so aliasing it keeps
  // its accessors fully reactive while reading cleanly.
  const ws = props.ws;

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const title = (new FormData(form).get("title") as string) || null;
    if (await ws.createConv(title)) form.reset();
  };

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">Conversations</h3>

      <Show when={!ws.selectedAgent()}>
        <p class="text-gray-500">Select an agent first</p>
      </Show>

      <Show when={ws.selectedAgent()}>
        <Show when={ws.convError()}>
          <div class="rounded bg-red-100 p-2 text-red-700">{ws.convError()}</div>
        </Show>

        {/* Create Conversation Form */}
        <form onSubmit={handleCreate} class="flex flex-col gap-2">
          <button
            type="submit"
            disabled={ws.creatingConv()}
            class="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {ws.creatingConv() ? "Creating..." : "Create Conv"}
          </button>
          <input
            name="title"
            placeholder="Conversation title (optional)"
            class="w-full rounded border border-gray-300 px-3 py-2"
          />
        </form>

        {/* Conversation List */}
        <Show when={ws.convs.loading}>
          <p class="text-gray-500">Loading conversations...</p>
        </Show>

        <Show when={ws.convs.error}>
          <p class="text-red-600">Error: {ws.convs.error.message}</p>
        </Show>

        <Show when={ws.convs()}>
          <ul class="space-y-2">
            <For each={ws.convs()} fallback={<li class="text-gray-500">No conversations yet</li>}>
              {(conv) => (
                <li
                  class={`cursor-pointer rounded border p-2 transition ${
                    ws.selectedConv()?.id === conv.id
                      ? "border-blue-500 bg-auto"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                  onClick={() => ws.selectConv(conv)}
                >
                  <strong>{conv.title || "Untitled"}</strong>
                  <span class="ml-2 text-sm text-gray-500">ID: {String(conv.id)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
