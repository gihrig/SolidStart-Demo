# The back-end follows the rust10x blueprint; code the blueprint lacks goes into the libs

The back-end started from `rust10x/rust-web-app`. Upstream updates apply cleanly
only where the code keeps the blueprint's shape.

## Decisions

- **Where the blueprint has a shape, keep it.** The login handler keeps its
  inline orchestration. The `router_builder!` lists stay as they are.
- **Where the blueprint has no shape, the service stays thin.** The blueprint
  has no realtime layer. So the Feed contract (`Channel`, `WsEvent`) lives in
  `lib-core::realtime`, beside the other exported types. The hub, the socket
  and the Poke rule live in `lib-web::ws`. The service only mounts the route.

## Considered and rejected

- **Extract a `login()` use-case.** Its test still needs the database, and the
  HTTP test already covers the flow.
- **Keep the Feed in the service crate.** No blueprint reason keeps it there.
- **A separate `lib-ws` crate.** `lib-web` already has each dependency it needs.

## Consequences

- Future architecture reviews must not suggest a login seam or an inline Feed.
