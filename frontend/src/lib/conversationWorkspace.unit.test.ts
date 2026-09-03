import { describe, it, expect, vi } from "vite-plus/test";
import { createRoot } from "solid-js";
import { makeAgent, makeConv } from "./conversationWorkspace.stub";
import { createConversationWorkspace } from "./conversationWorkspace";
import type { WorkspaceRpcClient } from "./backend-rpc";
import type { MessageFeedFactory, MessageFeedOptions } from "~/lib/websocket";
import { Channel } from "~/lib/channel";

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
  const convUpdate = vi.fn();
  const rpc: WorkspaceRpcClient = {
    agent: { list: agentList, create: agentCreate },
    conv: { list: convList, create: convCreate, update: convUpdate },
  };
  return { rpc, agentList, agentCreate, convList, convCreate, convUpdate };
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
        expect(feed.subscribe).toHaveBeenCalledWith(Channel.agents);
        expect(feed.subscribe).toHaveBeenCalledWith(Channel.convs);
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

    it("drops a selected agent an agent_update poke removed", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      const ada = makeAgent(1, "Ada");
      // First load has Ada; after the poke (Ada deleted elsewhere) the list is empty.
      rpc.agentList.mockResolvedValueOnce([ada]).mockResolvedValueOnce([]);
      // Ada's conv list holds the selected conv, so the selection is legitimately
      // in the list until the agent-delete poke clears it.
      rpc.convList.mockResolvedValue([makeConv(10, "Hello")]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        await flush();
        ws.selectAgent(ada);
        await flush();
        ws.selectConv(makeConv(10, "Hello"));
        await flush();
        expect(ws.selectedAgent()).toEqual(ada);
        expect(ws.selectedConv()).not.toBeNull();

        feed.emitAgentUpdate(); // Ada deleted in another client
        await flush();

        // The row is gone from the list and the stale selection is dropped, so the
        // navigator hides its convs (gated on selectedAgent) and createConv can't
        // fire against the dead Agent id.
        expect(ws.agents()).toEqual([]);
        expect(ws.selectedAgent()).toBeNull();
        expect(ws.selectedConv()).toBeNull();
        expect(await ws.createConv("blocked")).toBe(false);
        expect(rpc.convCreate).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("keeps the selected agent when the poke leaves it in the list", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      const ada = makeAgent(1, "Ada");
      // A poke that adds Bob but keeps Ada must not disturb Ada's selection.
      rpc.agentList.mockResolvedValueOnce([ada]).mockResolvedValueOnce([ada, makeAgent(2, "Bob")]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        await flush();
        ws.selectAgent(ada);
        await flush();

        feed.emitAgentUpdate();
        await flush();

        expect(ws.selectedAgent()).toEqual(ada);
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

  describe("archive (#46)", () => {
    // The back-end (#25) owns Archived filtering; the fake mirrors it: a default
    // request returns the working set, `includeArchived` returns both states.
    const bothStates = () => [
      makeConv(10, "Active one", 1, "Active"),
      makeConv(11, "Archived one", 1, "Archived"),
    ];
    const withArchiveModel = (rpc: ReturnType<typeof createFakeRpc>) => {
      let archived = false;
      rpc.convUpdate.mockImplementation((id: number, data: { state: "Active" | "Archived" }) => {
        archived = data.state === "Archived";
        return Promise.resolve(makeConv(id, "Open", 1, data.state));
      });
      rpc.convList.mockImplementation((_id: number, opts?: { includeArchived?: boolean }) => {
        const conv = makeConv(10, "Open", 1, archived ? "Archived" : "Active");
        if (opts?.includeArchived) return Promise.resolve([conv]);
        return Promise.resolve(archived ? [] : [conv]);
      });
    };

    it("requests the working set by default, so Archived are hidden", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convList.mockImplementation((_id: number, opts?: { includeArchived?: boolean }) =>
        Promise.resolve(opts?.includeArchived ? bothStates() : [makeConv(10, "Active one")]),
      );

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        expect(ws.showArchived()).toBe(false);
        expect(ws.convs().map((c) => c.title)).toEqual(["Active one"]);
        expect(rpc.convList).toHaveBeenLastCalledWith(1, { includeArchived: false });
        dispose();
      });
    });

    it("refetches including Archived when showArchived is toggled on, and back off", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convList.mockImplementation((_id: number, opts?: { includeArchived?: boolean }) =>
        Promise.resolve(opts?.includeArchived ? bothStates() : [makeConv(10, "Active one")]),
      );

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();

        ws.toggleShowArchived();
        await flush();
        expect(ws.showArchived()).toBe(true);
        expect(ws.convs().map((c) => c.title)).toEqual(["Active one", "Archived one"]);
        expect(rpc.convList).toHaveBeenLastCalledWith(1, { includeArchived: true });

        ws.toggleShowArchived();
        await flush();
        expect(ws.convs().map((c) => c.title)).toEqual(["Active one"]);
        expect(rpc.convList).toHaveBeenLastCalledWith(1, { includeArchived: false });
        dispose();
      });
    });

    it("archiveConv sets state Archived, then refetches so it drops out", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      withArchiveModel(rpc);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        expect(ws.convs().map((c) => c.title)).toEqual(["Open"]);

        const ok = await ws.archiveConv(makeConv(10, "Open", 1, "Active"));
        expect(ok).toBe(true);
        expect(rpc.convUpdate).toHaveBeenCalledWith(10, { state: "Archived" });
        await flush();
        expect(ws.convs()).toEqual([]); // refetched working set no longer has it
        expect(ws.isArchiving(10)).toBe(false);
        expect(ws.archiveError(10)).toBeNull();
        dispose();
      });
    });

    it("unarchiveConv sets state Active", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      const archived = makeConv(11, "Kept", 1, "Archived");
      rpc.convUpdate.mockResolvedValue(makeConv(11, "Kept", 1, "Active"));
      rpc.convList.mockResolvedValue([archived]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        const ok = await ws.unarchiveConv(archived);
        expect(ok).toBe(true);
        expect(rpc.convUpdate).toHaveBeenCalledWith(11, { state: "Active" });
        dispose();
      });
    });

    it("clears the selection when archiving hides the selected conversation", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      withArchiveModel(rpc);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        ws.selectConv(makeConv(10, "Open", 1, "Active"));
        expect(ws.selectedConv()).not.toBeNull();

        await ws.archiveConv(makeConv(10, "Open", 1, "Active"));
        await flush(); // let the reconcile effect run on the refetched list
        // The working-set refetch dropped it, so the selection is cleared rather
        // than stranding an unreachable conversation.
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });

    it("drops the selection when a later refetch removes the selected conversation", async () => {
      // Guards the "stranded selection" case: the archive's own refetch may keep
      // the selection (e.g. it failed, or Archived were shown), but a subsequent
      // successful list refetch that no longer contains it must reconcile.
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convList
        .mockResolvedValueOnce([makeConv(10, "Open", 1, "Active")]) // initial load
        .mockResolvedValueOnce([]); // a later refetch: archived elsewhere, now gone

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        ws.selectConv(makeConv(10, "Open", 1, "Active"));
        expect(ws.selectedConv()).not.toBeNull();

        feed.emitConvUpdate(); // a poke triggers a refetch that drops the row
        await flush();
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });

    it("keeps the selection when showArchived leaves the archived conversation visible", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      withArchiveModel(rpc);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        ws.selectConv(makeConv(10, "Open", 1, "Active"));
        ws.toggleShowArchived(); // archived rows stay visible
        await flush();

        await ws.archiveConv(makeConv(10, "Open", 1, "Active"));
        expect(ws.selectedConv()?.id).toBe(10); // still reachable, still selected
        dispose();
      });
    });

    it("keeps each concurrent archive's pending state independent", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      // Hold both updates open; resolve them one at a time via the gates.
      const gates: Array<() => void> = [];
      rpc.convUpdate.mockImplementation(
        (id: number, data: { state: "Active" | "Archived" }) =>
          new Promise((resolve) => {
            gates.push(() => resolve(makeConv(id, `C${id}`, 1, data.state)));
          }),
      );
      rpc.convList.mockResolvedValue([makeConv(10, "A"), makeConv(11, "B")]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();

        const p10 = ws.archiveConv(makeConv(10, "A", 1, "Active"));
        const p11 = ws.archiveConv(makeConv(11, "B", 1, "Active"));
        expect(ws.isArchiving(10)).toBe(true);
        expect(ws.isArchiving(11)).toBe(true);

        gates[0](); // conv 10's update completes first
        await p10;
        // 10 completing must not clear 11's still-pending state.
        expect(ws.isArchiving(10)).toBe(false);
        expect(ws.isArchiving(11)).toBe(true);

        gates[1]();
        await p11;
        expect(ws.isArchiving(11)).toBe(false);
        dispose();
      });
    });

    it("surfaces the error on an archive failure", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convUpdate.mockRejectedValue(new Error("archive failed"));

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        const ok = await ws.archiveConv(makeConv(10, "Doomed"));
        expect(ok).toBe(false);
        expect(ws.archiveError(10)).toBe("archive failed");
        expect(ws.isArchiving(10)).toBe(false);
        dispose();
      });
    });

    it("keeps each concurrent archive's error independent", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      // Hold both updates open; reject each with its own message via the gates.
      const gates: Array<() => void> = [];
      rpc.convUpdate.mockImplementation(
        (id: number) =>
          new Promise((_resolve, reject) => {
            gates.push(() => reject(new Error(`boom ${id}`)));
          }),
      );
      rpc.convList.mockResolvedValue([makeConv(10, "A"), makeConv(11, "B")]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();

        const p10 = ws.archiveConv(makeConv(10, "A", 1, "Active"));
        const p11 = ws.archiveConv(makeConv(11, "B", 1, "Active"));
        gates[0](); // conv 10 fails
        await p10;
        gates[1](); // conv 11 fails
        await p11;

        // Each row keeps its own failure; starting 11 never cleared 10's error.
        expect(ws.archiveError(10)).toBe("boom 10");
        expect(ws.archiveError(11)).toBe("boom 11");
        dispose();
      });
    });

    it("clears a row's prior error when it is retried", async () => {
      const feed = createFakeFeed();
      const rpc = createFakeRpc();
      rpc.convList.mockResolvedValue([makeConv(10, "A")]);
      rpc.convUpdate
        .mockRejectedValueOnce(new Error("first fail"))
        .mockResolvedValueOnce(makeConv(10, "A", 1, "Archived"));

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace({ feed: feed.factory, rpc: rpc.rpc });
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();

        expect(await ws.archiveConv(makeConv(10, "A", 1, "Active"))).toBe(false);
        expect(ws.archiveError(10)).toBe("first fail");

        expect(await ws.archiveConv(makeConv(10, "A", 1, "Active"))).toBe(true);
        expect(ws.archiveError(10)).toBeNull(); // retry cleared the stale error
        dispose();
      });
    });
  });
});
