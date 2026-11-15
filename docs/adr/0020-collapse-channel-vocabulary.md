# One generated Channel type; channel names track domain names

## Decisions

- **One exported `Channel` enum** (`lib-core::realtime`). It has one variant
  for each channel, and a variant carries an id when its key needs one:
  `Posts`, `PostComment(i64)`, `CaptionComment(i64)`, `PostLike(i64)`,
  `CaptionLike(i64)`, `PostCaption(i64)`. It derives serde and ts-rs. `key()`
  is the one place that writes `post_like:{id}`.
- **`WsEvent` carries its Channel.** A payload variant gets its Channel from its
  payload. A contentless event is `Poke(Channel)`.
- **The front-end builds Channels with constructors** (`lib/channel.ts`) on the
  generated type. So `postLike` requires an id, and `posts` refuses one.
- **Threads push, lists and counts poke.** An append-only thread sends the new
  item. A ranked or derived view sends a poke, and the client refetches.
- **A channel name equals its entity's domain name.** A domain rename changes
  the wire, and the compiler finds each site.

## Considered and rejected

- **A front-end hand copy of the names.** Drift then fails a test, not the build.
- **A frozen wire vocabulary.** A channel named for an old entity breaks the
  one-word-one-meaning rule.
- **A bare string union.** It catches typos, not a missing or extra id.
- **`{ kind, id: Option<i64> }` or `{ channel, payload }`.** Each one lets two
  fields disagree.

## Consequences

- The wire breaks on each rename. The front-end and the back-end ship together.
  A public protocol would need versions.
