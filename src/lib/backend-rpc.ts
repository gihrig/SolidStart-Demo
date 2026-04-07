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

let rpcId = 0;

// BigInt-safe JSON serializer
function serializeWithBigInt(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => (typeof value === "bigint" ? Number(value) : value));
}

// Core RPC call function
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
    body: serializeWithBigInt(request),
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

// Agent RPC methods
export const agent = {
  create: (data: AgentForCreate) => rpcCall<Agent>("create_agent", { data }),
  get: (id: bigint | number) => rpcCall<Agent>("get_agent", { id: Number(id) }),
  list: (filters?: Record<string, unknown>) => rpcCall<Agent[]>("list_agents", { filters }),
  update: (id: bigint | number, data: AgentForUpdate) =>
    rpcCall<Agent>("update_agent", { id: Number(id), data }),
  delete: (id: bigint | number) => rpcCall<Agent>("delete_agent", { id: Number(id) }),
};

// Conversation RPC methods
export const conv = {
  create: (data: ConvForCreate) => rpcCall<Conv>("create_conv", { data }),
  get: (id: bigint | number) => rpcCall<Conv>("get_conv", { id: Number(id) }),
  list: (filters?: Record<string, unknown>) => rpcCall<Conv[]>("list_convs", { filters }),
  update: (id: bigint | number, data: ConvForUpdate) =>
    rpcCall<Conv>("update_conv", { id: Number(id), data }),
  delete: (id: bigint | number) => rpcCall<Conv>("delete_conv", { id: Number(id) }),
};

// Conversation Message RPC methods
export const convMsg = {
  add: (data: ConvMsgForCreate) => rpcCall<ConvMsg>("add_conv_msg", { data }),
  list: (convId: bigint | number) =>
    rpcCall<ConvMsg[]>("list_conv_msgs", {
      filters: [{ conv_id: { $eq: Number(convId) } }],
    }),
};

// Unified export
export const backendRpc = { auth, agent, conv, convMsg };
