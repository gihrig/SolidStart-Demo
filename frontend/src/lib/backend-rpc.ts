import type {
  Agent,
  AgentForCreate,
  AgentForUpdate,
  Conv,
  ConvForCreate,
  ConvForUpdate,
  ConvMsg,
  ConvMsgForCreate,
  JsonRpcRequest,
  JsonRpcResponse,
  LoginPayload,
  LogoffPayload,
} from "~/types/backend";
import { isRpcError } from "~/types/backend";

const BACKEND_URL = "http://localhost:8080";

// Auth functions (not RPC, direct REST)
export const auth = {
  async login(username: string, password: string): Promise<{ result: { success: boolean } }> {
    const payload: LoginPayload = { username, pwd: password };
    const response = await fetch(`${BACKEND_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Login failed: ${response.status}`);
    }
    return response.json();
  },

  async logoff(): Promise<void> {
    const payload: LogoffPayload = { logoff: true };
    await fetch(`${BACKEND_URL}/api/logoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  },
};

/**
 * The convMsg slice a message view consumes (see createConvMessages). The RPC
 * client's `convMsg` object satisfies it structurally, so the app injects the
 * real client by default while tests pass an in-memory adapter — the RPC-side
 * mirror of the socket seam (MessageFeed in websocket.ts).
 */
export interface ConvMsgClient {
  list: (convId: number) => Promise<ConvMsg[]>;
  add: (data: ConvMsgForCreate) => Promise<ConvMsg>;
}

/**
 * The agent + conv slice the Conversations workspace consumes (see
 * createConversationWorkspace). The RPC client's `agent`/`conv` objects satisfy
 * it structurally, so the app injects the real client by default while tests
 * pass an in-memory adapter — the same inject-or-default idiom as ConvMsgClient.
 */
export interface WorkspaceRpcClient {
  agent: {
    list: () => Promise<Agent[]>;
    create: (data: AgentForCreate) => Promise<Agent>;
  };
  conv: {
    list: (agentId: number, opts?: { includeArchived?: boolean }) => Promise<Conv[]>;
    create: (data: ConvForCreate) => Promise<Conv>;
    update: (id: number, data: ConvForUpdate) => Promise<Conv>;
  };
}

// An RPC client owns its own request-id counter, so tests can spin up a fresh
// one instead of depending on module-global state that leaks between them.
export function createRpcClient() {
  let rpcId = 0;

  async function rpcCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: ++rpcId,
      method,
      params,
    };

    const response = await fetch(`${BACKEND_URL}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Include cookies for auth
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json: JsonRpcResponse<T> = await response.json();

    if (isRpcError(json)) {
      const detail = json.error.data?.detail || json.error.message;
      throw new Error(`RPC Error: ${detail}`);
    }

    return json.result.data;
  }

  // create/get/update/delete share one JSON-RPC envelope, keyed by entity name
  // (`create_agent`, `get_conv`, …). `list` is deliberately NOT generated here:
  // its arg shape and filter dialect differ per entity, and the method name is
  // plural (`list_agents`), so each entity spells its own `list` below. C1 lived
  // in conv.list — keeping it hand-written keeps that domain logic visible.
  function crud<Entity, CreateInput, UpdateInput>(name: string) {
    return {
      create: (data: CreateInput) => rpcCall<Entity>(`create_${name}`, { data }),
      get: (id: number) => rpcCall<Entity>(`get_${name}`, { id }),
      update: (id: number, data: UpdateInput) => rpcCall<Entity>(`update_${name}`, { id, data }),
      delete: (id: number) => rpcCall<Entity>(`delete_${name}`, { id }),
    };
  }

  // Agent RPC methods
  const agent = {
    ...crud<Agent, AgentForCreate, AgentForUpdate>("agent"),
    list: () => rpcCall<Agent[]>("list_agents"),
  };

  // Conversation RPC methods
  const conv = {
    ...crud<Conv, ConvForCreate, ConvForUpdate>("conv"),
    // List a single Agent's Conversations. The ModQL filter shape
    // ([{ field: { $eq } }], matching the back-end's OneOrMany<Vec<ConvFilter>>) is
    // built here so callers pass a domain id, never the query dialect — a raw
    // `{ filters }` passthrough double-wrapped it into an empty filter, leaking
    // every Agent's Convs (arch-review C1).
    //
    // Archived filtering is the back-end's (#25): a node with no `state` is
    // returned as the working set (`list_convs` injects `state != Archived`).
    // To include Archived, constrain `state` to both values, which the back-end
    // honors verbatim — so the front-end never filters Conversations itself.
    list: (agentId: number, opts: { includeArchived?: boolean } = {}) => {
      const node: Record<string, unknown> = { agent_id: { $eq: agentId } };
      if (opts.includeArchived) node.state = { $in: ["Active", "Archived"] };
      return rpcCall<Conv[]>("list_convs", { filters: [node] });
    },
  };

  // Conversation Message RPC methods
  const convMsg = {
    add: (data: ConvMsgForCreate) => rpcCall<ConvMsg>("add_conv_msg", { data }),
    list: (convId: number) =>
      rpcCall<ConvMsg[]>("list_conv_msgs", {
        filters: [{ conv_id: { $eq: convId } }],
      }),
  };

  return { agent, conv, convMsg };
}

// Default singleton used across the app.
const client = createRpcClient();
export const agent = client.agent;
export const conv = client.conv;
export const convMsg = client.convMsg;

// Unified export
export const backendRpc = { auth, ...client };
