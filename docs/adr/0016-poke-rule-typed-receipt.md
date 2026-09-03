# The Poke rule is enforced by a typed poke receipt, not a source-scan guard

The **Poke rule** (`CONTEXT.md`) requires every list-poke mutation to poke its
list feed: a `create`/`update`/`delete` on `Conv` or `Agent` emits the matching
list-feed Event, and every client refetches (#85). Today the rule is enforced by a
`#[cfg(test)]` source-scan guard (#95, `web/rpcs/mod.rs`): it reads every
`*_rpc.rs` as text, extracts each `router_builder!` entry, and asserts the handler
body contains its expected `broadcast_*` call from a hand-maintained `POKE_TABLE`.

The guard works but is heavy and leaky. It is ~260 lines, most of it a hand-rolled
Rust parser (comment-stripping, paren-matching, identifier extraction). It runs at
test-time, not compile-time. It proves the poke is *present in source*, not that it
*executes*. Its coverage rests on two conventions — the four mutation prefixes
(`create_`/`update_`/`delete_`/`add_`) and rustfmt's column-0 closing brace — so a
mutation named outside those prefixes is silently unguarded.

This ADR records replacing the guard with a typed poke token — a compile-time
obligation.

## Decisions

**`broadcast_*` returns a channel-typed `PokeReceipt<C>`.** Each list-feed
broadcast returns `PokeReceipt<Convs>` / `PokeReceipt<Agents>` instead of `()`.
`PokeReceipt` has a private constructor, so only the ws module mints one — a
handler cannot fabricate a receipt without calling a broadcast.

**Mutations return `PokedRpcResult<T, C>`; reads keep `DataRpcResult<T>`.**
`PokedRpcResult::new(data, receipt)` requires the matching `PokeReceipt<C>`. A
mutation cannot build its return value without having poked its own feed. No poke,
no compile. The channel type binds each mutation to the right feed: `create_agent`
returning `PokedRpcResult<Agent, Agents>` cannot be built from a `Convs` receipt,
so a wrong-feed poke is a type error. This preserves exactly what `POKE_TABLE`
guaranteed — right mutation, right feed — structurally.

**The wire shape is unchanged.** `PokedRpcResult<T, C>` derives `Serialize` as
`{ data: T }` — byte-identical to `DataRpcResult<T>` (the channel marker is
`PhantomData`, skipped). rpc-router requires only `R: Serialize` of a handler's
return (`impl_handlers.rs`), so the token satisfies it with no router change, no
ts-rs change, and no front-end change.

**The poke fires when the write commits, before the re-get.** A `create`/`update`
handler pokes immediately after the successful `Bmc` write, then re-gets the entity
to return it. A committed change reaches clients even if the re-get fails.
Previously the poke sat after the re-get, so a re-get error skipped it.

**The source-scan guard and `POKE_TABLE` are deleted.** The type is now the
enforcement; the ~260-line parser and its hand-maintained table go.

## Considered and rejected

- **Keep the source-scan guard (#95).** Rejected: ~260 lines of fragile Rust-text
  parsing, test-time, proves presence not execution, blind to any mutation named
  outside four prefixes. Its own #95 note recorded "the guard proves the poke call
  is present, not that it executes."
- **A runtime-spy test.** Call each handler with a spy `WsState` and assert the
  broadcast. Rejected as the primary mechanism: it proves execution but stays
  test-time, needs DB fixtures per handler, and is hand-listed — rpc-router 0.2.0
  keeps its method map private (`router_inner.rs`), so a test cannot auto-discover
  a new mutation. A forgotten handler is silently uncovered.
- **A `crud_with_poke!` macro as the enforcement** (arch-review Candidate 1).
  Rejected as enforcement: a macro-generated poke is invisible to the source scan
  (#95), and the macro covers neither the payload poke (`add_conv_msg`) nor `conv`'s
  special `list_convs` (`ConvBmc::list_active_default`, #25). Retained only as an
  optional future DRY affordance (see Consequences), never the guarantee.
- **Typed poke receipt (chosen).** Compile-time, execution-proof on every success
  path, name-independent, wire-compatible.

## Consequences

- **Seven handlers change return type; the wire does not.** The six list-poke
  mutations (`create`/`update`/`delete` × `Conv`, `Agent`) return
  `PokedRpcResult<T, C>`; `add_conv_msg` mints its receipt from `broadcast_conv_msg`
  and returns the poked type too. Reads are untouched.
- **Known limit: a mutation mis-typed as a read escapes.** Declaring a mutation's
  return as `DataRpcResult<T>` compiles with no poke. Narrow — a deliberate wrong
  type, visible in the signature — where the guard's hole was a silent naming miss.
  Grep for `DataRpcResult` in a mutation catches it.
- **List-poke handlers stay hand-written; the macro is deferred.** With the token, a
  `crud_with_poke!` macro is DRY sugar, not safety. Deferred to avoid designing an
  abstraction against two instances. **Trigger:** when a third list-poke entity
  repeats the `create`/`update`/`delete` shape — `Post` in #66 — extract
  `crud_with_poke!` from the then-three sets. Payload pokes (`add_conv_msg`, and
  #66's `Comment`/`Caption`/`Like` adds) stay bespoke; they do not fit the list-poke
  macro. `generate_common_rpc_fns!` (`macro_utils.rs`) remains the separate
  full-CRUD template affordance.
- **Complements ADR-0015.** Subscribe-time authorization and the derived-Channel
  envelope are unchanged. This ADR changes only how a mutation is obliged to emit
  its poke; the broadcast helpers named in ADR-0015 now return a receipt.
- **Supersedes the #95 guard, which carried no ADR** ("the guard is easy to
  reverse"). The token is harder to reverse — it shapes handler return types — and
  surprising to a future reader (mutations return a different type than reads), so
  it earns this record.

Origin: arch-review `architecture-review-20260829-233237.html` Candidate 1, grilled
2026-08-30. Related: #85, #95, #66.
