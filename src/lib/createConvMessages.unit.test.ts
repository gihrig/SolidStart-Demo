import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { createConvMessages } from "./createConvMessages";
import type { MessageFeedFactory, MessageFeedOptions } from "~/lib/websocket";
import type { Conv, ConvMsg } from "~/types/backend";

// createConvMessages is the seam: history load, live merge, dedupe, and the
// stale-after-send guard are exercised here through the interface, no DOM.
vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    convMsg: { add: vi.fn(), list: vi.fn().mockResolvedValue([]) },
  },
}));

// Let pending list/add promises and effects settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

const mockConv: Conv = {
  id: 10,
  agent_id: 1,
  owner_id: 1,
  title: "Test Conversation",
  kind: "OwnerOnly",
  state: "Active",
  cid: 1,
  ctime: "2024-01-01T00:00:00Z",
  mid: 1,
  mtime: "2024-01-01T00:00:00Z",
};

const msg = (id: number, content: string): ConvMsg => ({
  id,
  conv_id: 10,
  user_id: 1,
  content,
  cid: 1,
  ctime: "2024-01-01T00:00:00Z",
  mid: 1,
  mtime: "2024-01-01T00:00:00Z",
});

// In-memory feed adapter: lets a test emit conv_msg / error events through the port.
function createFakeFeed(connected = false) {
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  let opts: MessageFeedOptions = {};
  const factory: MessageFeedFactory = (options) => {
    opts = options;
    return { connected: () => connected, subscribe, unsubscribe };
  };
  return {
    factory,
    subscribe,
    unsubscribe,
    emitConvMsg: (convId: number, m: ConvMsg) => opts.onConvMsg?.(convId, m),
    emitError: (e: string) => opts.onError?.(e),
  };
}

describe("createConvMessages", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations; reset the seam defaults each test.
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockReset();
  });

  it("loads history and subscribes on the current conversation", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.list as ReturnType<typeof vi.fn>).mockResolvedValue([msg(1, "old")]);
    const feed = createFakeFeed(true);

    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await flush();
      expect(feed.subscribe).toHaveBeenCalledWith("conv", mockConv.id);
      expect(cm.messages().map((m) => m.content)).toEqual(["old"]);
      expect(cm.connected()).toBe(true);
      dispose();
    });
  });

  it("appends a live feed message for the current conversation", async () => {
    const feed = createFakeFeed(true);
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await flush();
      feed.emitConvMsg(10, msg(200, "live"));
      expect(cm.messages().map((m) => m.content)).toEqual(["live"]);
      dispose();
    });
  });

  it("ignores feed messages for other conversations", async () => {
    const feed = createFakeFeed(true);
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await flush();
      feed.emitConvMsg(99, msg(201, "other"));
      expect(cm.messages()).toEqual([]);
      dispose();
    });
  });

  it("dedupes a feed message that duplicates an id already shown", async () => {
    const feed = createFakeFeed(true);
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await flush();
      feed.emitConvMsg(10, msg(300, "once"));
      feed.emitConvMsg(10, msg(300, "once"));
      expect(cm.messages()).toHaveLength(1);
      dispose();
    });
  });

  it("send() adds the message and calls convMsg.add with the conv id", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(400, "hi"));
    const feed = createFakeFeed();
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await flush();
      expect(await cm.send("hi")).toBe(true);
      expect(backendRpc.convMsg.add).toHaveBeenCalledWith({ conv_id: mockConv.id, content: "hi" });
      expect(cm.messages().map((m) => m.content)).toEqual(["hi"]);
      dispose();
    });
  });

  it("dedupes when send() echoes a message the feed already delivered", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(500, "echo"));
    const feed = createFakeFeed(true);
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await flush();
      feed.emitConvMsg(10, msg(500, "echo")); // feed first
      await cm.send("echo"); // send returns same id
      expect(cm.messages()).toHaveLength(1);
      dispose();
    });
  });

  it("does not let a stale list response overwrite a just-sent message", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    let resolveList!: (msgs: ConvMsg[]) => void;
    (backendRpc.convMsg.list as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<ConvMsg[]>((r) => (resolveList = r)),
    );
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(400, "fresh"));
    const feed = createFakeFeed();

    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await cm.send("fresh");
      resolveList([msg(1, "stale history")]); // late history must be dropped
      await flush();
      expect(cm.messages().map((m) => m.content)).toEqual(["fresh"]);
      dispose();
    });
  });

  it("surfaces feed errors", async () => {
    const feed = createFakeFeed(true);
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      feed.emitError("socket exploded");
      expect(cm.error()).toBe("socket exploded");
      dispose();
    });
  });

  it("surfaces a send failure as an error", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));
    const feed = createFakeFeed();
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: feed.factory });
      await flush();
      expect(await cm.send("boom")).toBe(false);
      expect(cm.error()).toBe("nope");
      dispose();
    });
  });

  it("unsubscribes the old conversation and loads history for the new one on switch", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([msg(1, "conv10")])
      .mockResolvedValueOnce([msg(2, "conv20")]);
    const otherConv: Conv = { ...mockConv, id: 20 };
    const feed = createFakeFeed(true);

    await createRoot(async (dispose) => {
      const [conv, setConv] = createSignal<Conv | null>(mockConv);
      const cm = createConvMessages(conv, { feed: feed.factory });
      await flush();
      expect(cm.messages().map((m) => m.content)).toEqual(["conv10"]);

      setConv(otherConv);
      await flush();
      expect(feed.unsubscribe).toHaveBeenCalledWith("conv", mockConv.id);
      expect(feed.subscribe).toHaveBeenCalledWith("conv", otherConv.id);
      expect(cm.messages().map((m) => m.content)).toEqual(["conv20"]);
      dispose();
    });
  });
});
