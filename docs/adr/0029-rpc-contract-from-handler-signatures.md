# The RPC contract is read from the handler signatures and pinned by one test

Before #190, each RPC method had two copies. The back-end registers each handler
by name in a `router_builder!` list. The front-end kept its own copy of each call.
A call named its method as a string and sent untyped
`params?: Record<string, unknown>`. It also named its result type and the path of
its surface. No test joined the two copies, so a typo in a method name passed every
unit test. The front-end also copied seven write-path length caps, for example
`const CAPTION_MAX_LENGTH = 36;`.

## Decisions

**One contract module lists the Jedi methods.** `web/rpcs/rpc_contract.rs` holds
one `entry!(Surface, module::handler)` line per method. The macro takes the method
name from the handler identifier, as `router_builder!` does. Each entry takes its
params type and its result type from the handler, through rpc-router's `Handler`
bound. So the contract module declares no type of its own. The `router_builder!`
lists keep the rust10x blueprint shape
([ADR-0025](0025-login-handler-keeps-blueprint-inline-orchestration.md)).

**The contract exports with the ts-rs bindings.** A test named
`export_bindings_rpc_contract` writes `bindings/RpcContract.ts`. The file has one
type per surface, `AuthenticatedRpc` and `PublicRpc`. Each type maps a method to
its `params` and its `result`. `cgs bindings` and the CI bindings-drift guard cover
the file ([ADR-0010](0010-monorepo-structure.md)).

**The export holds only the fields the front-end sends.** `filters` and
`list_options` stay out of the export. TypeScript accepts any object for `{}`. So a
params type with no exported field takes no argument. A child list takes its parent
id as `id` (`ParamsIdedList`), as `list_captions_for_post` does.

**The front-end calls each surface through one typed function.**
`authenticatedRpc(method, params)` posts to `/api/rpc`.
`publicRpc(method, params)` posts to `/api/rpc-public`. A wrong method name, params
shape or result use fails `tsc`. So does a method on the wrong surface. `jediApi`
calls the two functions directly, with no RPC member per method.

**One test proves the routing.** It builds both routers with no resources and calls
each entry with no params. No handler body runs, so the test needs no database and
no login. Each entry must be routed on its own surface. Each entry must return
`MethodUnknown` on the other surface. The public router must list exactly the
public entries. The public surface runs under `root_ctx`, so a method with no entry
there is the costliest routing mistake.

**The length caps export as literal types.** A test named
`export_bindings_hygiene_caps` writes `bindings/HygieneCaps.ts` from each Bmc's
`hygiene_rules()`. Each front-end copy of a cap pins to it with `satisfies`. A
changed back-end cap then fails `tsc` at the copy. The back-end stays the
authoritative check ([ADR-0019](0019-layered-user-text-sanitization.md)).

**The two generated files are `.ts`, not `.d.ts`.** The front-end sets
`"skipLibCheck": true`. That setting hides an unresolved name inside a `.d.ts`, and
the name becomes `any`. In a `.ts` file, the same error fails `tsc`. The ts-rs
derives stay `.d.ts`.

## Considered and rejected

- **One macro that routes and declares.** It would replace each `router_builder!`
  list, so all seven RPC modules would leave the blueprint.
- **A contract list in each `*_rpc.rs`.** It changes every RPC module, and the
  contract then has no one place to read.
- **Type the FullStack methods too.** #128 removes them, and the Comments do not
  reuse their RPC methods.
- **A typed member per method** (`post.list`, …). Each member only forwards, and
  `jediApi` is the one consumer.
- **Export the caps as values.** That is the first runtime import from
  `bindings/`, a folder outside `frontend/`.
- **Check the route list on both surfaces.** The authenticated check needs 12
  FullStack exceptions. There, `tsc` already rejects the first typed call to a
  method with no entry.

## Consequences

- A new Jedi RPC adds one `entry!` line. Until then, no typed function can call it.
- A method on the public router with no public entry fails the routing test.
- The routing test reads the router's `Debug` output, which is not a stable API. A
  format change fails the test. [ADR-0016](0016-poke-rule-typed-receipt.md) says
  the method map is private, "so a test cannot auto-discover a new mutation". The
  map is private, but its `Debug` output lists the names.
- The FullStack methods keep the untyped `rpcCall` until #128 removes them.
- Filters and paging reach the front-end only when a caller needs them (#176).
