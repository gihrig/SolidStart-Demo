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
import type { WsEvent as WsEventWire } from "~backend-bindings/WsEvent.d";
import type { ChannelKind } from "~backend-bindings/ChannelKind.d";

/** Rewrite a binding's bigint id fields to the number they already are at runtime. */
type NumericIds<T> = { [K in keyof T]: T[K] extends bigint ? number : T[K] };

export type Agent = NumericIds<AgentWire>;
export type Conv = NumericIds<ConvWire>;
export type ConvMsg = NumericIds<ConvMsgWire>;
export type ConvUser = NumericIds<ConvUserWire>;
export type User = NumericIds<UserWire>;

// String-union bindings carry no ids — re-export unchanged.
export type { ChannelKind };
export type { ConvKind } from "~backend-bindings/ConvKind.d";
export type { ConvState } from "~backend-bindings/ConvState.d";
export type { UserTyp } from "~backend-bindings/UserTyp.d";
export type { ParamsIded } from "~backend-bindings/ParamsIded.d";
export type { ParamsForUpdate } from "~backend-bindings/ParamsForUpdate.d";

// Realtime feed envelope — generated from the backend `WsEvent` (ADR-0015), a
// discriminated union tagged by `event_type`. Consumed through the barrel (not
// raw) so ids get the same bigint→number rewrite as every entity (ADR-0003). A
// payload variant (`conv_msg`) has its nested row rewritten; a Jedi poke variant
// (`post_like` / `caption_like` / `post_caption`) carries its routing id at the
// top level, so that id is rewritten in place (#115); `agent_update` / `conv_update`
// / `posts` carry nothing. The consumer narrows by `event_type` — no cast.
type NumericIdsEvent<T> = T extends { payload: infer P }
  ? Omit<NumericIds<T>, "payload"> & { payload: NumericIds<P> }
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

// WebSocket subscription request (client → server). The event envelope is the
// generated `WsEvent` re-exported above; the `channel` kinds are the generated
// `ChannelKind` (ADR-0018), which the front-end `Channel` module (`lib/channel.ts`)
// builds its constructors on. The id-less feeds `agents` / `convs` / `posts` take
// no `id`; the id-bearing kinds do — `conv` (#85) and the five Jedi channels
// `post_comment` / `caption_comment` / `post_like` / `caption_like` / `post_caption`
// (#115). The full request struct stays hand-declared — only its `channel`
// vocabulary is a binding.
export interface WsSubscription {
  action: "subscribe" | "unsubscribe";
  channel: ChannelKind;
  id?: number;
}
