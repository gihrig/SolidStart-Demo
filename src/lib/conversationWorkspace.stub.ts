import { vi } from "vite-plus/test";
import type { Resource } from "solid-js";
import type { Agent, Conv } from "~/types/backend";
import type { ConversationWorkspace } from "./conversationWorkspace";

// Test-only stubs and fixtures for the Conversations workspace and its
// presentational managers. Kept out of `.test` files so every spec shares them.

/** A minimal valid `Agent` fixture. */
export const makeAgent = (id: number, name: string): Agent => ({
  id: BigInt(id),
  owner_id: BigInt(1),
  name,
  ai_provider: "openai",
  ai_model: "gpt-4",
  cid: BigInt(1),
  ctime: "2024-01-01T00:00:00Z",
  mid: BigInt(1),
  mtime: "2024-01-01T00:00:00Z",
});

/** A minimal valid `Conv` fixture (defaults to agent 1). */
export const makeConv = (id: number, title: string, agentId = 1): Conv => ({
  id: BigInt(id),
  agent_id: BigInt(agentId),
  owner_id: BigInt(1),
  title,
  kind: "OwnerOnly",
  state: "Active",
  cid: BigInt(1),
  ctime: "2024-01-01T00:00:00Z",
  mid: BigInt(1),
  mtime: "2024-01-01T00:00:00Z",
});

/** A resolved resource exposing the surface the managers read: `()`, `.loading`, `.error`. */
export function readyResource<T>(value: T): Resource<T> {
  return Object.assign(() => value, {
    loading: false,
    error: undefined,
    latest: value,
    state: "ready" as const,
  }) as unknown as Resource<T>;
}

/** A still-loading resource. */
export function loadingResource<T>(): Resource<T> {
  return Object.assign(() => undefined, {
    loading: true,
    error: undefined,
    latest: undefined,
    state: "pending" as const,
  }) as unknown as Resource<T>;
}

/** A workspace whose actions are `vi.fn()` spies; override any slice per test. */
export function makeWorkspaceStub(
  over: Partial<ConversationWorkspace> = {},
): ConversationWorkspace {
  return {
    agents: readyResource<Agent[]>([]),
    selectedAgent: () => null,
    selectAgent: vi.fn(),
    createAgent: vi.fn().mockResolvedValue(true),
    creatingAgent: () => false,
    agentError: () => null,
    convs: readyResource<Conv[]>([]),
    selectedConv: () => null,
    selectConv: vi.fn(),
    createConv: vi.fn().mockResolvedValue(true),
    creatingConv: () => false,
    convError: () => null,
    reset: vi.fn(),
    ...over,
  };
}
