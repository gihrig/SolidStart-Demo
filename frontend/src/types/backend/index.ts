// The ts-rs bindings, re-exported unchanged. Consumers import them from this
// barrel, never from raw `bindings/` files (ADR-0010). A binding that needs a
// different type is fixed at its Rust source, not re-typed here (ADR-0027).
export type { AuthorRef } from "~backend-bindings/AuthorRef.d";
export type { CaptionForCreate } from "~backend-bindings/CaptionForCreate.d";
export type { CaptionForUpdate } from "~backend-bindings/CaptionForUpdate.d";
export type { CaptionView } from "~backend-bindings/CaptionView.d";
export type { CategoryPublic } from "~backend-bindings/CategoryPublic.d";
export type { Channel } from "~backend-bindings/Channel.d";
export { COMMENT_HTML_POLICY } from "~backend-bindings/CommentHtmlPolicy";
export type { CommentRemoval } from "~backend-bindings/CommentRemoval.d";
export type { CommentView } from "~backend-bindings/CommentView.d";
export type { HeroView } from "~backend-bindings/HeroView.d";
export type { HygieneCaps } from "~backend-bindings/HygieneCaps";
export type { LikeForToggle } from "~backend-bindings/LikeForToggle.d";
export type { LikeView } from "~backend-bindings/LikeView.d";
export type { ParamsForUpdate } from "~backend-bindings/ParamsForUpdate.d";
export type { ParamsIded } from "~backend-bindings/ParamsIded.d";
export type { PostCommentForCreate } from "~backend-bindings/PostCommentForCreate.d";
export type { PostCommentForUpdate } from "~backend-bindings/PostCommentForUpdate.d";
export type { PostForCreate } from "~backend-bindings/PostForCreate.d";
export type { PostForUpdate } from "~backend-bindings/PostForUpdate.d";
export type { PostView } from "~backend-bindings/PostView.d";
export type { AuthenticatedRpc, PublicRpc } from "~backend-bindings/RpcContract";
export type { User } from "~backend-bindings/User.d";
export type { UserTyp } from "~backend-bindings/UserTyp.d";
export type { WsEvent } from "~backend-bindings/WsEvent.d";

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
