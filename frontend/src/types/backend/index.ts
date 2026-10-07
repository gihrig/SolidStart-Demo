// The ts-rs bindings, re-exported unchanged. Consumers import them from this
// barrel, never from raw `bindings/` files (ADR-0010). A binding that needs a
// different type is fixed at its Rust source, not re-typed here (ADR-0027).
export type { Agent } from "~backend-bindings/Agent.d";
export type { AuthorRef } from "~backend-bindings/AuthorRef.d";
export type { CaptionForCreate } from "~backend-bindings/CaptionForCreate.d";
export type { CaptionView } from "~backend-bindings/CaptionView.d";
export type { CategoryPublic } from "~backend-bindings/CategoryPublic.d";
export type { Channel } from "~backend-bindings/Channel.d";
export type { Conv } from "~backend-bindings/Conv.d";
export type { ConvKind } from "~backend-bindings/ConvKind.d";
export type { ConvMsg } from "~backend-bindings/ConvMsg.d";
export type { ConvState } from "~backend-bindings/ConvState.d";
export type { ConvUser } from "~backend-bindings/ConvUser.d";
export type { HeroView } from "~backend-bindings/HeroView.d";
export type { ParamsForUpdate } from "~backend-bindings/ParamsForUpdate.d";
export type { ParamsIded } from "~backend-bindings/ParamsIded.d";
export type { PostForCreate } from "~backend-bindings/PostForCreate.d";
export type { PostLikeForToggle } from "~backend-bindings/PostLikeForToggle.d";
export type { PostLikeView } from "~backend-bindings/PostLikeView.d";
export type { PostView } from "~backend-bindings/PostView.d";
export type { User } from "~backend-bindings/User.d";
export type { UserTyp } from "~backend-bindings/UserTyp.d";
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
