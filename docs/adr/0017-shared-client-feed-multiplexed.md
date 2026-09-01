# One client Feed, shared across view-models

The front-end **Feed** (`CONTEXT.md`) is the one live stream a client receives
Conversation Events on. But the client opened it twice. Two view-models each
called `useWebSocket` themselves — the Conversations workspace
(`lib/conversationWorkspace.ts`) and the message panel (`lib/createConvMessages.ts`,
via `components/MessagePanel.tsx`). Each call dials `GET /ws` on mount, so an
authenticated tab held two live sockets, each with its own reconnect and back-off
machinery. `MessagePanel` always mounts, so the second socket opened even before a
Conversation was selected.

This ADR records making the Feed singular: one socket per client, shared by every
view-model, created once at the authenticated boundary.

## Decisions

**One Feed, created at the authenticated boundary.** `createFeed()`
(`lib/websocket.ts`) owns one socket, its reconnect/back-off state, and the
desired-subscription set. `routes/fullstack.tsx` creates it inside the
authenticated subtree and injects it into both view-models through the `feed?`
seam they already accept. It lives for the session — mount to logout — matching the
socket's existing "only inside the authenticated app" lifetime.

**The seam stays a factory; each consumer gets its own view.** `createFeed`
returns a `MessageFeedFactory`. Each `factory(options)` registers that consumer's
callbacks and returns a per-consumer `MessageFeed` view. `useWebSocket` is now a
one-consumer shortcut over `createFeed`, kept as the default (`?? useWebSocket`)
for a view-model used standalone. The seam type is unchanged, so every consumer
test injects the same factory as before.

**Callbacks fan out through a registry.** One socket's `onmessage` calls the
matching callback on *every* registered consumer. The two callback sets are
disjoint today (`onAgentUpdate`/`onConvUpdate` on the workspace,
`onConvMsg`/`onError` on the messages view), and each consumer keeps its own guard
(e.g. the `conv.id === convId` match). No consumer state moves to the boundary.

**Subscriptions are per-holder refcounted.** Each view tracks its own held
Channels. The shared Feed counts holders per Channel and tells the server only at
the edges: one `subscribe` at the first holder, one `unsubscribe` at the last. A
view's cleanup releases only what it held. Channels are disjoint today (`agents` +
`convs` on the workspace, `conv:{id}` on the messages view), so the refcount is
future-proofing — but it is the correct shared-socket contract, so an unsubscribe
can never cut a Channel another view still holds.

## Considered and rejected

- **Keep one socket per view-model** (the status quo). Rejected: it contradicts the
  glossary's singular Feed and pays for two sets of reconnect/back-off state and two
  connections per client.
- **Inject one `MessageFeed` instance** (not a factory). Rejected: a `MessageFeed`
  instance carries no callbacks — they live on `MessageFeedOptions`, passed at
  construction. One instance cannot hold two view-models' different callbacks, and
  it would change the seam and every consumer test.
- **No refcount** — reuse the socket's `desired` map as-is. Rejected: it is safe
  only while Channels stay disjoint; the day two views share a Channel, one view's
  unsubscribe silently kills the other's.
- **Call-count refcount** — count subscribe calls, not holders. Rejected: it
  miscounts a consumer that subscribes the same Channel twice. As a model for more
  complex apps, per-holder is the pattern worth copying.

## Consequences

- **Compatible with ADR-0015.** One connection still subscribes per Channel and is
  authorized per Channel at subscribe-time; sharing the socket does not widen the
  push scope. One caveat: ADR-0015 caps a connection at 16 subscriptions, and all
  consumers now share that one connection's cap. This app uses three Channels, so
  the cap is not close.
- **Interfaces and consumer tests are unchanged.** `MessageFeed`,
  `MessageFeedFactory`, and the `feed?` seam are identical. The change is ~20 lines
  in `lib/websocket.ts` plus one `feed` prop threaded
  `fullstack.tsx → WorkspaceLayout → MessagePanel`.
- **Fewer connections for #91.** Server-side connection rate-limiting (#91,
  "Realtime hardening II") now sees one connection per client, not two.
- **Complements the front-end `Channel` mirror** (arch-review Candidate 3): both
  sharpen the same realtime seam on the front-end.
