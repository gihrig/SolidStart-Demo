import { createSignal, createResource, createEffect, on, For, Show } from "solid-js";
import { backendRpc } from "~/lib/backend-rpc";
import type { Agent, Conv } from "~/types/backend";

interface Props {
  agent: Agent | null;
  onConvSelect?: (conv: Conv) => void;
}

export default function ConversationManager(props: Props) {
  const [convs, { refetch }] = createResource(
    () => props.agent,
    async (agent) => {
      if (!agent) return [];
      return backendRpc.conv.list({
        filters: [{ agent_id: { $eq: Number(agent.id) } }],
      });
    },
  );
  const [selectedConv, setSelectedConv] = createSignal<Conv | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Reset selection on agent change
  createEffect(
    on(
      () => props.agent,
      () => {
        setSelectedConv(null);
      },
      { defer: true },
    ),
  );

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!props.agent) return;

    setError(null);
    setCreating(true);
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    try {
      const conv = await backendRpc.conv.create({
        agent_id: props.agent.id,
        title: (formData.get("title") as string) || null,
      });
      form.reset();
      await refetch();
      setSelectedConv(conv);
      props.onConvSelect?.(conv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create conversation");
    } finally {
      setCreating(false);
    }
  };

  const selectConv = (conv: Conv) => {
    setSelectedConv(conv);
    props.onConvSelect?.(conv);
  };

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">Conversations</h3>

      <Show when={!props.agent}>
        <p class="text-gray-500">Select an agent first</p>
      </Show>

      <Show when={props.agent}>
        <Show when={error()}>
          <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
        </Show>

        {/* Create Conversation Form */}
        <form onSubmit={handleCreate} class="flex flex-col gap-2">
          <button
            type="submit"
            disabled={creating()}
            class="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {creating() ? "Creating..." : "Create Conv"}
          </button>
          <input
            name="title"
            placeholder="Conversation title (optional)"
            class="w-full rounded border border-gray-300 px-3 py-2"
          />
        </form>

        {/* Conversation List */}
        <Show when={convs.loading}>
          <p class="text-gray-500">Loading conversations...</p>
        </Show>

        <Show when={convs.error}>
          <p class="text-red-600">Error: {convs.error.message}</p>
        </Show>

        <Show when={convs()}>
          <ul class="space-y-2">
            <For each={convs()} fallback={<li class="text-gray-500">No conversations yet</li>}>
              {(conv) => (
                <li
                  class={`cursor-pointer rounded border p-2 transition ${
                    selectedConv()?.id === conv.id
                      ? "border-blue-500 bg-auto"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                  onClick={() => selectConv(conv)}
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
