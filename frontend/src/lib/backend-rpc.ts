import type {
  AuthenticatedRpc,
  JsonRpcRequest,
  JsonRpcResponse,
  LoginPayload,
  LogoffPayload,
  PublicRpc,
} from "~/types/backend";
import { isServer } from "solid-js/web";
import { isRpcError } from "~/types/backend";

// The browser posts to its own origin: the HTTPS edge routes `/api/*` to the
// back-end (ADR-0034). SSR has no page origin, so it calls the back-end directly.
const BACKEND_URL = isServer ? "http://localhost:8080" : "";

// The params argument of a typed call: none when the method's params export no
// field (`undefined` in the RPC contract), so a list takes no argument.
type ParamsArg<P> = [P] extends [undefined] ? [] : [params: P];

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

  // `path` selects the RPC surface: the default authed "/api/rpc", or the public
  // "/api/rpc-public" for reads an anonymous visitor may run (e.g. the Jedi feed
  // taxonomy). Both send the cookie; the public surface simply does not require it.
  async function rpcCall<T>(
    method: string,
    params?: Record<string, unknown>,
    path = "/api/rpc",
  ): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: ++rpcId,
      method,
      params,
    };

    const response = await fetch(`${BACKEND_URL}${path}`, {
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

  // The typed calls (ADR-0029). Each surface's methods, params and results come
  // from the back-end RPC contract (`RpcContract.ts`), so `tsc` rejects a wrong
  // method name, params shape or result use, and a method on the wrong surface.
  // `authenticatedRpc` posts to the authenticated surface: the mutations, and
  // the reads that need a login (e.g. the caller's like state, the profile).
  // `publicRpc` posts to the public surface: the reads an anonymous visitor
  // may run (the Jedi feed, its taxonomy, the Hero).
  function authenticatedRpc<M extends keyof AuthenticatedRpc>(
    method: M,
    ...params: ParamsArg<AuthenticatedRpc[M]["params"]>
  ): Promise<AuthenticatedRpc[M]["result"]> {
    return rpcCall(method, params[0], "/api/rpc");
  }

  function publicRpc<M extends keyof PublicRpc>(
    method: M,
    ...params: ParamsArg<PublicRpc[M]["params"]>
  ): Promise<PublicRpc[M]["result"]> {
    return rpcCall(method, params[0], "/api/rpc-public");
  }

  return { authenticatedRpc, publicRpc };
}

// Default singleton used across the app.
const client = createRpcClient();
export const authenticatedRpc = client.authenticatedRpc;
export const publicRpc = client.publicRpc;

// Unified export
export const backendRpc = { auth, ...client };
