import type { Channel as ChannelType } from "~/types/backend";

/**
 * A realtime **Channel** (`CONTEXT.md`): the front-end mirror of the back-end
 * `Channel` ([ADR-0020](../../../docs/adr/0020-collapse-channel-vocabulary.md)),
 * the one exported vocabulary that merged the former `WsEvent` / `ChannelKind` /
 * `Channel` split. It is the ts-rs-generated type (ids rewritten to `number`);
 * `subscribe` / `unsubscribe` take one, so a channel is a typed variant — a typo
 * is a compile error, and `conv` cannot be named without its id.
 */
export type Channel = ChannelType;

/**
 * The channel constructors, built on the ts-rs-generated `Channel`. `conv(id)`
 * names one Conversation's Event stream and requires its id; `agents` and `convs`
 * are the id-less global list-feed pokes (#85). When the back-end renames a kind,
 * the regenerated binding breaks the matching literal here at compile time — the
 * point of mirroring from a generated source rather than by hand.
 *
 * The Jedi channels ride alongside these (#115). `posts` is the id-less Post
 * list-feed poke; the other five name one entity and take its id. `postComment` /
 * `captionComment` are comment threads (payload); `postLike` / `captionLike` /
 * `postCaption` are count/list pokes. Every Jedi channel is authenticated-read —
 * any logged-in socket may subscribe.
 */
export const Channel = {
  conv: (id: number): Channel => ({ kind: "conv", id }),
  agents: { kind: "agents" } as const satisfies Channel,
  convs: { kind: "convs" } as const satisfies Channel,
  posts: { kind: "posts" } as const satisfies Channel,
  postComment: (id: number): Channel => ({ kind: "post_comment", id }),
  captionComment: (id: number): Channel => ({ kind: "caption_comment", id }),
  postLike: (id: number): Channel => ({ kind: "post_like", id }),
  captionLike: (id: number): Channel => ({ kind: "caption_like", id }),
  postCaption: (id: number): Channel => ({ kind: "post_caption", id }),
};
