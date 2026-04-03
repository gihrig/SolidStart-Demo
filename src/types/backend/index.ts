// Re-export generated types
export type { Agent } from './Agent.d'
export type { Conv } from './Conv.d'
export type { ConvKind } from './ConvKind.d'
export type { ConvState } from './ConvState.d'
export type { ConvMsg } from './ConvMsg.d'
export type { ConvUser } from './ConvUser.d'
export type { User } from './User.d'
export type { UserTyp } from './UserTyp.d'
export type { ParamsIded } from './ParamsIded.d'
export type { ParamsForUpdate } from './ParamsForUpdate.d'

// Input types for create operations (not in generated bindings)
export interface AgentForCreate {
  name: string
}

export interface AgentForUpdate {
  name?: string
}

export interface ConvForCreate {
  agent_id: bigint | number
  title?: string | null
  kind?: 'OwnerOnly' | 'MultiUsers'
}

export interface ConvForUpdate {
  owner_id?: bigint | number
  title?: string | null
  state?: 'Active' | 'Archived'
}

export interface ConvMsgForCreate {
  conv_id: bigint | number
  content: string
}

// Login/Logoff payloads
export interface LoginPayload {
  username: string
  pwd: string
}

export interface LogoffPayload {
  logoff: boolean
}

// JSON-RPC types
export interface JsonRpcRequest<P = unknown> {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: P
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number | string
  result: { data: T }
}

export interface JsonRpcErrorResponse {
  id: number | string | null
  error: {
    message: string
    data?: {
      req_uuid?: string
      detail?: string
    }
  }
}

export type JsonRpcResponse<T = unknown> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse

// Type guard for error response
export function isRpcError(
  response: JsonRpcResponse
): response is JsonRpcErrorResponse {
  return 'error' in response
}

// WebSocket message types — matches backend WsEvent struct fields
export interface WsMessage {
  event_type: 'conv_msg' | 'conv_update' | 'agent_update' | 'error'
  channel: string
  payload: unknown
}

export interface WsSubscription {
  action: 'subscribe' | 'unsubscribe'
  channel: 'conv' | 'agent'
  id?: bigint | number
}
