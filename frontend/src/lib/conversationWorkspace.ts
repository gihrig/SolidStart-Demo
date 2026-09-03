import { createSignal, createResource, createEffect, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { backendRpc, type WorkspaceRpcClient } from "~/lib/backend-rpc";
import { createRpcAction } from "~/lib/createRpcAction";
import { useWebSocket, type MessageFeedFactory } from "~/lib/websocket";
import { Channel } from "~/lib/channel";
import type { Agent, Conv, ConvState } from "~/types/backend";

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
  // Archive (#46). `convs` above already excludes Archived Conversations unless
  // `showArchived` is on, so consumers render the visible set without filtering.
  archiveConv: (conv: Conv) => Promise<boolean>;
  unarchiveConv: (conv: Conv) => Promise<boolean>;
  /** True while this Conversation's archive/unarchive is in flight. Per-id, so
   *  concurrent operations never clear each other's pending state. */
  isArchiving: (convId: number) => boolean;
  /** This Conversation's last archive/unarchive error, else null. Per-id, so
   *  overlapping operations never clear or misattribute each other's failure. */
  archiveError: (convId: number) => string | null;
  /** When false (default), Archived Conversations are hidden from `convs`. */
  showArchived: Accessor<boolean>;
  toggleShowArchived: () => void;
}

/**
 * Injectable seams: the live WebSocket feed and the agent+conv RPC slice, each
 * real by default and an in-memory adapter in tests. Mirrors `ConvMessagesDeps`
 * so the injection story is identical across both view-models; injecting the RPC
 * half drops the need for `vi.mock("~/lib/backend-rpc")`.
 */
export interface ConversationWorkspaceDeps {
  feed?: MessageFeedFactory;
  rpc?: WorkspaceRpcClient;
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

export function createConversationWorkspace(
  deps: ConversationWorkspaceDeps = {},
): ConversationWorkspace {
  const [selectedAgent, setSelectedAgent] = createSignal<Agent | null>(null);
  const [selectedConv, setSelectedConv] = createSignal<Conv | null>(null);
  // Default view is the working set: Archived Conversations are hidden until the
  // navigator toggles this on (#46). The back-end will own this exclusion once
  // #25 lands; today it filters client-side over the full list.
  const [showArchived, setShowArchived] = createSignal(false);
  // Per-Conversation pending: the set of ids being archived/unarchived, so only
  // each in-flight row's control disables AND concurrent operations don't clear
  // each other's pending state (a single id would clobber).
  const [archivingIds, setArchivingIds] = createSignal<ReadonlySet<number>>(new Set());
  const setArchiving = (id: number, on: boolean) =>
    setArchivingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  // Per-Conversation archive error, keyed by id for the same reason as pending:
  // overlapping operations must not clear or misattribute each other's failure
  // (a single shared error signal would). Each row reads only its own.
  const [archiveErrors, setArchiveErrors] = createSignal<ReadonlyMap<number, string>>(new Map());
  const setArchiveError = (id: number, msg: string | null) =>
    setArchiveErrors((prev) => {
      const next = new Map(prev);
      if (msg === null) next.delete(id);
      else next.set(id, msg);
      return next;
    });

  // Both data sources are injectable seams; default to the real socket/singleton.
  const rpc = deps.rpc ?? backendRpc;

  // Agents are held in a reconciled store, not read straight off the resource, so
  // a refetch (e.g. a #85 `agent_update` poke) keeps stable object identity for
  // unchanged Agents. `<For>` then preserves the open Agent's row — and the
  // uncontrolled create-conversation input inside it — instead of recreating it.
  const [agentList, setAgentList] = createStore<Agent[]>([]);
  const [agentsRes, { refetch: refetchAgents }] = createResource(async () => {
    const list = sortByLabel(await rpc.agent.list(), (a) => a.name);
    setAgentList(reconcile(list, { key: "id" }));
    return list;
  });

  // Conversations belong to the selected agent; re-keying on the agent *and*
  // `showArchived` refetches (and yields [] with no agent), so the list never
  // shows another agent's convs. Archived filtering is the back-end's (#25): the
  // default request is the working set; `includeArchived` asks for both states.
  const convSource = () => ({
    agent: selectedAgent(),
    includeArchived: showArchived(),
  });
  const [convs, { refetch: refetchConvs }] = createResource(
    convSource,
    async ({ agent, includeArchived }) => {
      if (!agent) return [];
      return sortByLabel(await rpc.conv.list(agent.id, { includeArchived }), convLabel);
    },
  );

  // Keep the conversation selection reachable: whenever the list settles without
  // the selected Conversation — archived here, archived/deleted elsewhere (a feed
  // poke), or hidden by toggling "Show archived" off — drop the selection so the
  // reading pane never strands a Conversation absent from the navigator. Reading
  // `convs.latest` never throws on an errored resource, so a failed refetch keeps
  // the (stale) selection until a later successful one reconciles it.
  createEffect(() => {
    const list = convs.latest ?? [];
    const sel = selectedConv();
    if (sel && !list.some((c) => c.id === sel.id)) setSelectedConv(null);
  });

  // Live propagation (#85): a poke on either global list feed refetches the
  // matching list, so a change made in one client (or tab) reaches the others.
  // The feed carries no rows; the refetch re-applies the back-end read scope.
  const feed = (deps.feed ?? useWebSocket)({
    // After the refetch settles, drop the selection if the selected Agent is the
    // one deleted elsewhere — its row is now gone from `agentList`. Same collapse
    // `selectAgent` makes on re-select; clearing it re-keys the conv resource to
    // [], so the deleted Agent's cascaded conversations leave the screen and
    // `createConv` can't fire against a dead Agent id. This lives in the `then`,
    // not the resource fetcher, because the fetcher would track the signal read.
    onAgentUpdate: () =>
      void Promise.resolve(refetchAgents()).then(() => {
        const sel = selectedAgent();
        if (sel && !agentList.some((a) => a.id === sel.id)) {
          setSelectedAgent(null);
          setSelectedConv(null);
        }
      }),
    onConvUpdate: () => void refetchConvs(),
  });
  feed.subscribe(Channel.agents);
  feed.subscribe(Channel.convs);

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
      const agent = await rpc.agent.create({ name });
      await refetchAgents();
      selectAgent(agent);
      return agent;
    },
    { fallbackError: "Failed to create agent" },
  );

  const convAction = createRpcAction(
    async ({ agent, title }: { agent: Agent; title: string | null }) => {
      const conv = await rpc.conv.create({ agent_id: agent.id, title });
      await refetchConvs();
      selectConv(conv);
      return conv;
    },
    { fallbackError: "Failed to create conversation" },
  );

  // Flip a Conversation's `state`, then refetch so the list reflects it. Pending
  // and error are keyed by conv id (not one shared action), so overlapping
  // operations never clear each other's spinner or failure. Only the update is
  // fallible to the caller: a refetch rejection is swallowed because the convs
  // feed poke (#25) and the resource's own error (convsError) already reconcile
  // the list — reporting it as an archive failure would be wrong (the mutation
  // persisted).
  const runStateChange = async (conv: Conv, state: ConvState): Promise<boolean> => {
    setArchiveError(conv.id, null);
    setArchiving(conv.id, true);
    try {
      await rpc.conv.update(conv.id, { state });
      await Promise.resolve(refetchConvs()).catch(() => {});
      return true;
    } catch (e) {
      setArchiveError(conv.id, e instanceof Error ? e.message : "Failed to update conversation");
      return false;
    } finally {
      setArchiving(conv.id, false);
    }
  };

  const createAgent = async (name: string): Promise<boolean> =>
    (await agentAction.run(name)) !== undefined;

  // Selection reconciliation after the refetch is the `createEffect` above, which
  // covers every list change (this call, a feed poke, or a "Show archived"
  // toggle) — not just this call site, so a later refetch can't strand it.
  const archiveConv = (conv: Conv): Promise<boolean> => runStateChange(conv, "Archived");

  const unarchiveConv = (conv: Conv): Promise<boolean> => runStateChange(conv, "Active");

  const toggleShowArchived = () => setShowArchived((v) => !v);

  const createConv = async (title: string | null): Promise<boolean> => {
    // Pre-check runs before the state machine: no agent, no work, no error/pending.
    const agent = selectedAgent();
    if (!agent) return false;
    return (await convAction.run({ agent, title })) !== undefined;
  };

  return {
    agents: () => agentList,
    agentsLoading: () => agentsRes.loading,
    agentsError: () => loadError(agentsRes.error, "Failed to load agents"),
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
    archiveConv,
    unarchiveConv,
    isArchiving: (convId: number) => archivingIds().has(convId),
    archiveError: (convId: number) => archiveErrors().get(convId) ?? null,
    showArchived,
    toggleShowArchived,
  };
}
