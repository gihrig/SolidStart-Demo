import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { createConvMessages } from "./createConvMessages";
import type { ConvMsgClient } from "./backend-rpc";
import { createMemoryFeed } from "~/lib/feed.memory";
import { Channel } from "~/lib/channel";
import type { Conv, ConvMsg } from "~/types/backend";

// createConvMessages is the seam: history load, live merge, dedupe, and the
// stale-after-send guard are exercised here through the interface, no DOM. Both
// data sources are injected as in-memory adapters — the test stands at the seam
// instead of mocking the backend-rpc module.

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

// The real Feed core over the in-memory wire, connected first when asked.
function memoryFeed(connected = false) {
  const mem = createMemoryFeed();
  mem.setConnected(connected);
  return mem;
}

// A conv_msg Event as the server pushes it, addressed to `convId`.
const convMsgEvent = (convId: number, m: ConvMsg) =>
  ({ event_type: "conv_msg", payload: { ...m, conv_id: convId } }) as const;

// In-memory adapter for the convMsg RPC slice: a test sets history / add results
// and asserts calls, standing at the ConvMsgClient interface instead of mocking
// the backend-rpc module. `list` defaults to empty history.
function createFakeConvMsg() {
  const list = vi.fn().mockResolvedValue([]);
  const add = vi.fn();
  const api: ConvMsgClient = { list, add };
  return { api, list, add };
}

describe("createConvMessages", () => {
  // The Feed logs each error at the boundary; keep the output quiet.
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("loads history and subscribes on the current conversation", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    convMsg.list.mockResolvedValue([msg(1, "old")]);

    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      expect(mem.held()).toEqual([Channel.conv(mockConv.id)]);
      expect(cm.messages().map((m) => m.content)).toEqual(["old"]);
      expect(cm.connected()).toBe(true);
      dispose();
    });
  });

  it("appends a live feed message for the current conversation", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      mem.emit(convMsgEvent(10, msg(200, "live")));
      expect(cm.messages().map((m) => m.content)).toEqual(["live"]);
      dispose();
    });
  });

  it("ignores feed messages for other conversations", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      mem.emit(convMsgEvent(99, msg(201, "other")));
      expect(cm.messages()).toEqual([]);
      dispose();
    });
  });

  it("dedupes a feed message that duplicates an id already shown", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      mem.emit(convMsgEvent(10, msg(300, "once")));
      mem.emit(convMsgEvent(10, msg(300, "once")));
      expect(cm.messages()).toHaveLength(1);
      dispose();
    });
  });

  it("send() adds the message and calls convMsg.add with the conv id", async () => {
    const mem = memoryFeed();
    const convMsg = createFakeConvMsg();
    convMsg.add.mockResolvedValue(msg(400, "hi"));
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      expect(await cm.send("hi")).toBe(true);
      expect(convMsg.add).toHaveBeenCalledWith({ conv_id: mockConv.id, content: "hi" });
      expect(cm.messages().map((m) => m.content)).toEqual(["hi"]);
      dispose();
    });
  });

  it("dedupes when send() echoes a message the feed already delivered", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    convMsg.add.mockResolvedValue(msg(500, "echo"));
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      mem.emit(convMsgEvent(10, msg(500, "echo"))); // feed first
      await cm.send("echo"); // send returns same id
      expect(cm.messages()).toHaveLength(1);
      dispose();
    });
  });

  it("does not let a stale list response overwrite a just-sent message", async () => {
    let resolveList!: (msgs: ConvMsg[]) => void;
    const mem = memoryFeed();
    const convMsg = createFakeConvMsg();
    convMsg.list.mockReturnValue(new Promise<ConvMsg[]>((r) => (resolveList = r)));
    convMsg.add.mockResolvedValue(msg(400, "fresh"));

    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await cm.send("fresh");
      resolveList([msg(1, "stale history")]); // late history must be dropped
      await flush();
      expect(cm.messages().map((m) => m.content)).toEqual(["fresh"]);
      dispose();
    });
  });

  it("surfaces feed errors", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      mem.fail("socket exploded");
      expect(cm.error()).toBe("socket exploded");
      dispose();
    });
  });

  it("surfaces a send failure as an error", async () => {
    const mem = memoryFeed();
    const convMsg = createFakeConvMsg();
    convMsg.add.mockRejectedValue(new Error("nope"));
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      expect(await cm.send("boom")).toBe(false);
      expect(cm.error()).toBe("nope");
      dispose();
    });
  });

  it("pending is false, true while a send is in flight, then false again", async () => {
    let resolveAdd!: (m: ConvMsg) => void;
    const mem = memoryFeed();
    const convMsg = createFakeConvMsg();
    convMsg.add.mockReturnValue(new Promise<ConvMsg>((r) => (resolveAdd = r)));
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      expect(cm.pending()).toBe(false);
      const sent = cm.send("hi");
      expect(cm.pending()).toBe(true);
      resolveAdd(msg(400, "hi"));
      await sent;
      expect(cm.pending()).toBe(false);
      dispose();
    });
  });

  it("does not flip pending when there is no conversation selected", async () => {
    const mem = memoryFeed();
    const convMsg = createFakeConvMsg();
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => null, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      expect(await cm.send("hi")).toBe(false);
      expect(cm.pending()).toBe(false);
      dispose();
    });
  });

  it("a send failure takes precedence over a prior feed error", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    convMsg.add.mockRejectedValue(new Error("send failed"));
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      mem.fail("feed down");
      expect(cm.error()).toBe("feed down");
      await cm.send("boom");
      expect(cm.error()).toBe("send failed");
      dispose();
    });
  });

  it("a prior feed error resurfaces once a send succeeds and clears its own error", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    convMsg.add.mockResolvedValue(msg(600, "ok"));
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      mem.fail("feed down");
      expect(await cm.send("ok")).toBe(true);
      // send's own error cleared; the standing connection error shows through again.
      expect(cm.error()).toBe("feed down");
      dispose();
    });
  });

  it("unsubscribes the old conversation and loads history for the new one on switch", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    convMsg.list
      .mockResolvedValueOnce([msg(1, "conv10")])
      .mockResolvedValueOnce([msg(2, "conv20")]);
    const otherConv: Conv = { ...mockConv, id: 20 };

    await createRoot(async (dispose) => {
      const [conv, setConv] = createSignal<Conv | null>(mockConv);
      const cm = createConvMessages(conv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      expect(cm.messages().map((m) => m.content)).toEqual(["conv10"]);

      setConv(otherConv);
      await flush();
      expect(mem.held()).toEqual([Channel.conv(otherConv.id)]);
      expect(cm.messages().map((m) => m.content)).toEqual(["conv20"]);
      dispose();
    });
  });

  it("ignores the resync call after a reconnect: no reload, the messages stay", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    convMsg.list.mockResolvedValue([msg(1, "old")]);
    await createRoot(async (dispose) => {
      const cm = createConvMessages(() => mockConv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      mem.emit(convMsgEvent(10, msg(2, "live")));

      mem.setConnected(false);
      mem.setConnected(true);
      await flush();

      expect(mem.held()).toEqual([Channel.conv(mockConv.id)]);
      expect(convMsg.list).toHaveBeenCalledTimes(1);
      expect(cm.messages().map((m) => m.content)).toEqual(["old", "live"]);
      dispose();
    });
  });

  it("holds no Channel while no conversation is selected", async () => {
    const mem = memoryFeed(true);
    const convMsg = createFakeConvMsg();
    await createRoot(async (dispose) => {
      const [conv, setConv] = createSignal<Conv | null>(mockConv);
      createConvMessages(conv, { feed: mem.feed, convMsg: convMsg.api });
      await flush();
      setConv(null);
      await flush();
      expect(mem.held()).toEqual([]);
      dispose();
    });
  });
});
