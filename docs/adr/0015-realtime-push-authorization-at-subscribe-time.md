# Realtime push authorization lives at subscribe-time, reusing the read scope

The realtime Feed (`GET /ws`) pushes Events over one long-lived WebSocket. A
WebSocket has no auth for each message. If the server sends each Event to each
socket, a filter in the client is the only gate, and that is not a boundary.

## Decisions

- **The socket is authenticated at the upgrade.** `/ws` sits behind
  `mw_ctx_require`. The handler captures the caller's `Ctx` at the HTTP upgrade
  and keeps it for the life of the connection.
- **Authorization runs at subscribe time, not for each Event.** On `subscribe`,
  the server calls `Channel::authorize(ctx, mm)`. If it passes, the Channel goes
  into the connection's set. If it fails, the server ignores the request. A
  scoped Channel would authorize through the model read, so the row rule stays
  in [ADR-0014](0014-backend-row-scoped-authorization-seam.md)'s
  `access_scope`.
- **`authorize` matches each variant, with no `_` arm.** Today each Channel is
  authenticated-read. A new variant must still choose its rule, or the build
  fails. A `_ => true` would open a future scoped Channel to each socket.
  `authorize` keeps its `(ctx, mm)` arguments and its `async` for that case.
- **Fan-out is default-deny.** The send task forwards an Event only if its
  Channel is in the connection's set. A connection with no Subscription gets
  nothing.
- **A connection holds at most 16 Subscriptions.** The cap is checked before
  `authorize`, so a full connection runs no more authorizing reads. A request
  over the cap is ignored, like a refused one.
- **The set is shared by the two socket tasks.** The receive task writes it,
  and the send task reads it, through an `Arc<RwLock<HashSet<…>>>`.

## Considered and rejected

- **Authorize each Event at emit time.** It copies the row rule onto the push
  path, costs one check for each Event and socket, and forces each payload to
  carry its scope columns.
- **Subscribe each connection to each readable Channel.** It floods each socket
  with traffic that the view does not show.
- **Client-side filtering as the boundary.** The payload still reaches a
  client that must not read it.
- **Delete `authorize` while no Channel needs a scope.** A later scoped Channel
  would then have to build the seam again.

## Consequences

- The client must send its Subscriptions again after each reconnect, or the
  socket goes quiet ([ADR-0028](0028-feed-subscriptions-by-channel.md)).
- A grant is cached for the life of the Subscription. If a scoped Channel can
  lose a reader mid-session, it needs a check at emit time, or an invalidation.
  No current Channel can.
- An anonymous `/ws` gets 401.
