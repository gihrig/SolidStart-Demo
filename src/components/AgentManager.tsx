import { For, Show } from "solid-js";
import type { ConversationWorkspace } from "~/lib/conversationWorkspace";

export interface AgentManagerProps {
  ws: ConversationWorkspace;
}

export default function AgentManager(props: AgentManagerProps) {
  // `ws` is created once by the route and never reassigned, so aliasing it keeps
  // its accessors fully reactive while reading cleanly.
  const ws = props.ws;

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = new FormData(form).get("name") as string;
    if (await ws.createAgent(name)) form.reset();
  };

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">Agents</h3>

      <Show when={ws.agentError()}>
        <div class="rounded bg-red-100 p-2 text-red-700">{ws.agentError()}</div>
      </Show>

      {/* Create Agent Form */}
      <form onSubmit={handleCreate} class="flex flex-col gap-2">
        <button
          type="submit"
          disabled={ws.creatingAgent()}
          class="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {ws.creatingAgent() ? "Creating..." : "Create Agent"}
        </button>
        <input
          name="name"
          placeholder="Agent name"
          required
          class="w-full rounded border border-gray-300 px-3 py-2"
        />
      </form>

      {/* Agent List */}
      <Show when={ws.agents.loading}>
        <p class="text-gray-500">Loading agents...</p>
      </Show>

      <Show when={ws.agents.error}>
        <p class="text-red-600">Error loading agents: {ws.agents.error.message}</p>
      </Show>

      <Show when={ws.agents()}>
        <ul class="space-y-2">
          <For each={ws.agents()} fallback={<li class="text-gray-500">No agents yet</li>}>
            {(agent) => (
              <li
                class={`cursor-pointer rounded border p-2 transition ${
                  ws.selectedAgent()?.id === agent.id
                    ? "border-blue-500 bg-auto"
                    : "border-gray-200 hover:border-gray-400"
                }`}
                onClick={() => ws.selectAgent(agent)}
              >
                <strong>{agent.name}</strong>
                <span class="ml-2 text-sm text-gray-500">ID: {String(agent.id)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
