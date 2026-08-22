// The generated ts-rs bindings declare entity ids as `bigint`, but every id
// arrives via response.json() / JSON.parse as a `number` (see ADR-0003). This
// barrel is the single seam that makes the declared type match that runtime
// value: NumericIds<T> rewrites a binding's bigint fields to number and
// re-exports it under the same name, so downstream code compares ids directly
// with no coercion while the generated .d.ts files stay untouched.
import type { Agent as AgentWire } from "~backend-bindings/Agent.d";
import type { Conv as ConvWire } from "~backend-bindings/Conv.d";
import type { ConvMsg as ConvMsgWire } from "~backend-bindings/ConvMsg.d";
import type { ConvUser as ConvUserWire } from "~backend-bindings/ConvUser.d";
import type { User as UserWire } from "~backend-bindings/User.d";

/** Rewrite a binding's bigint id fields to the number they already are at runtime. */
type NumericIds<T> = { [K in keyof T]: T[K] extends bigint ? number : T[K] };

export type Agent = NumericIds<AgentWire>;
export type Conv = NumericIds<ConvWire>;
export type ConvMsg = NumericIds<ConvMsgWire>;
export type ConvUser = NumericIds<ConvUserWire>;
export type User = NumericIds<UserWire>;

// String-union bindings carry no ids — re-export unchanged.
export type { ConvKind } from "~backend-bindings/ConvKind.d";
export type { ConvState } from "~backend-bindings/ConvState.d";
export type { UserTyp } from "~backend-bindings/UserTyp.d";
export type { ParamsIded } from "~backend-bindings/ParamsIded.d";
export type { ParamsForUpdate } from "~backend-bindings/ParamsForUpdate.d";

// Realtime feed envelope — generated from the backend `WsEvent` (ADR-0015). No
// ids, so it re-exports unchanged. `payload` is `unknown`; the consumer narrows
// it by `event_type`.
export type { WsEvent } from "~backend-bindings/WsEvent.d";

// Input types for create operations (not in generated bindings)
export interface AgentForCreate {
  name: string;
}

export interface AgentForUpdate {
  name?: string;
}

export interface ConvForCreate {
  agent_id: number;
  title?: string | null;
  kind?: "OwnerOnly" | "MultiUsers";
}

export interface ConvForUpdate {
  owner_id?: number;
  title?: string | null;
  state?: "Active" | "Archived";
}

export interface ConvMsgForCreate {
  conv_id: number;
  content: string;
}

// Login/Logoff payloads
export interface LoginPayload {
  username: string;
  pwd: string;
}

export interface LogoffPayload {
  logoff: boolean;
}

// JSON-RPC types
export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: P;
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result: { data: T };
}

export interface JsonRpcErrorResponse {
  id: number | string | null;
  error: {
    message: string;
    data?: {
      req_uuid?: string;
      detail?: string;
    };
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccessResponse<T> | JsonRpcErrorResponse;

// Type guard for error response
export function isRpcError(response: JsonRpcResponse): response is JsonRpcErrorResponse {
  return "error" in response;
}

// WebSocket subscription request (client → server). The event envelope is the
// generated `WsEvent` re-exported above; this request shape is declared here
// because the backend `SubscriptionRequest` is not a ts-rs binding. `channel` is
// `"conv"` only — the backend authorizes and routes no other kind (ADR-0015).
export interface WsSubscription {
  action: "subscribe" | "unsubscribe";
  channel: "conv";
  id?: number;
}
