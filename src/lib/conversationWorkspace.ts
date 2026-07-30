import { createSignal, createResource, type Accessor, type Resource } from "solid-js";
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
  // Agents
  agents: Resource<Agent[]>;
  selectedAgent: Accessor<Agent | null>;
  selectAgent: (agent: Agent) => void;
  createAgent: (name: string) => Promise<boolean>;
  creatingAgent: Accessor<boolean>;
  agentError: Accessor<string | null>;
  // Conversations
  convs: Resource<Conv[]>;
  selectedConv: Accessor<Conv | null>;
  selectConv: (conv: Conv) => void;
  createConv: (title: string | null) => Promise<boolean>;
  creatingConv: Accessor<boolean>;
  convError: Accessor<string | null>;
}

export function createConversationWorkspace(): ConversationWorkspace {
  const [selectedAgent, setSelectedAgent] = createSignal<Agent | null>(null);
  const [selectedConv, setSelectedConv] = createSignal<Conv | null>(null);

  const [agents, { refetch: refetchAgents }] = createResource(() => backendRpc.agent.list());

  // Conversations belong to the selected agent; re-keying on it refetches (and
  // yields [] with no agent), so the list never shows another agent's convs.
  const [convs, { refetch: refetchConvs }] = createResource(selectedAgent, async (agent) => {
    if (!agent) return [];
    return backendRpc.conv.list({
      filters: [{ agent_id: { $eq: agent.id } }],
    });
  });

  const selectAgent = (agent: Agent) => {
    // Only a genuine agent change drops the conversation selection; re-clicking
    // the current agent leaves it intact.
    const changed = selectedAgent()?.id !== agent.id;
    setSelectedAgent(agent);
    if (changed) setSelectedConv(null);
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
    agents,
    selectedAgent,
    selectAgent,
    createAgent,
    creatingAgent: agentAction.pending,
    agentError: agentAction.error,
    convs,
    selectedConv,
    selectConv,
    createConv,
    creatingConv: convAction.pending,
    convError: convAction.error,
  };
}
