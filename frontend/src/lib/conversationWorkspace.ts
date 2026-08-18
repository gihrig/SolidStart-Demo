import { createSignal, createResource, type Accessor } from "solid-js";
import { backendRpc } from "~/lib/backend-rpc";
import { createRpcAction } from "~/lib/createRpcAction";
import type { Agent, Conv } from "~/types/backend";

/**
 * The home module for the Conversations workspace: the single owner of which
 * Agent and Conversation are selected, the two list resources, and the
 * create→refetch→select dance. The route creates one and threads it to the
 * (now presentational) managers, so "which agent is selected" has one owner and
 * the create dance is written once instead of copy-pasted per manager.
 */
export interface ConversationWorkspace {
  // Agents — the Solid `Resource` stays private; the list, its loading flag, and
  // its load error are exposed as plain accessors so consumers (and the stub)
  // never touch framework internals.
  agents: Accessor<Agent[]>;
  agentsLoading: Accessor<boolean>;
  agentsError: Accessor<string | null>;
  selectedAgent: Accessor<Agent | null>;
  selectAgent: (agent: Agent) => void;
  createAgent: (name: string) => Promise<boolean>;
  creatingAgent: Accessor<boolean>;
  createAgentError: Accessor<string | null>;
  // Conversations
  convs: Accessor<Conv[]>;
  convsLoading: Accessor<boolean>;
  convsError: Accessor<string | null>;
  selectedConv: Accessor<Conv | null>;
  selectConv: (conv: Conv) => void;
  createConv: (title: string | null) => Promise<boolean>;
  creatingConv: Accessor<boolean>;
  createConvError: Accessor<string | null>;
}

// Normalize a `Resource`'s thrown error into display text, matching the create
// side (`createRpcAction`): a real `Error` yields its message; anything else
// falls back to `fallback`. `undefined` (no error) reads as `null`.
const loadError = (err: unknown, fallback: string): string | null =>
  err == null ? null : err instanceof Error ? err.message : fallback;

/**
 * The displayed label for a conversation; empty/absent title reads as "Untitled".
 * The navigator renders the same rule, so it consumes this to stay in one place.
 */
export const convLabel = (c: Conv): string => c.title || "Untitled";

// Keep the navigator scannable: sort case-insensitively by displayed label, with
// `id` as a stable tiebreak so equal labels (e.g. several "Untitled") are
// deterministic. `~/types/backend` ids are `number` (ADR-0003), so the subtraction
// is safe. Applied once at this seam so every consumer sees one order.
const sortByLabel = <T extends { id: number }>(items: T[], label: (item: T) => string): T[] =>
  [...items].sort(
    (a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: "base" }) || a.id - b.id,
  );

export function createConversationWorkspace(): ConversationWorkspace {
  const [selectedAgent, setSelectedAgent] = createSignal<Agent | null>(null);
  const [selectedConv, setSelectedConv] = createSignal<Conv | null>(null);

  const [agents, { refetch: refetchAgents }] = createResource(async () =>
    sortByLabel(await backendRpc.agent.list(), (a) => a.name),
  );

  // Conversations belong to the selected agent; re-keying on it refetches (and
  // yields [] with no agent), so the list never shows another agent's convs.
  const [convs, { refetch: refetchConvs }] = createResource(selectedAgent, async (agent) => {
    if (!agent) return [];
    return sortByLabel(await backendRpc.conv.list(agent.id), convLabel);
  });

  const selectAgent = (agent: Agent) => {
    // Accordion toggle: re-selecting the open agent collapses it back to none;
    // any change of agent (including collapse) drops the conversation selection.
    if (selectedAgent()?.id === agent.id) {
      setSelectedAgent(null);
      setSelectedConv(null);
      return;
    }
    setSelectedAgent(agent);
    setSelectedConv(null);
  };

  const selectConv = (conv: Conv) => setSelectedConv(conv);

  // Each action owns the pending/error state machine; the operation below (RPC +
  // refetch + select) runs *inside* the wrapped fn so a refetch rejection is
  // caught into `error` and pending still clears.
  const agentAction = createRpcAction(
    async (name: string) => {
      const agent = await backendRpc.agent.create({ name });
      await refetchAgents();
      selectAgent(agent);
      return agent;
    },
    { fallbackError: "Failed to create agent" },
  );

  const convAction = createRpcAction(
    async ({ agent, title }: { agent: Agent; title: string | null }) => {
      const conv = await backendRpc.conv.create({ agent_id: agent.id, title });
      await refetchConvs();
      selectConv(conv);
      return conv;
    },
    { fallbackError: "Failed to create conversation" },
  );

  const createAgent = async (name: string): Promise<boolean> =>
    (await agentAction.run(name)) !== undefined;

  const createConv = async (title: string | null): Promise<boolean> => {
    // Pre-check runs before the state machine: no agent, no work, no error/pending.
    const agent = selectedAgent();
    if (!agent) return false;
    return (await convAction.run({ agent, title })) !== undefined;
  };

  return {
    agents: () => agents() ?? [],
    agentsLoading: () => agents.loading,
    agentsError: () => loadError(agents.error, "Failed to load agents"),
    selectedAgent,
    selectAgent,
    createAgent,
    creatingAgent: agentAction.pending,
    createAgentError: agentAction.error,
    convs: () => convs() ?? [],
    convsLoading: () => convs.loading,
    convsError: () => loadError(convs.error, "Failed to load conversations"),
    selectedConv,
    selectConv,
    createConv,
    creatingConv: convAction.pending,
    createConvError: convAction.error,
  };
}
