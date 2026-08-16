import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createRoot } from "solid-js";
import { makeAgent, makeConv } from "./conversationWorkspace.stub";
import { createConversationWorkspace } from "./conversationWorkspace";

// The workspace is the seam: it owns selection + the create→refetch→select dance,
// so the flow is tested here once, not through three route renders.
vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    agent: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
    conv: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
  },
}));

// Let pending resource fetches / refetches settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createConversationWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selection", () => {
    it("starts with nothing selected", async () => {
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        expect(ws.selectedAgent()).toBeNull();
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });

    it("selectAgent makes it the selected agent", async () => {
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        const ada = makeAgent(1, "Ada");
        ws.selectAgent(ada);
        expect(ws.selectedAgent()).toEqual(ada);
        dispose();
      });
    });

    it("selectConv makes it the selected conversation", async () => {
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        ws.selectAgent(makeAgent(1, "Ada"));
        const conv = makeConv(10, "Hello");
        ws.selectConv(conv);
        expect(ws.selectedConv()).toEqual(conv);
        dispose();
      });
    });

    it("switching to a different agent clears the conversation selection", async () => {
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        ws.selectAgent(makeAgent(1, "Ada"));
        ws.selectConv(makeConv(10, "Hello"));
        expect(ws.selectedConv()).not.toBeNull();
        ws.selectAgent(makeAgent(2, "Bob"));
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });

    it("re-selecting the open agent collapses the selection to none", async () => {
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
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
      const { backendRpc } = await import("~/lib/backend-rpc");
      (backendRpc.agent.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeAgent(1, "bob"),
        makeAgent(2, "Ada"),
        makeAgent(3, "Cara"),
      ]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        await flush();
        expect(ws.agents()?.map((a) => a.name)).toEqual(["Ada", "bob", "Cara"]);
        dispose();
      });
    });

    it("exposes conversations sorted A→Z by displayed title, empty titles as 'Untitled'", async () => {
      const { backendRpc } = await import("~/lib/backend-rpc");
      (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeConv(10, "banana"),
        makeConv(11, ""), // → "Untitled", sorts after "banana"
        makeConv(12, "Apple"),
      ]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        expect(ws.convs()?.map((c) => c.title)).toEqual(["Apple", "banana", ""]);
        dispose();
      });
    });

    it("orders equal labels deterministically by id (several 'Untitled')", async () => {
      const { backendRpc } = await import("~/lib/backend-rpc");
      (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeConv(30, ""),
        makeConv(10, ""),
        makeConv(20, ""),
      ]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        ws.selectAgent(makeAgent(1, "Ada"));
        await flush();
        expect(ws.convs()?.map((c) => c.id)).toEqual([10, 20, 30]);
        dispose();
      });
    });
  });

  describe("createAgent (the create dance)", () => {
    it("creates, refetches, and selects the new agent", async () => {
      const { backendRpc } = await import("~/lib/backend-rpc");
      const created = makeAgent(3, "New Agent");
      (backendRpc.agent.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      (backendRpc.agent.list as ReturnType<typeof vi.fn>).mockResolvedValue([created]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        const ok = await ws.createAgent("New Agent");
        expect(ok).toBe(true);
        expect(backendRpc.agent.create).toHaveBeenCalledWith({ name: "New Agent" });
        expect(ws.selectedAgent()).toEqual(created);
        await flush();
        expect(ws.agents()).toEqual([created]); // list refetched after create
        expect(ws.creatingAgent()).toBe(false);
        expect(ws.createAgentError()).toBeNull();
        dispose();
      });
    });

    it("surfaces the error and keeps the selection on failure", async () => {
      const { backendRpc } = await import("~/lib/backend-rpc");
      (backendRpc.agent.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("create failed"),
      );

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
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
      const { backendRpc } = await import("~/lib/backend-rpc");
      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        const ok = await ws.createConv("Orphan");
        expect(ok).toBe(false);
        expect(backendRpc.conv.create).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("creates under the selected agent, refetches, and selects it", async () => {
      const { backendRpc } = await import("~/lib/backend-rpc");
      const ada = makeAgent(1, "Ada");
      const conv = makeConv(10, "Hello");
      (backendRpc.conv.create as ReturnType<typeof vi.fn>).mockResolvedValue(conv);
      (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([conv]);

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        ws.selectAgent(ada);
        const ok = await ws.createConv("Hello");
        expect(ok).toBe(true);
        expect(backendRpc.conv.create).toHaveBeenCalledWith({ agent_id: ada.id, title: "Hello" });
        expect(ws.selectedConv()).toEqual(conv);
        expect(ws.creatingConv()).toBe(false);
        dispose();
      });
    });

    it("surfaces the error on failure", async () => {
      const { backendRpc } = await import("~/lib/backend-rpc");
      (backendRpc.conv.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("conv failed"),
      );

      await createRoot(async (dispose) => {
        const ws = createConversationWorkspace();
        ws.selectAgent(makeAgent(1, "Ada"));
        const ok = await ws.createConv("Doomed");
        expect(ok).toBe(false);
        expect(ws.createConvError()).toBe("conv failed");
        expect(ws.selectedConv()).toBeNull();
        dispose();
      });
    });
  });
});
