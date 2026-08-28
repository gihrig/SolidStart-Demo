import { vi } from "vite-plus/test";
import type { Agent, Conv, ConvState } from "~/types/backend";
import type { ConversationWorkspace } from "./conversationWorkspace";

// Test-only stubs and fixtures for the Conversations workspace and its
// presentational managers. Kept out of `.test` files so every spec shares them.

/** A minimal valid `Agent` fixture. */
export const makeAgent = (id: number, name: string): Agent => ({
  id,
  owner_id: 1,
  name,
  ai_provider: "openai",
  ai_model: "gpt-4",
  cid: 1,
  ctime: "2024-01-01T00:00:00Z",
  mid: 1,
  mtime: "2024-01-01T00:00:00Z",
});

/** A minimal valid `Conv` fixture (defaults to agent 1, Active state). */
export const makeConv = (
  id: number,
  title: string,
  agentId = 1,
  state: ConvState = "Active",
): Conv => ({
  id,
  agent_id: agentId,
  owner_id: 1,
  title,
  kind: "OwnerOnly",
  state,
  cid: 1,
  ctime: "2024-01-01T00:00:00Z",
  mid: 1,
  mtime: "2024-01-01T00:00:00Z",
});

/** A workspace whose actions are `vi.fn()` spies; override any slice per test. */
export function makeWorkspaceStub(
  over: Partial<ConversationWorkspace> = {},
): ConversationWorkspace {
  return {
    agents: () => [],
    agentsLoading: () => false,
    agentsError: () => null,
    selectedAgent: () => null,
    selectAgent: vi.fn(),
    createAgent: vi.fn().mockResolvedValue(true),
    creatingAgent: () => false,
    createAgentError: () => null,
    convs: () => [],
    convsLoading: () => false,
    convsError: () => null,
    selectedConv: () => null,
    selectConv: vi.fn(),
    createConv: vi.fn().mockResolvedValue(true),
    creatingConv: () => false,
    createConvError: () => null,
    archiveConv: vi.fn().mockResolvedValue(true),
    unarchiveConv: vi.fn().mockResolvedValue(true),
    isArchiving: () => false,
    archiveError: () => null,
    showArchived: () => false,
    toggleShowArchived: vi.fn(),
    ...over,
  };
}
