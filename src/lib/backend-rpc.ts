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

  // Agent RPC methods
  const agent = {
    create: (data: AgentForCreate) => rpcCall<Agent>("create_agent", { data }),
    get: (id: number) => rpcCall<Agent>("get_agent", { id }),
    list: (filters?: Record<string, unknown>) => rpcCall<Agent[]>("list_agents", { filters }),
    update: (id: number, data: AgentForUpdate) => rpcCall<Agent>("update_agent", { id, data }),
    delete: (id: number) => rpcCall<Agent>("delete_agent", { id }),
  };

  // Conversation RPC methods
  const conv = {
    create: (data: ConvForCreate) => rpcCall<Conv>("create_conv", { data }),
    get: (id: number) => rpcCall<Conv>("get_conv", { id }),
    list: (filters?: Record<string, unknown>) => rpcCall<Conv[]>("list_convs", { filters }),
    update: (id: number, data: ConvForUpdate) => rpcCall<Conv>("update_conv", { id, data }),
    delete: (id: number) => rpcCall<Conv>("delete_conv", { id }),
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
