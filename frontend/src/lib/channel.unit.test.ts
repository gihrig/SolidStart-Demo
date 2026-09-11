import { describe, test, expect } from "vite-plus/test";
import { Channel } from "./channel";

// The front-end mirror of the back-end Channel vocabulary (ADR-0018). These
// assertions lock each constructor to the exact wire `kind` string the back-end
// `ChannelKind` serializes to. The back-end `channelkind_wire_shape_is_stable` /
// `jedi_channelkind_wire_shape_is_stable` tests lock the same strings from Rust;
// together they guard the two sides against drift.
describe("Channel constructors mirror the wire kinds", () => {
  test("existing conversation channels", () => {
    expect(Channel.conv(5)).toEqual({ kind: "conv", id: 5 });
    expect(Channel.agents).toEqual({ kind: "agents" });
    expect(Channel.convs).toEqual({ kind: "convs" });
  });

  test("posts is the id-less list-feed poke", () => {
    expect(Channel.posts).toEqual({ kind: "posts" });
  });

  test("the five id-bearing Jedi channels carry their id", () => {
    expect(Channel.postComment(1)).toEqual({ kind: "post_comment", id: 1 });
    expect(Channel.captionComment(2)).toEqual({
      kind: "caption_comment",
      id: 2,
    });
    expect(Channel.postLike(3)).toEqual({ kind: "post_like", id: 3 });
    expect(Channel.captionLike(4)).toEqual({ kind: "caption_like", id: 4 });
    expect(Channel.postCaption(5)).toEqual({ kind: "post_caption", id: 5 });
  });
});
