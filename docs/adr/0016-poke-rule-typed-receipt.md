# The Poke rule is enforced by a typed poke receipt, not a source-scan guard

Origin: #95

The Poke rule says that each mutation must emit the Event for its Channel, so
each client sees the change. A test that scans the source for a `broadcast_*`
call proves only that the call is in the text, not that it runs.

## Decisions

- **Each `broadcast_*` returns a `PokeReceipt<C>`, typed by Channel.** The
  markers are `Posts`, `PostCaption`, `PostLike`, `CaptionLike`, `PostComment`
  and `CaptionComment`. `PokeReceipt` has a private constructor, so only the ws
  module mints one.
- **A mutation returns `PokedRpcResult<T, C>`; a read returns
  `DataRpcResult<T>`.** `PokedRpcResult::new(data, receipt)` needs the receipt
  for its own Channel. With no poke, or a poke on the wrong Channel, the
  handler does not compile.
- **The wire does not change.** `PokedRpcResult` serializes as `{ data: T }`,
  the same bytes as `DataRpcResult`. The Channel marker is a skipped
  `PhantomData`.
- **The poke fires when the write commits, before the re-get.** A committed
  change reaches the clients, even if the re-get fails.
- **A toggle pokes only on a real change.** `broadcast_post_like(post_id,
  changed)` and `broadcast_caption_like` broadcast only when `changed` is
  `true`, and they always return the receipt. The condition is in the ws module,
  not in the handler, so a handler cannot skip a real change.

## Considered and rejected

- **The source-scan guard.** It is a fragile text parser, it runs only at test
  time, and it misses a mutation with an unusual name.
- **A runtime spy test.** It proves the call runs, but each handler must be
  listed by hand, so a new handler can be missed.
- **A `crud_with_poke!` macro as the guarantee.** It does not cover the
  payload pushes, which do not fit one shape.

## Consequences

- A mutation typed as a read, with `DataRpcResult<T>`, compiles with no poke.
  The wrong type is visible in the signature.
- For a toggle, the receipt proves that the outcome went through the broadcast
  helper, not that a poke fired.
- A second poke, such as the `posts` poke after a Like toggle, is not typed. The
  handler calls `broadcast_posts_update()` and drops that receipt.
