import { describe, it, expect, vi } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import { createMemoryFeed } from "./feed.memory";
import { Channel } from "./channel";
import type { CommentView } from "~/types/backend";

const postComment = (id: number, postId: number) =>
  ({ id, parent_id: postId, content: `c${id}` }) as unknown as CommentView;

describe("Feed — routing by Channel key", () => {
  it("delivers a poke only to the Subscription held on its Channel", () => {
    const mem = createMemoryFeed();
    const onPosts = vi.fn();
    const onPostLike = vi.fn();
    createRoot(() => {
      mem.feed.subscribe(() => Channel.posts, onPosts);
      mem.feed.subscribe(() => Channel.postLike(1), onPostLike);
    });

    mem.emit({ event_type: "poke", kind: "posts" });

    expect(onPosts).toHaveBeenCalledTimes(1);
    expect(onPosts).toHaveBeenCalledWith({ event_type: "poke", kind: "posts" });
    expect(onPostLike).not.toHaveBeenCalled();
  });
});

describe("Feed — routing a payload Event", () => {
  it("routes a Post Comment upsert and removal to post_comment:{parent_id} (#124, #125)", () => {
    const mem = createMemoryFeed();
    const onPost7 = vi.fn();
    const onPost8 = vi.fn();
    createRoot(() => {
      mem.feed.subscribe(() => Channel.postComment(7), onPost7);
      mem.feed.subscribe(() => Channel.postComment(8), onPost8);
    });

    const upsert = { event_type: "post_comment", payload: postComment(1, 7) } as const;
    const removal = {
      event_type: "post_comment_removal",
      payload: { id: 1, parent_id: 7 },
    } as const;
    mem.emit(upsert);
    mem.emit(removal);

    expect(onPost7.mock.calls).toEqual([[upsert], [removal]]);
    expect(onPost8).not.toHaveBeenCalled();
  });

  it("routes a Caption Comment upsert and removal to caption_comment:{parent_id} (#127)", () => {
    const mem = createMemoryFeed();
    const onCaption7 = vi.fn();
    const onPost7 = vi.fn();
    createRoot(() => {
      mem.feed.subscribe(() => Channel.captionComment(7), onCaption7);
      mem.feed.subscribe(() => Channel.postComment(7), onPost7);
    });

    const upsert = { event_type: "caption_comment", payload: postComment(1, 7) } as const;
    const removal = {
      event_type: "caption_comment_removal",
      payload: { id: 1, parent_id: 7 },
    } as const;
    mem.emit(upsert);
    mem.emit(removal);

    expect(onCaption7.mock.calls).toEqual([[upsert], [removal]]);
    expect(onPost7).not.toHaveBeenCalled();
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
      mem.feed.subscribe(() => Channel.postComment(5), a);
      return d;
    });
    const disposeB = createRoot((d) => {
      mem.feed.subscribe(() => Channel.postComment(5), b);
      return d;
    });
    // The strict memory wire throws on a repeat subscribe, so one entry here
    // means one wire subscribe.
    expect(mem.held()).toEqual([Channel.postComment(5)]);

    mem.emit({ event_type: "post_comment", payload: postComment(1, 5) });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    disposeA(); // one holder remains
    expect(mem.held()).toEqual([Channel.postComment(5)]);
    mem.emit({ event_type: "post_comment", payload: postComment(2, 5) });
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
        return Channel.postComment(3); // a new object with the same key
      }, vi.fn());
      mem.feed.subscribe(() => Channel.postComment(4), vi.fn());
    });
    expect(mem.held()).toEqual([Channel.postComment(3), Channel.postComment(4)]);

    // A churn (unsubscribe, then subscribe) would move post_comment:3 behind
    // post_comment:4.
    setTick(1);
    expect(mem.held()).toEqual([Channel.postComment(3), Channel.postComment(4)]);
  });
});

describe("Feed — replay and resync on each connect", () => {
  it("replays the held Channels on the first connect, then calls each handler with undefined", () => {
    const mem = createMemoryFeed();
    const calls: string[] = [];
    createRoot(() => {
      mem.feed.subscribe(
        () => Channel.posts,
        (event) =>
          calls.push(`posts:${event === undefined ? "resync" : "event"}:${mem.held().length}`),
      );
      mem.feed.subscribe(
        () => Channel.postLike(1),
        (event) =>
          calls.push(`post_like:${event === undefined ? "resync" : "event"}:${mem.held().length}`),
      );
    });
    // Disconnected: nothing reaches the server yet.
    expect(mem.held()).toEqual([]);

    mem.setConnected(true);

    expect(mem.held()).toEqual([Channel.posts, Channel.postLike(1)]);
    // Each resync ran after the full replay (both Channels already held).
    expect(calls).toEqual(["posts:resync:2", "post_like:resync:2"]);
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

  it("sends a Subscription made in the same update as the connect once", () => {
    const mem = createMemoryFeed();
    // The Subscription's effect and the connect both settle in this root's
    // update. The strict wire throws on a second subscribe.
    createRoot(() => {
      mem.feed.subscribe(() => Channel.posts, vi.fn());
      mem.setConnected(true);
    });

    expect(mem.held()).toEqual([Channel.posts]);
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
