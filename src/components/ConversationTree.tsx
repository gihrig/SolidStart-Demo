import { For, Show, createEffect, onCleanup, type Accessor } from "solid-js";
import { useListbox } from "~/lib/useListbox";
import { convLabel, type ConversationWorkspace } from "~/lib/conversationWorkspace";
import type { Agent, Conv } from "~/types/backend";

export interface ConversationTreeProps {
  ws: ConversationWorkspace;
  /** Fired after a Conversation is selected — lets the mobile drawer close. */
  onConversationSelected?: () => void;
}

interface CreateFormProps {
  label: string;
  /** Input `name`, read back on submit. */
  field: string;
  placeholder: string;
  required?: boolean;
  pending: boolean;
  /** Runs the create; return `true` on success to reset the form. */
  onSubmit: (raw: string) => Promise<boolean>;
}

/** The shared create-a-thing form used for both Agents and Conversations. */
function CreateForm(props: CreateFormProps) {
  const handle = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const raw = (new FormData(form).get(props.field) as string) ?? "";
    if (await props.onSubmit(raw)) form.reset();
  };

  return (
    <form onSubmit={handle} class="flex flex-col gap-2">
      <button
        type="submit"
        disabled={props.pending}
        class="w-full rounded bg-(--theme-btn-primary) px-4 py-2 text-white hover:bg-(--theme-btn-primary-hover) disabled:opacity-50"
      >
        {props.pending ? "Creating..." : props.label}
      </button>
      <input
        name={props.field}
        placeholder={props.placeholder}
        required={props.required}
        class="w-full rounded border border-gray-300 bg-(--theme-card-bg) px-3 py-2 text-(--theme-card-fg)"
      />
    </form>
  );
}

/**
 * Single-open accordion navigator. Each Agent is a disclosure header
 * (`aria-expanded`); the open Agent's Conversations render through the shared
 * listbox primitive. "Which Agent is open" is the workspace's selected-Agent
 * state — no separate expansion state exists (see ADR-0004).
 */
export default function ConversationTree(props: ConversationTreeProps) {
  // `ws` is created once by the route and never reassigned, so aliasing it keeps
  // its accessors fully reactive while reading cleanly.
  const ws = props.ws;

  const isOpen = (agent: Agent) => ws.selectedAgent()?.id === agent.id;
  const convs: Accessor<Conv[]> = () => ws.convs() ?? [];

  // Selecting an agent rewrites the accordion (the open one expands, the previous
  // one collapses), which can shift the chosen row off-screen when it was picked
  // near the bottom of a scrolled list. Bring the selected row to the top so it
  // stays visible. Rows register their element by id; the effect scrolls whichever
  // is selected after the DOM has updated. (`scrollIntoView?.` — jsdom has none.)
  const agentRows = new Map<number, HTMLLIElement>();
  createEffect(() => {
    const agent = ws.selectedAgent();
    if (!agent) return;
    agentRows.get(agent.id)?.scrollIntoView?.({ block: "start" });
  });

  // One listbox drives the open Agent's Conversations: `ws.convs` only ever holds
  // the selected Agent's list, so a single instance suffices for the whole tree.
  const { listboxProps, getOptionProps } = useListbox<Conv>({
    items: () => ws.convs(),
    selectedKey: () => ws.selectedConv()?.id,
    keyOf: (conv) => conv.id,
    onSelect: (conv) => {
      ws.selectConv(conv);
      props.onConversationSelected?.();
    },
    label: "Conversations",
    idPrefix: "conv",
  });

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">Agents</h3>

      {/* Create Agent — one isolated, self-contained block at the navigator root
          so a future Admin-only gate can wrap exactly this and nothing else. */}
      <section aria-label="Create agent" class="space-y-2">
        <Show when={ws.agentError()}>
          <div class="rounded bg-red-100 p-2 text-red-700">{ws.agentError()}</div>
        </Show>
        <CreateForm
          label="Create Agent"
          field="name"
          placeholder="Agent name"
          required
          pending={ws.creatingAgent()}
          onSubmit={(raw) => ws.createAgent(raw)}
        />
      </section>

      {/* Scrollable Agent list — caps the navigator to the screen height. */}
      <div class="max-h-[70dvh] space-y-4 overflow-y-auto">
        <Show when={ws.agents.loading}>
          <p class="text-(--theme-muted)">Loading agents...</p>
        </Show>
        <Show when={ws.agents.error}>
          <p class="text-red-600">Error loading agents: {ws.agents.error.message}</p>
        </Show>

        <Show when={ws.agents()}>
          <ul class="hoverlist space-y-1">
            <For each={ws.agents()} fallback={<li class="text-(--theme-muted)">No agents yet</li>}>
              {(agent) => (
                <li
                  ref={(el) => {
                    agentRows.set(agent.id, el);
                    onCleanup(() => agentRows.delete(agent.id));
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen(agent)}
                    onClick={() => ws.selectAgent(agent)}
                    class="flex w-full items-center justify-between rounded p-2 text-left font-semibold"
                  >
                    <span>{agent.name}</span>
                    <span aria-hidden="true">{isOpen(agent) ? "▾" : "▸"}</span>
                  </button>

                  {/* Open Agent reveals its Conversations + create-conversation. */}
                  <Show when={isOpen(agent)}>
                    <div class="mt-2 space-y-2 pl-2">
                      <Show when={ws.convError()}>
                        <div class="rounded bg-red-100 p-2 text-red-700">{ws.convError()}</div>
                      </Show>

                      <CreateForm
                        label="Create Conversation"
                        field="title"
                        placeholder="Conversation title (optional)"
                        pending={ws.creatingConv()}
                        onSubmit={(raw) => ws.createConv(raw || null)}
                      />

                      <Show when={ws.convs.loading}>
                        <p class="text-(--theme-muted)">Loading conversations...</p>
                      </Show>
                      <Show when={ws.convs.error}>
                        <p class="text-red-600">Error: {ws.convs.error.message}</p>
                      </Show>

                      <Show
                        when={convs().length > 0}
                        fallback={<p class="text-(--theme-muted)">No conversations yet</p>}
                      >
                        <ul class="hoverlist space-y-1" {...listboxProps}>
                          <For each={convs()}>
                            {(conv, index) => (
                              <li
                                class="cursor-pointer rounded p-2 outline-none"
                                {...getOptionProps(index())}
                              >
                                {convLabel(conv)}
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </div>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
