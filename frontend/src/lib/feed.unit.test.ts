import { describe, it, expect, vi } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { createMemoryFeed } from "./feed.memory";
import { Channel } from "./channel";
import type { ConvMsg } from "~/types/backend";

const convMsg = (id: number, convId: number) =>
  ({ id, conv_id: convId, content: `m${id}` }) as unknown as ConvMsg;

describe("Feed — routing by Channel key", () => {
  it("delivers a poke only to the Subscription held on its Channel", () => {
    const mem = createMemoryFeed();
    const onPosts = vi.fn();
    const onAgents = vi.fn();
    createRoot(() => {
      mem.feed.subscribe(() => Channel.posts, onPosts);
      mem.feed.subscribe(() => Channel.agents, onAgents);
    });

    mem.emit({ event_type: "poke", kind: "posts" });

    expect(onPosts).toHaveBeenCalledTimes(1);
    expect(onPosts).toHaveBeenCalledWith({ event_type: "poke", kind: "posts" });
    expect(onAgents).not.toHaveBeenCalled();
  });
});

describe("Feed — routing a payload Event", () => {
  it("routes a conv_msg to conv:{conv_id}, as the back-end event.channel() does", () => {
    const mem = createMemoryFeed();
    const onConv7 = vi.fn();
    const onConv8 = vi.fn();
    createRoot(() => {
      mem.feed.subscribe(() => Channel.conv(7), onConv7);
      mem.feed.subscribe(() => Channel.conv(8), onConv8);
    });

    const event = { event_type: "conv_msg", payload: convMsg(1, 7) } as const;
    mem.emit(event);

    expect(onConv7).toHaveBeenCalledWith(event);
    expect(onConv8).not.toHaveBeenCalled();
  });

  it("drops an Event no Subscription holds", () => {
    const mem = createMemoryFeed();
    const onPostLike = vi.fn();
    createRoot(() => mem.feed.subscribe(() => Channel.postLike(1), onPostLike));

    mem.emit({ event_type: "poke", kind: "post_like", id: 2 });

    expect(onPostLike).not.toHaveBeenCalled();
  });
});

describe("Feed — the per-holder refcount", () => {
  it("subscribes the server once for two holders, and unsubscribes at the last release", () => {
    const mem = createMemoryFeed();
    mem.setConnected(true);
    const a = vi.fn();
    const b = vi.fn();
    const disposeA = createRoot((d) => {
      mem.feed.subscribe(() => Channel.conv(5), a);
      return d;
    });
    const disposeB = createRoot((d) => {
      mem.feed.subscribe(() => Channel.conv(5), b);
      return d;
    });
    // The strict memory wire throws on a repeat subscribe, so one entry here
    // means one wire subscribe.
    expect(mem.held()).toEqual([Channel.conv(5)]);

    mem.emit({ event_type: "conv_msg", payload: convMsg(1, 5) });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    disposeA(); // one holder remains
    expect(mem.held()).toEqual([Channel.conv(5)]);
    mem.emit({ event_type: "conv_msg", payload: convMsg(2, 5) });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    disposeB(); // the last holder releases
    expect(mem.held()).toEqual([]);
  });

  it("releases a Subscription with its reactive scope", () => {
    const mem = createMemoryFeed();
    mem.setConnected(true);
    const handler = vi.fn();
    const dispose = createRoot((d) => {
      mem.feed.subscribe(() => Channel.posts, handler);
      return d;
    });
    expect(mem.held()).toEqual([Channel.posts]);

    dispose();

    expect(mem.held()).toEqual([]);
    mem.emit({ event_type: "poke", kind: "posts" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Feed — the move on an accessor change", () => {
  it("moves the hold when the accessor returns a new Channel", () => {
    const mem = createMemoryFeed();
    mem.setConnected(true);
    const handler = vi.fn();
    const [postId, setPostId] = createSignal<number | undefined>(1);
    createRoot(() =>
      mem.feed.subscribe(() => {
        const id = postId();
        return id === undefined ? undefined : Channel.postLike(id);
      }, handler),
    );
    expect(mem.held()).toEqual([Channel.postLike(1)]);

    setPostId(2);
    expect(mem.held()).toEqual([Channel.postLike(2)]);
    mem.emit({ event_type: "poke", kind: "post_like", id: 1 });
    expect(handler).not.toHaveBeenCalled();
    mem.emit({ event_type: "poke", kind: "post_like", id: 2 });
    expect(handler).toHaveBeenCalledTimes(1);

    setPostId(undefined); // holds nothing
    expect(mem.held()).toEqual([]);
  });

  it("keeps the hold when the accessor returns an equal Channel", () => {
    const mem = createMemoryFeed();
    mem.setConnected(true);
    const [tick, setTick] = createSignal(0);
    createRoot(() => {
      mem.feed.subscribe(() => {
        tick();
        return Channel.conv(3); // a new object with the same key
      }, vi.fn());
      mem.feed.subscribe(() => Channel.conv(4), vi.fn());
    });
    expect(mem.held()).toEqual([Channel.conv(3), Channel.conv(4)]);

    // A churn (unsubscribe, then subscribe) would move conv:3 behind conv:4.
    setTick(1);
    expect(mem.held()).toEqual([Channel.conv(3), Channel.conv(4)]);
  });
});

describe("Feed — replay and resync on each connect", () => {
  it("replays the held Channels on the first connect, then calls each handler with undefined", () => {
    const mem = createMemoryFeed();
    const calls: string[] = [];
    createRoot(() => {
      mem.feed.subscribe(
        () => Channel.agents,
        (event) =>
          calls.push(`agents:${event === undefined ? "resync" : "event"}:${mem.held().length}`),
      );
      mem.feed.subscribe(
        () => Channel.convs,
        (event) =>
          calls.push(`convs:${event === undefined ? "resync" : "event"}:${mem.held().length}`),
      );
    });
    // Disconnected: nothing reaches the server yet.
    expect(mem.held()).toEqual([]);

    mem.setConnected(true);

    expect(mem.held()).toEqual([Channel.agents, Channel.convs]);
    // Each resync ran after the full replay (both Channels already held).
    expect(calls).toEqual(["agents:resync:2", "convs:resync:2"]);
  });

  it("replays and resyncs again after a reconnect", () => {
    const mem = createMemoryFeed();
    const handler = vi.fn();
    createRoot(() => mem.feed.subscribe(() => Channel.posts, handler));
    mem.setConnected(true);
    handler.mockClear();

    mem.setConnected(false); // the drop clears the server's holds
    expect(mem.held()).toEqual([]);
    expect(handler).not.toHaveBeenCalled();

    mem.setConnected(true);
    expect(mem.held()).toEqual([Channel.posts]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it("gives a new or moved Subscription no resync call", () => {
    const mem = createMemoryFeed();
    mem.setConnected(true);
    const handler = vi.fn();
    const [id, setId] = createSignal(1);
    createRoot(() => mem.feed.subscribe(() => Channel.postCaption(id()), handler));
    setId(2);

    expect(mem.held()).toEqual([Channel.postCaption(2)]);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Feed — onError", () => {
  it("sends each error to every held error handler, until its scope ends", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const mem = createMemoryFeed();
      const a = vi.fn();
      const b = vi.fn();
      const disposeA = createRoot((d) => {
        mem.feed.onError(a);
        return d;
      });
      createRoot(() => mem.feed.onError(b));

      mem.fail("WebSocket connection error");
      expect(a).toHaveBeenCalledWith("WebSocket connection error");
      expect(b).toHaveBeenCalledWith("WebSocket connection error");
      expect(errorSpy).toHaveBeenCalledWith("WebSocket connection error");

      disposeA();
      mem.fail("again");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
