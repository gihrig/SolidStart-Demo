import type { ChannelKind } from "~/types/backend";

/**
 * A realtime **Channel** (`CONTEXT.md`) named at a front-end call site: a
 * `ChannelKind` paired with the id that kind needs. The front-end mirror of the
 * back-end `Channel` ([ADR-0018](../../../docs/adr/0018-channel-strings-track-domain-names.md)).
 * `subscribe` / `unsubscribe` take one of these, so a channel name is a typed
 * `ChannelKind` — a typo is a compile error, and `conv` cannot be named without its
 * id.
 */
export type Channel = { kind: ChannelKind; id?: number };

/**
 * The channel constructors, built on the ts-rs-generated `ChannelKind`. `conv(id)`
 * names one Conversation's Event stream and requires its id; `agents` and `convs`
 * are the id-less global list-feed pokes (#85). When the back-end renames a kind,
 * the regenerated binding breaks the matching literal here at compile time — the
 * point of mirroring from a generated source rather than by hand.
 */
export const Channel = {
  conv: (id: number): Channel => ({ kind: "conv", id }),
  agents: { kind: "agents" } as const,
  convs: { kind: "convs" } as const,
};
