// The generated ts-rs bindings declare entity ids as `bigint`, but every id
// arrives via response.json() / JSON.parse as a `number` (see ADR-0003). This
// barrel is the single seam that makes the declared type match that runtime
// value: NumericIds<T> rewrites a binding's bigint fields to number and
// re-exports it under the same name, so downstream code compares ids directly
// with no coercion while the generated .d.ts files stay untouched.
import type { Agent as AgentWire } from "~backend-bindings/Agent.d";
import type { CategoryPublic as CategoryPublicWire } from "~backend-bindings/CategoryPublic.d";
import type { Conv as ConvWire } from "~backend-bindings/Conv.d";
import type { ConvMsg as ConvMsgWire } from "~backend-bindings/ConvMsg.d";
import type { ConvUser as ConvUserWire } from "~backend-bindings/ConvUser.d";
import type { User as UserWire } from "~backend-bindings/User.d";
import type { WsEvent as WsEventWire } from "~backend-bindings/WsEvent.d";
import type { Channel as ChannelWire } from "~backend-bindings/Channel.d";

/** Rewrite a binding's bigint id fields to the number they already are at runtime. */
type NumericIds<T> = { [K in keyof T]: T[K] extends bigint ? number : T[K] };

/** Distribute {@link NumericIds} over each member of a union (e.g. `Channel`). */
type NumericIdsUnion<T> = T extends unknown ? NumericIds<T> : never;

export type Agent = NumericIds<AgentWire>;
/** The public Category projection (id, name, icon) — the anonymous read contract. */
export type CategoryPublic = NumericIds<CategoryPublicWire>;
export type Conv = NumericIds<ConvWire>;
export type ConvMsg = NumericIds<ConvMsgWire>;
export type ConvUser = NumericIds<ConvUserWire>;
export type User = NumericIds<UserWire>;

// The merged realtime `Channel` vocabulary (ADR-0020), one exported enum that
// replaces the former `ChannelKind`. Id-bearing variants carry `id: bigint` on
// the wire, so rewrite each member's id to the number it already is at runtime
// (ADR-0003); the front-end `channel.ts` builds its constructors on this type.
export type Channel = NumericIdsUnion<ChannelWire>;

// String-union bindings carry no ids — re-export unchanged.
export type { ConvKind } from "~backend-bindings/ConvKind.d";
export type { ConvState } from "~backend-bindings/ConvState.d";
export type { UserTyp } from "~backend-bindings/UserTyp.d";
export type { ParamsIded } from "~backend-bindings/ParamsIded.d";
export type { ParamsForUpdate } from "~backend-bindings/ParamsForUpdate.d";

// Realtime feed envelope — generated from the backend `WsEvent` (ADR-0015,
// ADR-0020), a discriminated union tagged by `event_type`. Consumed through the
// barrel (not raw) so ids get the same bigint→number rewrite as every entity
// (ADR-0003). The `conv_msg` payload variant has its nested row rewritten. Every
// contentless poke is one `poke` variant carrying a `Channel`; its `kind` selects
// the channel and its `id` (where the channel carries one) is rewritten via the
// same `Channel` type. The consumer narrows by `event_type`, then by `kind` for a
// poke — no cast.
type NumericIdsEvent<T> = T extends { payload: infer P }
  ? Omit<NumericIds<T>, "payload"> & { payload: NumericIds<P> }
  : T extends { event_type: "poke" }
    ? { event_type: "poke" } & Channel
    : NumericIds<T>;
export type WsEvent = NumericIdsEvent<WsEventWire>;

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
