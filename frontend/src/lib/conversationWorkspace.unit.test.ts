import { describe, it, expect, vi } from "vite-plus/test";
import { createRoot } from "solid-js";
import { makeAgent, makeConv } from "./conversationWorkspace.stub";
import { createConversationWorkspace } from "./conversationWorkspace";
import type { WorkspaceRpcClient } from "./backend-rpc";
import type { MessageFeedFactory, MessageFeedOptions } from "~/lib/websocket";

// The workspace is the seam: it owns selection + the create→refetch→select dance
// + live list propagation, so the flow is tested here once, not through three
// route renders. Both data sources are injected as in-memory adapters — the test
// stands at the seam instead of mocking the backend-rpc module.

// Let pending resource fetches / refetches settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

// In-memory adapter for the agent+conv RPC slice; a test sets results and
// asserts calls, standing at the WorkspaceRpcClient interface.
function createFakeRpc() {
  const agentList = vi.fn().mockResolvedValue([]);
  const agentCreate = vi.fn();
  const convList = vi.fn().mockResolvedValue([]);
  const convCreate = vi.fn();
  const rpc: WorkspaceRpcClient = {
    agent: { list: agentList, create: agentCreate },
    conv: { list: convList, create: convCreate },
  };
  return { rpc, agentList, agentCreate, convList, convCreate };
}

// In-memory feed adapter: lets a test emit list-feed pokes through the port.
function createFakeFeed() {
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  let opts: MessageFeedOptions = {};
  const factory: MessageFeedFactory = (options) => {
    opts = options;
    return { connected: () => false, subscribe, unsubscribe };
  };
  return {
    factory,
    subscribe,
    unsubscribe,
    emitAgentUpdate: () => opts.onAgentUpdate?.(),
    emitConvUpdate: () => opts.onConvUpdate?.(),
  };
}

describe("createConversationWorkspace", () => {
  describe("selection", () => {
    it("starts with nothing selected", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        expect(ws.selectedAgent()).toBeNull();
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });

    it("selectAgent makes it the selected agent", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        const ada = makeAgent(1, "Ada");
        ws.selectAgent(ada);
        expect(ws.selectedAgent()).toEqual(ada);
        dispose();
      });
    });

    it("selectConv makes it the selected conversation", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        const conv = makeConv(10, "Hello");
        ws.selectConv(conv);
        expect(ws.selectedConv()).toEqual(conv);
        dispose();
      });
    });

    it("switching to a different agent clears the conversation selection", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        ws.selectConv(makeConv(10, "Hello"));
        expect(ws.selectedConv()).not.toBeNull();
        ws.selectAgent(makeAgent(2, "Bob"));
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });

    it("re-selecting the open agent collapses the selection to none", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        const ada = makeAgent(1, "Ada");
        ws.selectAgent(ada);
        ws.selectConv(makeConv(10, "Hello"));
        ws.selectAgent(makeAgent(1, "Ada")); // same id, fresh object → collapse
        expect(ws.selectedAgent()).toBeNull();
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });
  });

  describe("alphabetical sorting", () => {
    it("exposes agents sorted A→Z by name, case-insensitive", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.agentList.mockResolvedValue([
        makeAgent(1, "bob"),
        makeAgent(2, "Ada"),
        makeAgent(3, "Cara"),
      ]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        await flush();
        expect(ws.agents()?.map((a) => a.name)).toEqual(["Ada", "bob", "Cara"]);
        dispose();
      });
    });

    it("exposes conversations sorted A→Z by displayed title, empty titles as 'Untitled'", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convList.mockResolvedValue([
        makeConv(10, "banana"),
        makeConv(11, ""), // → "Untitled", sorts after "banana"
        makeConv(12, "Apple"),
      ]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        expect(ws.convs()?.map((c) => c.title)).toEqual(["Apple", "banana", ""]);
        dispose();
      });
    });

    it("orders equal labels deterministically by id (several 'Untitled')", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convList.mockResolvedValue([makeConv(30, ""), makeConv(10, ""), makeConv(20, "")]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        expect(ws.convs()?.map((c) => c.id)).toEqual([10, 20, 30]);
        dispose();
      });
    });
  });

  describe("createAgent (the create dance)", () => {
    it("creates, refetches, and selects the new agent", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      const created = makeAgent(3, "New Agent");
      rpc.agentCreate.mockResolvedValue(created);
      rpc.agentList.mockResolvedValue([created]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        const ok = await ws.createAgent("New Agent");
        expect(ok).toBe(true);
        expect(rpc.agentCreate).toHaveBeenCalledWith({ name: "New Agent" });
        expect(ws.selectedAgent()).toEqual(created);
        await flush();
        expect(ws.agents()).toEqual([created]); // list refetched after create
        expect(ws.creatingAgent()).toBe(false);
        expect(ws.createAgentError()).toBeNull();
        dispose();
      });
    });

    it("surfaces the error and keeps the selection on failure", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.agentCreate.mockRejectedValue(new Error("create failed"));

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        const ok = await ws.createAgent("Doomed");
        expect(ok).toBe(false);
        expect(ws.createAgentError()).toBe("create failed");
        expect(ws.selectedAgent()).toBeNull();
        expect(ws.creatingAgent()).toBe(false);
        dispose();
      });
    });
  });

  describe("createConv (the create dance)", () => {
    it("is a no-op without a selected agent", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        const ok = await ws.createConv("Orphan");
        expect(ok).toBe(false);
        expect(rpc.convCreate).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("creates under the selected agent, refetches, and selects it", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      const ada = makeAgent(1, "Ada");
      const conv = makeConv(10, "Hello");
      rpc.convCreate.mockResolvedValue(conv);
      rpc.convList.mockResolvedValue([conv]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(ada);
        const ok = await ws.createConv("Hello");
        expect(ok).toBe(true);
        expect(rpc.convCreate).toHaveBeenCalledWith({ agent_id: ada.id, title: "Hello" });
        expect(ws.selectedConv()).toEqual(conv);
        expect(ws.creatingConv()).toBe(false);
        dispose();
      });
    });

    it("surfaces the error on failure", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convCreate.mockRejectedValue(new Error("conv failed"));

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        const ok = await ws.createConv("Doomed");
        expect(ok).toBe(false);
        expect(ws.createConvError()).toBe("conv failed");
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });
  });

  describe("live list propagation (#85)", () => {
    it("subscribes to the agents and convs list feeds", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      await createRoot(async (dispose) => {
        createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        expect(feed.subscribe).toHaveBeenCalledWith("agents");
        expect(feed.subscribe).toHaveBeenCalledWith("convs");
        dispose();
      });
    });

    it("refetches the agent list when an agent_update poke arrives", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.agentList
        .mockResolvedValueOnce([makeAgent(1, "Ada")])
        .mockResolvedValueOnce([makeAgent(1, "Ada"), makeAgent(2, "Bob")]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        await flush();
        expect(ws.agents().map((a) => a.name)).toEqual(["Ada"]);
        feed.emitAgentUpdate();
        await flush();
        expect(ws.agents().map((a) => a.name)).toEqual(["Ada", "Bob"]);
        dispose();
      });
    });

    it("refetches the conversation list when a conv_update poke arrives", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convList
        .mockResolvedValueOnce([makeConv(10, "Apple")])
        .mockResolvedValueOnce([makeConv(10, "Apple"), makeConv(11, "Berry")]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        expect(ws.convs().map((c) => c.title)).toEqual(["Apple"]);
        feed.emitConvUpdate();
        await flush();
        expect(ws.convs().map((c) => c.title)).toEqual(["Apple", "Berry"]);
        dispose();
      });
    });
  });
});
