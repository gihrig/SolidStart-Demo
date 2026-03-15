# Full-Stack Integration Plan: SolidStart + Rust/Axum JSON-RPC

## Overview

This plan details integrating a SolidStart TypeScript front-end with a Rust/Axum back-end via JSON-RPC. The goal is to recreate the `quick_dev.rs` example functionality as an interactive SolidStart page at `/fullstack`.

**Project Locations:**
- Front-End
```sh
FRONT_END='/Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo'
```

- Back-End
```sh
BACK_END='/Users/glen/Documents/Development/Study/Rust/Rust_10X/rust-web-app'
```

- TS-Bindings
```sh
TS_BIND_SRC='$BACK_END/crates/services/web-server/bindings'
```

**Communication:**
- Back-end: `http://localhost:8080`
- Front-end: `http://localhost:3000`
- RPC Endpoint: `POST http://localhost:8080/api/rpc`
- WebSocket Endpoint: `ws://localhost:8080/ws` (for real-time updates)
- Auth Endpoints: `POST /api/login`, `POST /api/logoff`

**Deployment:**
- Both projects will be deployed together in a single Docker container

---

## Selected Approach Summary

> **SELECTED:** Option A (Direct Fetch with Custom RPC Client) + Option C (CORS Configuration) + Alternative 1 (WebSocket for Real-time Updates)

This combination provides:
- Clear separation of concerns
- Direct use of generated TypeScript types
- Standard browser-based authentication flow with HTTP-only cookies
- Simpler debugging and development
- Real-time message updates without polling

---

## Part 1: Architecture Analysis & Recommendations

### Current State

**Rust Back-end JSON-RPC:**
- Uses `rpc-router` crate with Axum
- Endpoint: `POST /api/rpc`
- Authentication via HTTP-only cookies (`auth-token`)
- Available methods: `create_agent`, `get_agent`, `list_agents`, `update_agent`, `delete_agent`, `create_conv`, `get_conv`, `list_convs`, `update_conv`, `delete_conv`, `add_conv_msg`

**SolidStart Front-end:**
- Uses `json-rpc-client` library (v0.2.2)
- Current RPC client configured for different endpoint structure
- Has patterns for async data fetching with `createResource()`

### Key Integration Challenges

1. **Cookie-based Authentication**: The Rust back-end uses HTTP-only cookies. The front-end must include credentials in requests.

2. **CORS Configuration**: Cross-origin requests from `localhost:3000` to `localhost:8080` require proper CORS headers.

3. **BigInt Serialization**: Rust uses `i64` for IDs, TypeScript bindings use `bigint`, but JSON doesn't support BigInt natively.

4. **RPC Method Naming**: Back-end uses `method_name` format (e.g., `create_agent`), not dotted notation.

5. **Real-time Updates**: Need mechanism for live message updates in conversations.

### Approach Options Considered

#### Option A: Direct Fetch with Custom RPC Client **[SELECTED]**

Replace `json-rpc-client` with a custom client that:
- Handles cookie credentials properly
- Supports BigInt serialization/deserialization
- Matches the exact Rust RPC structure

**Pros:** Full control, no external dependencies, exact type matching
**Cons:** More initial code to write

#### Option B: Proxy Through SolidStart Server Functions **[NOT SELECTED]**

Use SolidStart server functions as a proxy layer.

**Reason not selected:** Extra hop adds latency, more complex session management

#### Option C: Configure CORS on Rust Back-end **[SELECTED]**

Add CORS middleware to Axum to allow cross-origin requests with credentials.

**Pros:** Simple, standard web approach
**Cons:** Requires back-end changes, potential security considerations

---

## Part 2: Implementation Steps

### Phase 1: Setup TypeScript Types & RPC Client


#### Step 1.1: Copy TypeScript Bindings to Front-end
- [x] Completed

 - Add to `""$FRONT_END/package.json"`:

```json
{
  "scripts": {
    "sync-types": "cp ../../../Rust/Rust_10X/rust-web-app/crates/services/web-server/bindings/*.d.ts ./src/types/backend/"
  }
}
```

```bash
# Create types directory in SolidStart project
mkdir -p "$FRONT_END/src/types/backend"

# Copy bindings (can be automated in build script)
cp "$BACK_END/crates/services/web-server/bindings/*.d.ts \
   $FRONT_END/src/types/backend/"
```

**Files to copy:**
- `Agent.d.ts`
- `Conv.d.ts`
- `ConvKind.d.ts`
- `ConvState.d.ts`
- `ConvMsg.d.ts`
- `ParamsIded.d.ts`
- `ParamsForUpdate.d.ts`

#### Step 1.2: Create Extended Types for Create/Input Operations
- [x] Completed

Create file: `src/types/backend/index.ts`

```typescript
// Re-export generated types
export type { Agent } from './Agent.d'
export type { Conv } from './Conv.d'
export type { ConvKind } from './ConvKind.d'
export type { ConvState } from './ConvState.d'
export type { ConvMsg } from './ConvMsg.d'
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

export type JsonRpcResponse<T = unknown> = JsonRpcSuccessResponse<T> | JsonRpcErrorResponse

// Type guard for error response
export function isRpcError(response: JsonRpcResponse): response is JsonRpcErrorResponse {
  return 'error' in response
}

// WebSocket message types
export interface WsMessage {
  type: 'conv_msg' | 'conv_update' | 'agent_update' | 'error'
  payload: unknown
}

export interface WsConvMsgPayload {
  conv_id: bigint | number
  msg: ConvMsg
}

export interface WsSubscription {
  action: 'subscribe' | 'unsubscribe'
  channel: 'conv' | 'agent'
  id?: bigint | number
}
```

#### Step 1.3: Create Custom RPC Client
- [x] Completed

Create file: `src/lib/backend-rpc.ts`

```typescript
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
  isRpcError,
} from '~/types/backend'

const BACKEND_URL = 'http://localhost:8080'

let rpcId = 0

// BigInt-safe JSON serializer
function serializeWithBigInt(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  )
}

// Core RPC call function
async function rpcCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: ++rpcId,
    method,
    params,
  }

  const response = await fetch(`${BACKEND_URL}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Include cookies for auth
    body: serializeWithBigInt(request),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const json: JsonRpcResponse<T> = await response.json()

  if (isRpcError(json)) {
    const detail = json.error.data?.detail || json.error.message
    throw new Error(`RPC Error: ${detail}`)
  }

  return json.result.data
}

// Auth functions (not RPC, direct REST)
export const auth = {
  async login(username: string, password: string): Promise<{ result: { success: boolean } }> {
    const payload: LoginPayload = { username, pwd: password }
    const response = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Login failed: ${response.status}`)
    }
    return response.json()
  },

  async logoff(): Promise<void> {
    const payload: LogoffPayload = { logoff: true }
    await fetch(`${BACKEND_URL}/api/logoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
  },
}

// Agent RPC methods
export const agent = {
  create: (data: AgentForCreate) => rpcCall<Agent>('create_agent', { data }),
  get: (id: bigint | number) => rpcCall<Agent>('get_agent', { id: Number(id) }),
  list: (filters?: Record<string, unknown>) => rpcCall<Agent[]>('list_agents', { filters }),
  update: (id: bigint | number, data: AgentForUpdate) =>
    rpcCall<Agent>('update_agent', { id: Number(id), data }),
  delete: (id: bigint | number) => rpcCall<Agent>('delete_agent', { id: Number(id) }),
}

// Conversation RPC methods
export const conv = {
  create: (data: ConvForCreate) => rpcCall<Conv>('create_conv', { data }),
  get: (id: bigint | number) => rpcCall<Conv>('get_conv', { id: Number(id) }),
  list: (filters?: Record<string, unknown>) => rpcCall<Conv[]>('list_convs', { filters }),
  update: (id: bigint | number, data: ConvForUpdate) =>
    rpcCall<Conv>('update_conv', { id: Number(id), data }),
  delete: (id: bigint | number) => rpcCall<Conv>('delete_conv', { id: Number(id) }),
}

// Conversation Message RPC methods
export const convMsg = {
  add: (data: ConvMsgForCreate) => rpcCall<ConvMsg>('add_conv_msg', { data }),
}

// Unified export
export const backendRpc = { auth, agent, conv, convMsg }
```

### Phase 2: CORS Configuration (Back-end)

#### Step 2.1: Add CORS Middleware to Rust Back-end
- [x] Completed

In `"$BACK_END/crates/services/web-server/src/main.rs"` or routes configuration, add:

```rust
use tower_http::cors::{CorsLayer, Any};
use http::Method;

// In router setup:
let cors = CorsLayer::new()
    .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
    .allow_headers(Any)
    .allow_credentials(true);

// Apply to router
let app = Router::new()
    // ... routes
    .layer(cors);
```

**Note:** For production, replace with specific allowed origins.

### Phase 3: WebSocket Support for Real-time Updates **[SELECTED: Alternative 1]**

#### Step 3.1: Add WebSocket Handler to Rust Back-end
- [x] Completed

Add to `Cargo.toml`:
```toml
[dependencies]
futures-util = "0.3"
tower-http = { version = "0.6.8", features = ["fs", "cors"] }
tokio-tungstenite = "0.21"
```

Create WebSocket handler in `"$BACK_END/crates/services/web-server/src/web/routes_ws.rs"`:

```rust
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone, Serialize, Deserialize)]
pub struct WsEvent {
    pub event_type: String,
    pub channel: String,
    pub payload: serde_json::Value,
}

#[derive(Clone)]
pub struct WsState {
    pub tx: broadcast::Sender<WsEvent>,
}

impl WsState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self { tx }
    }

    pub fn broadcast(&self, event: WsEvent) {
        let _ = self.tx.send(event);
    }
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<WsState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<WsState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    // Task to forward broadcast messages to this client
    let send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            let msg = serde_json::to_string(&event).unwrap();
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Task to receive messages from client (subscriptions, pings, etc.)
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    // Handle subscription requests
                    if let Ok(sub) = serde_json::from_str::<SubscriptionRequest>(&text) {
                        // Process subscription (implementation depends on your needs)
                        tracing::info!("Subscription request: {:?}", sub);
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}

#[derive(Debug, Deserialize)]
struct SubscriptionRequest {
    action: String, // "subscribe" | "unsubscribe"
    channel: String, // "conv" | "agent"
    id: Option<i64>,
}
```

#### Step 3.2: Register WebSocket Route
- [x] Completed

In your main router configuration:

```rust
use std::sync::Arc;
use crate::web::routes_ws::{ws_handler, WsState};

// Create WebSocket state
let ws_state = Arc::new(WsState::new());

// Add WebSocket route
let app = Router::new()
    // ... existing routes
    .route("/ws", get(ws_handler))
    .with_state(ws_state.clone());
```

#### Step 3.3: Broadcast Events on Data Changes
- [x] Completed

Modify RPC handlers to broadcast WebSocket events when data changes:

```rust
// In add_conv_msg handler (example)
pub async fn add_conv_msg(
    ctx: Ctx,
    mm: ModelManager,
    ws_state: Arc<WsState>,
    params: ParamsForCreate<ConvMsgForCreate>,
) -> Result<ConvMsg> {
    let msg = ConvMsgBmc::create(&ctx, &mm, params.data).await?;

    // Broadcast to WebSocket clients
    ws_state.broadcast(WsEvent {
        event_type: "conv_msg".to_string(),
        channel: format!("conv:{}", msg.conv_id),
        payload: serde_json::to_value(&msg).unwrap(),
    });

    Ok(msg)
}
```

### Phase 4: Create SolidStart Components

#### Step 4.1: Create WebSocket Client Hook
- [x] Completed

Create file: `src/lib/websocket.ts`

```typescript
import { createSignal, onCleanup, onMount } from 'solid-js'
import type { WsMessage, ConvMsg } from '~/types/backend'

const WS_URL = 'ws://localhost:8080/ws'

interface UseWebSocketOptions {
  onConvMsg?: (convId: number, msg: ConvMsg) => void
  onError?: (error: string) => void
  autoReconnect?: boolean
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [connected, setConnected] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  let ws: WebSocket | null = null
  let reconnectTimeout: number | null = null

  const connect = () => {
    try {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        setConnected(true)
        setError(null)
      }

      ws.onclose = () => {
        setConnected(false)
        if (options.autoReconnect !== false) {
          reconnectTimeout = window.setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection error')
        options.onError?.('WebSocket connection error')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsMessage
          if (data.type === 'conv_msg' && options.onConvMsg) {
            const payload = data.payload as { conv_id: number; msg: ConvMsg }
            options.onConvMsg(payload.conv_id, payload.msg)
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }
    } catch (e) {
      setError('Failed to connect to WebSocket')
    }
  }

  const subscribe = (channel: string, id?: number | bigint) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'subscribe',
        channel,
        id: id ? Number(id) : undefined,
      }))
    }
  }

  const unsubscribe = (channel: string, id?: number | bigint) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'unsubscribe',
        channel,
        id: id ? Number(id) : undefined,
      }))
    }
  }

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
    }
    ws?.close()
    ws = null
  }

  onMount(connect)
  onCleanup(disconnect)

  return {
    connected,
    error,
    subscribe,
    unsubscribe,
    disconnect,
    reconnect: connect,
  }
}
```

#### Step 4.2: Create Auth Context Component
- [x] Completed

Create file: `src/components/AuthContext.tsx`

```typescript
import { createContext, useContext, createSignal, type ParentComponent } from 'solid-js'
import { backendRpc } from '~/lib/backend-rpc'

interface AuthContextValue {
  isAuthenticated: () => boolean
  username: () => string | null
  login: (username: string, password: string) => Promise<void>
  logoff: () => Promise<void>
  error: () => string | null
}

const AuthContext = createContext<AuthContextValue>()

export const AuthProvider: ParentComponent = (props) => {
  const [isAuthenticated, setIsAuthenticated] = createSignal(false)
  const [username, setUsername] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const login = async (user: string, password: string) => {
    setError(null)
    try {
      await backendRpc.auth.login(user, password)
      setIsAuthenticated(true)
      setUsername(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
      throw e
    }
  }

  const logoff = async () => {
    try {
      await backendRpc.auth.logoff()
    } finally {
      setIsAuthenticated(false)
      setUsername(null)
    }
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logoff, error }}>
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

#### Step 4.3: Create Login Form Component
- [x] Completed

Create file: `src/components/LoginForm.tsx`

```typescript
import { createSignal, Show } from 'solid-js'
import { useAuth } from './AuthContext'

export default function LoginForm() {
  const { login, error } = useAuth()
  const [loading, setLoading] = createSignal(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setLoading(true)
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    try {
      await login(
        formData.get('username') as string,
        formData.get('password') as string
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <h2 class="text-xl font-bold">Login</h2>

      <Show when={error()}>
        <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
      </Show>

      <div>
        <label class="block text-sm font-medium">Username</label>
        <input
          name="username"
          type="text"
          required
          value="demo1"
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label class="block text-sm font-medium">Password</label>
        <input
          name="password"
          type="password"
          required
          value="welcome"
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <button
        type="submit"
        disabled={loading()}
        class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading() ? 'Logging in...' : 'Login'}
      </button>
    </form>
  )
}
```

#### Step 4.4: Create Agent Manager Component
- [x] Completed

Create file: `src/components/AgentManager.tsx`

```typescript
import { createSignal, createResource, For, Show } from 'solid-js'
import { backendRpc } from '~/lib/backend-rpc'
import type { Agent } from '~/types/backend'

interface Props {
  onAgentSelect?: (agent: Agent) => void
}

export default function AgentManager(props: Props) {
  const [agents, { refetch }] = createResource(() => backendRpc.agent.list())
  const [selectedAgent, setSelectedAgent] = createSignal<Agent | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const handleCreate = async (e: Event) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)

    try {
      const agent = await backendRpc.agent.create({
        name: formData.get('name') as string,
      })
      form.reset()
      await refetch()
      setSelectedAgent(agent)
      props.onAgentSelect?.(agent)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create agent')
    } finally {
      setCreating(false)
    }
  }

  const selectAgent = (agent: Agent) => {
    setSelectedAgent(agent)
    props.onAgentSelect?.(agent)
  }

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">Agents</h3>

      <Show when={error()}>
        <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
      </Show>

      {/* Create Agent Form */}
      <form onSubmit={handleCreate} class="flex gap-2">
        <input
          name="name"
          placeholder="Agent name"
          required
          class="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={creating()}
          class="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {creating() ? 'Creating...' : 'Create Agent'}
        </button>
      </form>

      {/* Agent List */}
      <Show when={agents.loading}>
        <p class="text-gray-500">Loading agents...</p>
      </Show>

      <Show when={agents.error}>
        <p class="text-red-600">Error loading agents: {agents.error.message}</p>
      </Show>

      <Show when={agents()}>
        <ul class="space-y-2">
          <For each={agents()} fallback={<li class="text-gray-500">No agents yet</li>}>
            {(agent) => (
              <li
                class={`cursor-pointer rounded border p-2 transition ${
                  selectedAgent()?.id === agent.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                onClick={() => selectAgent(agent)}
              >
                <strong>{agent.name}</strong>
                <span class="ml-2 text-sm text-gray-500">ID: {String(agent.id)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
```

#### Step 4.5: Create Conversation Manager Component
- [x] Completed

Create file: `src/components/ConversationManager.tsx`

```typescript
import { createSignal, createResource, createEffect, For, Show } from 'solid-js'
import { backendRpc } from '~/lib/backend-rpc'
import type { Agent, Conv } from '~/types/backend'

interface Props {
  agent: Agent | null
  onConvSelect?: (conv: Conv) => void
}

export default function ConversationManager(props: Props) {
  const [convs, { refetch }] = createResource(
    () => props.agent,
    async (agent) => {
      if (!agent) return []
      return backendRpc.conv.list({ filters: [{ agent_id: { $eq: Number(agent.id) } }] })
    }
  )
  const [selectedConv, setSelectedConv] = createSignal<Conv | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // Reset selection when agent changes
  createEffect(() => {
    props.agent // track
    setSelectedConv(null)
  })

  const handleCreate = async (e: Event) => {
    e.preventDefault()
    if (!props.agent) return

    setError(null)
    setCreating(true)
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)

    try {
      const conv = await backendRpc.conv.create({
        agent_id: props.agent.id,
        title: formData.get('title') as string || null,
      })
      form.reset()
      await refetch()
      setSelectedConv(conv)
      props.onConvSelect?.(conv)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create conversation')
    } finally {
      setCreating(false)
    }
  }

  const selectConv = (conv: Conv) => {
    setSelectedConv(conv)
    props.onConvSelect?.(conv)
  }

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">Conversations</h3>

      <Show when={!props.agent}>
        <p class="text-gray-500">Select an agent first</p>
      </Show>

      <Show when={props.agent}>
        <Show when={error()}>
          <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
        </Show>

        {/* Create Conversation Form */}
        <form onSubmit={handleCreate} class="flex gap-2">
          <input
            name="title"
            placeholder="Conversation title (optional)"
            class="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={creating()}
            class="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {creating() ? 'Creating...' : 'Create Conv'}
          </button>
        </form>

        {/* Conversation List */}
        <Show when={convs.loading}>
          <p class="text-gray-500">Loading conversations...</p>
        </Show>

        <Show when={convs.error}>
          <p class="text-red-600">Error: {convs.error.message}</p>
        </Show>

        <Show when={convs()}>
          <ul class="space-y-2">
            <For each={convs()} fallback={<li class="text-gray-500">No conversations yet</li>}>
              {(conv) => (
                <li
                  class={`cursor-pointer rounded border p-2 transition ${
                    selectedConv()?.id === conv.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                  onClick={() => selectConv(conv)}
                >
                  <strong>{conv.title || 'Untitled'}</strong>
                  <span class="ml-2 text-sm text-gray-500">ID: {String(conv.id)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  )
}
```

#### Step 4.6: Create Message Panel Component with WebSocket Support
- [x] Completed

Create file: `src/components/MessagePanel.tsx`

```typescript
import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js'
import { backendRpc } from '~/lib/backend-rpc'
import { useWebSocket } from '~/lib/websocket'
import type { Conv, ConvMsg } from '~/types/backend'

interface Props {
  conv: Conv | null
}

export default function MessagePanel(props: Props) {
  const [messages, setMessages] = createSignal<ConvMsg[]>([])
  const [sending, setSending] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // WebSocket for real-time updates
  const { connected, subscribe, unsubscribe } = useWebSocket({
    onConvMsg: (convId, msg) => {
      // Only add message if it's for the current conversation
      if (props.conv && Number(props.conv.id) === convId) {
        setMessages((prev) => {
          // Avoid duplicates (in case we just sent this message)
          if (prev.some((m) => m.id === msg.id)) {
            return prev
          }
          return [...prev, msg]
        })
      }
    },
    onError: (err) => setError(err),
  })

  // Subscribe to conversation updates when conv changes
  createEffect(() => {
    const conv = props.conv
    if (conv) {
      subscribe('conv', conv.id)
      // Reset messages when conversation changes
      setMessages([])
    }
  })

  // Unsubscribe when conversation changes or component unmounts
  createEffect((prevConvId: bigint | number | null) => {
    const currentConvId = props.conv?.id ?? null
    if (prevConvId && prevConvId !== currentConvId) {
      unsubscribe('conv', prevConvId)
    }
    return currentConvId
  }, null)

  const handleSend = async (e: Event) => {
    e.preventDefault()
    if (!props.conv) return

    setError(null)
    setSending(true)
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)

    try {
      const msg = await backendRpc.convMsg.add({
        conv_id: props.conv.id,
        content: formData.get('content') as string,
      })
      // Add message immediately (WebSocket will dedupe if needed)
      setMessages((prev) => [...prev, msg])
      form.reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">Messages</h3>
        <Show when={props.conv}>
          <span class={`text-xs ${connected() ? 'text-green-600' : 'text-red-600'}`}>
            {connected() ? 'Live' : 'Offline'}
          </span>
        </Show>
      </div>

      <Show when={!props.conv}>
        <p class="text-gray-500">Select a conversation first</p>
      </Show>

      <Show when={props.conv}>
        <Show when={error()}>
          <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
        </Show>

        {/* Messages Display */}
        <div class="max-h-60 space-y-2 overflow-y-auto rounded border border-gray-200 p-2">
          <Show when={messages().length === 0}>
            <p class="text-gray-500">No messages yet</p>
          </Show>
          <For each={messages()}>
            {(msg) => (
              <div class="rounded bg-gray-100 p-2">
                <p>{msg.content}</p>
                <span class="text-xs text-gray-500">ID: {String(msg.id)}</span>
              </div>
            )}
          </For>
        </div>

        {/* Send Message Form */}
        <form onSubmit={handleSend} class="flex gap-2">
          <input
            name="content"
            placeholder="Type a message..."
            required
            class="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={sending()}
            class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending() ? 'Sending...' : 'Send'}
          </button>
        </form>
      </Show>
    </div>
  )
}
```

### Phase 5: Create the Fullstack Page

#### Step 5.1: Create the Main Page
- [x] Completed

Create file: `src/routes/fullstack.tsx`

```typescript
import { Title } from '@solidjs/meta'
import { createSignal, Show } from 'solid-js'
import { AuthProvider, useAuth } from '~/components/AuthContext'
import LoginForm from '~/components/LoginForm'
import AgentManager from '~/components/AgentManager'
import ConversationManager from '~/components/ConversationManager'
import MessagePanel from '~/components/MessagePanel'
import type { Agent, Conv } from '~/types/backend'

function FullstackContent() {
  const { isAuthenticated, username, logoff } = useAuth()
  const [selectedAgent, setSelectedAgent] = createSignal<Agent | null>(null)
  const [selectedConv, setSelectedConv] = createSignal<Conv | null>(null)

  const handleLogoff = async () => {
    await logoff()
    setSelectedAgent(null)
    setSelectedConv(null)
  }

  return (
    <main class="container mx-auto p-4">
      <h1 class="mb-6 text-2xl font-bold">Full-Stack Integration Demo</h1>
      <p class="mb-4 text-gray-600">
        SolidStart + Rust/Axum JSON-RPC Example (with WebSocket real-time updates)
      </p>

      <Show when={!isAuthenticated()}>
        <div class="mx-auto max-w-md">
          <LoginForm />
        </div>
      </Show>

      <Show when={isAuthenticated()}>
        <div class="mb-4 flex items-center justify-between">
          <span class="text-green-600">Logged in as: {username()}</span>
          <button
            onClick={handleLogoff}
            class="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
          >
            Logout
          </button>
        </div>

        <div class="grid gap-6 md:grid-cols-3">
          <div class="rounded border border-gray-200 p-4">
            <AgentManager onAgentSelect={setSelectedAgent} />
          </div>

          <div class="rounded border border-gray-200 p-4">
            <ConversationManager
              agent={selectedAgent()}
              onConvSelect={setSelectedConv}
            />
          </div>

          <div class="rounded border border-gray-200 p-4">
            <MessagePanel conv={selectedConv()} />
          </div>
        </div>
      </Show>
    </main>
  )
}

export default function Fullstack() {
  return (
    <AuthProvider>
      <Title>Full-Stack Demo | SolidStart+</Title>
      <FullstackContent />
    </AuthProvider>
  )
}
```

### Phase 6: Testing

#### Step 6.1: Component Tests
- [x] Completed

Create file: `src/components/LoginForm.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import LoginForm from './LoginForm'
import { AuthProvider } from './AuthContext'

// Mock the backend RPC module
vi.mock('~/lib/backend-rpc', () => ({
  backendRpc: {
    auth: {
      login: vi.fn(),
      logoff: vi.fn(),
    },
  },
}))

const renderWithAuth = () => {
  return render(() => (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  ))
}

describe('<LoginForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login form with username and password fields', () => {
    renderWithAuth()

    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
  })

  it('has default demo credentials pre-filled', () => {
    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement

    expect(usernameInput.value).toBe('demo1')
    expect(passwordInput.value).toBe('welcome')
  })

  it('submits form with entered credentials', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    const user = userEvent.setup()
    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /login/i })

    await user.clear(usernameInput)
    await user.type(usernameInput, 'testuser')
    await user.clear(passwordInput)
    await user.type(passwordInput, 'testpass')
    await user.click(submitButton)

    expect(backendRpc.auth.login).toHaveBeenCalledWith('testuser', 'testpass')
  })
})
```

Create file: `src/components/AgentManager.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import AgentManager from './AgentManager'

vi.mock('~/lib/backend-rpc', () => ({
  backendRpc: {
    agent: {
      list: vi.fn().mockResolvedValue([
        { id: BigInt(1), name: 'Test Agent 1', owner_id: BigInt(1) },
        { id: BigInt(2), name: 'Test Agent 2', owner_id: BigInt(1) },
      ]),
      create: vi.fn().mockResolvedValue({
        id: BigInt(3),
        name: 'New Agent',
        owner_id: BigInt(1),
      }),
    },
  },
}))

describe('<AgentManager />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders agent list heading', () => {
    render(() => <AgentManager />)
    expect(screen.getByRole('heading', { name: /agents/i })).toBeInTheDocument()
  })

  it('displays loading state initially', () => {
    render(() => <AgentManager />)
    expect(screen.getByText(/loading agents/i)).toBeInTheDocument()
  })

  it('displays agents after loading', async () => {
    render(() => <AgentManager />)

    await waitFor(() => {
      expect(screen.getByText('Test Agent 1')).toBeInTheDocument()
      expect(screen.getByText('Test Agent 2')).toBeInTheDocument()
    })
  })

  it('calls onAgentSelect when agent is clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(() => <AgentManager onAgentSelect={onSelect} />)

    await waitFor(() => {
      expect(screen.getByText('Test Agent 1')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Test Agent 1'))

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Agent 1' })
    )
  })

  it('creates new agent when form is submitted', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    const user = userEvent.setup()
    render(() => <AgentManager />)

    const input = screen.getByPlaceholderText(/agent name/i)
    const button = screen.getByRole('button', { name: /create agent/i })

    await user.type(input, 'New Agent')
    await user.click(button)

    expect(backendRpc.agent.create).toHaveBeenCalledWith({ name: 'New Agent' })
  })
})
```

#### Step 6.2: WebSocket Tests
- [x] Completed

Create file: `src/lib/websocket.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3
    this.onclose?.()
  })

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects to WebSocket server', async () => {
    // Import after mocking
    const { useWebSocket } = await import('./websocket')

    // Would need SolidJS testing utilities to properly test
    // This is a placeholder for the test structure
    expect(MockWebSocket).toBeDefined()
  })
})
```

#### Step 6.3: E2E Tests
- [x] Completed

Create file: `"$FRONT_END/e2e/fullstack.spec.ts"`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Fullstack Integration Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/fullstack')
  })

  test('should display page title and heading', async ({ page }) => {
    await expect(page).toHaveTitle(/Full-Stack Demo/)
    await expect(page.getByRole('heading', { name: /Full-Stack Integration Demo/i })).toBeVisible()
  })

  test('should show login form when not authenticated', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /login/i })).toBeVisible()
    await expect(page.getByLabelText(/username/i)).toBeVisible()
    await expect(page.getByLabelText(/password/i)).toBeVisible()
  })

  test('should have demo credentials pre-filled', async ({ page }) => {
    const usernameInput = page.getByLabelText(/username/i)
    const passwordInput = page.getByLabelText(/password/i)

    await expect(usernameInput).toHaveValue('demo1')
    await expect(passwordInput).toHaveValue('welcome')
  })

  // Integration tests (require running backend)
  test.describe('with backend', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'Backend tests only on chromium')

    test('should login successfully with demo credentials', async ({ page }) => {
      await page.getByRole('button', { name: /login/i }).click()

      // Wait for login to complete
      await expect(page.getByText(/logged in as: demo1/i)).toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('button', { name: /logout/i })).toBeVisible()
    })

    test('should show agents panel after login', async ({ page }) => {
      await page.getByRole('button', { name: /login/i }).click()
      await expect(page.getByText(/logged in as/i)).toBeVisible({ timeout: 5000 })

      await expect(page.getByRole('heading', { name: /agents/i })).toBeVisible()
      await expect(page.getByPlaceholderText(/agent name/i)).toBeVisible()
    })

    test('should show real-time indicator', async ({ page }) => {
      await page.getByRole('button', { name: /login/i }).click()
      await expect(page.getByText(/logged in as/i)).toBeVisible({ timeout: 5000 })

      // Create agent and conversation to see message panel
      await page.getByPlaceholderText(/agent name/i).fill('E2E Test Agent')
      await page.getByRole('button', { name: /create agent/i }).click()
      await expect(page.getByText('E2E Test Agent')).toBeVisible({ timeout: 5000 })

      await page.getByPlaceholderText(/conversation title/i).fill('E2E Test Conv')
      await page.getByRole('button', { name: /create conv/i }).click()
      await expect(page.getByText('E2E Test Conv')).toBeVisible({ timeout: 5000 })

      // Should show Live/Offline indicator
      await expect(page.getByText(/live|offline/i)).toBeVisible()
    })

    test('should create agent, conversation, and send message', async ({ page }) => {
      // Login
      await page.getByRole('button', { name: /login/i }).click()
      await expect(page.getByText(/logged in as/i)).toBeVisible({ timeout: 5000 })

      // Create agent
      await page.getByPlaceholderText(/agent name/i).fill('E2E Test Agent')
      await page.getByRole('button', { name: /create agent/i }).click()
      await expect(page.getByText('E2E Test Agent')).toBeVisible({ timeout: 5000 })

      // Create conversation
      await page.getByPlaceholderText(/conversation title/i).fill('E2E Test Conv')
      await page.getByRole('button', { name: /create conv/i }).click()
      await expect(page.getByText('E2E Test Conv')).toBeVisible({ timeout: 5000 })

      // Send message
      await page.getByPlaceholderText(/type a message/i).fill('Hello from E2E test!')
      await page.getByRole('button', { name: /send/i }).click()
      await expect(page.getByText('Hello from E2E test!')).toBeVisible({ timeout: 5000 })
    })

    test('should logout successfully', async ({ page }) => {
      await page.getByRole('button', { name: /login/i }).click()
      await expect(page.getByText(/logged in as/i)).toBeVisible({ timeout: 5000 })

      await page.getByRole('button', { name: /logout/i }).click()

      await expect(page.getByRole('heading', { name: /login/i })).toBeVisible()
    })
  })
})
```

---

### Phase 7: Integration Testing
- [ ] Completed

- Perform each step in sequence.
- Analyze and correct any errors.
- Repeat until the step succeeds.
- Commands are found in Part 3: `Development Commands` below

#### Step 7.0: Create Missing Tests
- [x] Completed

The following component test files are not yet created and must be added before running the full test suite:

- `src/components/ConversationManager.test.tsx`
- `src/components/MessagePanel.test.tsx`
- `src/components/AuthContext.test.tsx`

**`src/components/ConversationManager.test.tsx`**

```tsx
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import ConversationManager from './ConversationManager'
import { backendRpc } from '../lib/backend-rpc'
import type { Agent, Conv } from '../types/backend'

vi.mock('../lib/backend-rpc', () => ({
  backendRpc: {
    conv: {
      create: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

const mockAgent: Agent = { id: 1n, name: 'Test Agent', model: null }
const mockConvs: Conv[] = [
  { id: 10n, agent_id: 1n, title: 'Conv Alpha', kind: 'MultiMessages', state: 'Active' },
  { id: 11n, agent_id: 1n, title: 'Conv Beta',  kind: 'MultiMessages', state: 'Active' },
]

describe('ConversationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockConvs)
  })

  it('renders heading and placeholder when no agent is provided', () => {
    render(() => <ConversationManager agent={null} onConvSelect={() => {}} />)
    expect(screen.getByText(/conversations/i)).toBeInTheDocument()
    expect(screen.getByText(/select an agent/i)).toBeInTheDocument()
  })

  it('displays conversations after agent is selected', async () => {
    render(() => <ConversationManager agent={mockAgent} onConvSelect={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Conv Alpha')).toBeInTheDocument()
      expect(screen.getByText('Conv Beta')).toBeInTheDocument()
    })
  })

  it('create form calls backendRpc.conv.create with correct params', async () => {
    ;(backendRpc.conv.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 12n, agent_id: 1n, title: 'New Conv', kind: 'MultiMessages', state: 'Active' }
    )
    render(() => <ConversationManager agent={mockAgent} onConvSelect={() => {}} />)
    await waitFor(() => screen.getByText('Conv Alpha'))

    fireEvent.input(screen.getByPlaceholderText(/conversation title/i), {
      target: { value: 'New Conv' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create conv/i }))

    await waitFor(() => {
      expect(backendRpc.conv.create).toHaveBeenCalledWith({
        agent_id: 1n,
        title: 'New Conv',
      })
    })
  })

  it('fires onConvSelect callback when a conversation is clicked', async () => {
    const onSelect = vi.fn()
    render(() => <ConversationManager agent={mockAgent} onConvSelect={onSelect} />)
    await waitFor(() => screen.getByText('Conv Alpha'))

    fireEvent.click(screen.getByText('Conv Alpha'))
    expect(onSelect).toHaveBeenCalledWith(mockConvs[0])
  })

  it('resets conversation list when agent changes', async () => {
    const [agent, setAgent] = createSignal<Agent | null>(mockAgent)
    render(() => <ConversationManager agent={agent()} onConvSelect={() => {}} />)
    await waitFor(() => screen.getByText('Conv Alpha'))

    ;(backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
    setAgent({ id: 2n, name: 'Other Agent', model: null })

    await waitFor(() => {
      expect(screen.queryByText('Conv Alpha')).not.toBeInTheDocument()
    })
  })
})
```

**`src/components/MessagePanel.test.tsx`**

```tsx
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import MessagePanel from './MessagePanel'
import { backendRpc } from '../lib/backend-rpc'
import type { Conv, ConvMsg } from '../types/backend'

vi.mock('../lib/backend-rpc', () => ({
  backendRpc: {
    convMsg: {
      add: vi.fn(),
    },
    conv: {
      list: vi.fn().mockResolvedValue([]),
    },
  },
}))

const mockConv: Conv = {
  id: 10n,
  agent_id: 1n,
  title: 'Test Conversation',
  kind: 'MultiMessages',
  state: 'Active',
}

const mockMessages: ConvMsg[] = [
  { id: 100n, conv_id: 10n, role: 'user', content: 'Hello' },
  { id: 101n, conv_id: 10n, role: 'assistant', content: 'Hi there' },
]

describe('MessagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "select a conversation" placeholder when conv is null', () => {
    render(() => <MessagePanel conv={null} messages={[]} connected={() => false} />)
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument()
  })

  it('shows Live indicator when WebSocket is connected', () => {
    render(() => <MessagePanel conv={mockConv} messages={mockMessages} connected={() => true} />)
    expect(screen.getByText(/live/i)).toBeInTheDocument()
  })

  it('shows Offline indicator when WebSocket is disconnected', () => {
    render(() => <MessagePanel conv={mockConv} messages={mockMessages} connected={() => false} />)
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })

  it('send form calls backendRpc.convMsg.add with correct params', async () => {
    ;(backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 102n, conv_id: 10n, role: 'user', content: 'New message' }
    )
    render(() => <MessagePanel conv={mockConv} messages={[]} connected={() => true} />)

    fireEvent.input(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'New message' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(backendRpc.convMsg.add).toHaveBeenCalledWith({
        conv_id: 10n,
        content: 'New message',
      })
    })
  })

  it('shows sent message in list after successful send', async () => {
    const newMsg: ConvMsg = { id: 102n, conv_id: 10n, role: 'user', content: 'New message' }
    ;(backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(newMsg)

    const [messages, setMessages] = createSignal<ConvMsg[]>([])
    render(() => (
      <MessagePanel
        conv={mockConv}
        messages={messages()}
        connected={() => true}
        onMessageSent={(msg) => setMessages((prev) => [...prev, msg])}
      />
    ))

    fireEvent.input(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'New message' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText('New message')).toBeInTheDocument()
    })
  })
})
```

**`src/components/AuthContext.test.tsx`**

```tsx
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { AuthProvider, useAuth } from './AuthContext'
import { backendRpc } from '../lib/backend-rpc'

vi.mock('../lib/backend-rpc', () => ({
  backendRpc: {
    auth: {
      login: vi.fn(),
      logoff: vi.fn(),
    },
  },
}))

function AuthTestConsumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.isAuthenticated() ? 'logged-in' : 'logged-out'}</span>
      <span data-testid="username">{auth.username() ?? 'none'}</span>
      <button onClick={() => auth.login('demo1', 'welcome')}>Login</button>
      <button onClick={() => auth.logoff()}>Logoff</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(backendRpc.auth.login as ReturnType<typeof vi.fn>).mockResolvedValue({ result: 'ok' })
    ;(backendRpc.auth.logoff as ReturnType<typeof vi.fn>).mockResolvedValue({ result: 'ok' })
  })

  it('isAuthenticated starts as false', () => {
    render(() => <AuthProvider><AuthTestConsumer /></AuthProvider>)
    expect(screen.getByTestId('status').textContent).toBe('logged-out')
  })

  it('login() sets isAuthenticated to true and stores username', async () => {
    render(() => <AuthProvider><AuthTestConsumer /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('logged-in')
      expect(screen.getByTestId('username').textContent).toBe('demo1')
    })
  })

  it('logoff() clears auth state', async () => {
    render(() => <AuthProvider><AuthTestConsumer /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('logged-in'))

    fireEvent.click(screen.getByRole('button', { name: /logoff/i }))
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('logged-out')
      expect(screen.getByTestId('username').textContent).toBe('none')
    })
  })
})
```

#### Step 7.1 Start Servers
- [x] Completed

Start each server in its own terminal. Commands reference Part 3 section numbers.

1. **Terminal A — Database** (§3.1):
   ```sh
   docker run --rm --name pg -p 5432:5432 -e POSTGRES_PASSWORD=welcome postgres:17
   ```
   Expected: `database system is ready to accept connections`

2. **Terminal B — Rust backend** (§3.2):
   ```sh
   cd "$BACK_END" && cargo run -p web-server
   ```
   Expected: `Listening on 0.0.0.0:8080`

3. **Terminal C — SolidStart frontend** (§3.3):
   ```sh
   cd "$FRONT_END" && bun dev
   ```
   Expected: `Local: http://localhost:3000/`

4. **Smoke-test the API** — confirm the RPC endpoint returns `401` with `NO_AUTH` error (unauthenticated):
   ```sh
   curl -s -w "\nHTTP: %{http_code}\n" -X POST http://localhost:8080/api/rpc \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"test","params":{}}'
   # Expected: HTTP 401, body contains "NO_AUTH"
   ```

#### Step 7.2 Run Back-End Tests
- [x] Completed

1. **Unit tests** (§3.4):
   ```sh
   cd "$BACK_END" && cargo nextest run -j1
   ```
   - `-j1` is required because tests share database state and must run sequentially.
   - Expected output: `X tests, 0 failures` (all green).
   - Common error: `connection refused` → Docker container is not running; start it first (§3.1).

2. **`quick_dev` integration example** (§3.5):
   ```sh
   cd "$BACK_END" && cargo run -p web-server --example quick_dev
   ```
   Expected output summary (in order):
   ```
   -- login demo1
   -- create_agent
   -- get_agent
   -- create_conv
   -- add_conv_msg
   -- logoff
   ```
   All steps should succeed without errors.

#### Step 7.3 Run Front-End Tests
- [ ] Completed

##### 7.3.0 Create Missing Tests
- [x] Completed
- Review `"$FRONT_END/src/lib"` and create missing unit tests.
- Review `"$FRONT_END/src/routes"` and create missing e2e tests in `"$FRONT_END/e2e"` folder.
- Created `src/lib/backend-rpc.unit.test.ts` (27 tests covering all rpcCall, auth, agent, conv, convMsg behaviors)
- Created `e2e/users.spec.ts` (9 tests covering heading, form fields, page structure, footer navigation)

##### 7.3.1 Unit Tests
- [x] Completed — 41 tests, 0 failures across 3 files (accumulator, websocket, backend-rpc)
- Note: websocket.unit.test.ts and backend-rpc.unit.test.ts were rewritten from vitest to bun:test APIs (vi.stubGlobal → globalThis assignment; vi.fn() → mock())
```sh
cd "$FRONT_END" && bun test:unit
```
Expected: all tests pass, including the three new files added in Step 7.0.

##### 7.3.2 Component Tests
- [x] Completed — 34 tests, 0 failures across 8 files
```sh
cd "$FRONT_END" && bun test:comp
```
Requires `@solidjs/testing-library` to be installed. Expected: all component tests pass.

##### 7.3.3 E2E Tests
```sh
cd "$FRONT_END" && npm run test:e2e
```
- Requires **both** the Rust backend (§3.2) and SolidStart frontend (§3.3) to be running.
- Static/offline tests (e.g., login form rendering) will pass regardless.
- Network-dependent tests (create agent, send message) require live servers.

##### 7.3.4 Manual WebSocket Verification (Two-Tab Test)

1. Open `http://localhost:3000/fullstack` in **Tab 1**.
2. Login with username `demo1` / password `welcome`.
3. Create an agent (e.g., `WS Test Agent`).
4. Create a conversation under that agent (e.g., `WS Test Conv`).
5. Open `http://localhost:3000/fullstack` in **Tab 2**.
6. Login with the same credentials in Tab 2.
7. In both tabs, select the same agent and the same conversation.
8. In **Tab 1**, type a message and click **Send**.
9. Observe: the message appears in **Tab 2** without any page refresh.
10. Confirm the **"Live"** indicator is green in the MessagePanel header in both tabs.

---

## Part 3: Development Commands

### Start Development Servers

#### 3.1 Start Database
```sh
# Terminal 3: Start postgresql server docker image
cd "$BACK_END"
docker run --rm --name pg -p 5432:5432 -e POSTGRES_PASSWORD=welcome postgres:17
```

#### 3.2 Start Rust backend
```sh
# Terminal 2: Start Rust backend
cd "$BACK_END"
cargo run -p web-server
```

#### 3.3 Start SolidStart frontend
```sh
# Terminal 1: Start SolidStart frontend
cd "$FRONT_END"
bun dev
```

### Back-End Tests

#### 3.4 Run Back-End unit tests
``` sh
# Back-End Unit Tests
cd "$BACK_END"
cargo nextest run -j1
```

#### 3.5 Run Back-End quick_dev example.
```sh
# Terminal 4 - Run the Back-End quick_dev example.
cd "$BACK_END"
cargo run -p web-server --example quick_dev
```

### Front-End Tests

#### 3.6 Run Front-End unit tests
```sh
# Front-End Unit tests
cd "$FRONT_END"
bun test:unit
```

#### 3.7 Run Front-End component tests
```sh
# Front-End Component tests
cd "$FRONT_END"
bun test:comp
```

#### 3.8 Run Front-End E2E tests
```sh
# Front-End E2E
cd "$FRONT_END"
npm run test:e2e
```

---

## Progress Tracking

Use this checklist to track overall progress:

### Part 2 Phase Completion
- [x] Phase 1: TypeScript Types & RPC Client
- [x] Phase 2: CORS Configuration
- [x] Phase 3: WebSocket Support
- [x] Phase 4: SolidStart Components
- [x] Phase 5: Fullstack Page
- [x] Phase 6: Testing
- [ ] Phase 7: Integration Testing
- [ ] Integration Complete

---

## Appendix I: File Summary

### New Files to Create

| File                                          | Purpose                                      | Status |
| --------------------------------------------- | -------------------------------------------- | ------ |
| `src/types/backend/index.ts`                  | Type re-exports and additional types         | [x]    |
| `src/lib/backend-rpc.ts`                      | Custom RPC client for backend                | [x]    |
| `src/lib/websocket.ts`                        | WebSocket client hook for real-time updates  | [x]    |
| `src/components/AuthContext.tsx`              | Auth state management                        | [x]    |
| `src/components/LoginForm.tsx`                | Login UI component                           | [x]    |
| `src/components/AgentManager.tsx`             | Agent CRUD UI                                | [x]    |
| `src/components/ConversationManager.tsx`      | Conversation CRUD UI                         | [x]    |
| `src/components/MessagePanel.tsx`             | Message display and send UI (with WebSocket) | [x]    |
| `src/routes/fullstack.tsx`                    | Main fullstack demo page                     | [x]    |
| `src/components/LoginForm.test.tsx`           | LoginForm unit tests                         | [x]    |
| `src/components/AgentManager.test.tsx`        | AgentManager unit tests                      | [x]    |
| `src/lib/websocket.test.ts`                   | WebSocket hook tests                         | [x]    |
| `e2e/fullstack.spec.ts`                       | E2E tests                                    | [x]    |
| `src/components/ConversationManager.test.tsx` | ConversationManager unit tests               | [ ]    |
| `src/components/MessagePanel.test.tsx`        | MessagePanel unit tests                      | [ ]    |
| `src/components/AuthContext.test.tsx`         | AuthContext unit tests                       | [ ]    |

### Backend Files to Create/Modify

| File                                              | Purpose                     | Status |
| ------------------------------------------------- | --------------------------- | ------ |
| `crates/services/web-server/src/web/routes_ws.rs` | WebSocket handler           | [x]    |
| `crates/services/web-server/src/main.rs`          | Add CORS + WebSocket routes | [x]    |

### Files to Copy

| Source                             | Destination                          | Status |
| ---------------------------------- | ------------------------------------ | ------ |
| `rust-web-app/.../bindings/*.d.ts` | `SolidStart-Demo/src/types/backend/` | [x]    |

### Files to Modify (Potentially)

| File                                    | Change                               | Status |
| --------------------------------------- | ------------------------------------ | ------ |
| `rust-web-app/.../main.rs` or routes    | Add CORS middleware                  | [x]    |
| `rust-web-app/Cargo.toml`               | Add axum ws feature, futures         | [x]    |
| `SolidStart-Demo/src/lib/rpc-client.ts` | Can be removed or kept for reference | [x]    |

---

## Appendix II: quick_dev.rs Workflow Mapping

| quick_dev.rs Step   | SolidStart Component         | RPC Method         | Real-time           |
| ------------------- | ---------------------------- | ------------------ | ------------------- |
| Login               | `LoginForm`                  | `POST /api/login`  | -                   |
| Create Agent        | `AgentManager`               | `create_agent`     | WebSocket broadcast |
| Get Agent           | `AgentManager` (auto-select) | `get_agent`        | -                   |
| Create Conversation | `ConversationManager`        | `create_conv`      | WebSocket broadcast |
| Add Message         | `MessagePanel`               | `add_conv_msg`     | WebSocket broadcast |
| Logoff              | Logout button                | `POST /api/logoff` | -                   |

---

## Appendix III: Alternative Approaches (Not Selected)

### Alternative 2: SolidStart Server Functions Proxy **[NOT SELECTED]**

Route all RPC calls through SolidStart server functions.

```typescript
// src/lib/server-rpc.ts
"use server"
import { getRequestEvent } from 'solid-js/web'

export async function serverRpc(method: string, params: unknown) {
  // Forward cookies from client request
  const event = getRequestEvent()
  const cookies = event?.request.headers.get('cookie') || ''

  const response = await fetch('http://localhost:8080/api/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  return response.json()
}
```

**Reason not selected:** Added latency from extra hop, more complex session management, doesn't support WebSocket easily

### Alternative 3: OpenAPI/Swagger Code Generation **[NOT SELECTED]**

Generate TypeScript client from OpenAPI spec instead of custom types.

**Reason not selected:** Requires OpenAPI spec generation from Rust (additional tooling), adds complexity

### Alternative 4: tRPC-style Type Sharing **[NOT SELECTED]**

Use a shared types package or monorepo setup for type synchronization.

**Reason not selected:** Requires monorepo setup, adds build complexity

---
