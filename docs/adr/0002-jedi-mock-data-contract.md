# Jedi content is served by a back-end-faithful mock that doubles as the data contract

Jedi has no back-end yet, but its data model must both unblock front-end work and
be the shape a future back-end implements. We therefore serve Jedi content from a
normalized JSON mock behind an RPC-shaped async seam (`src/lib/jedi/jedi-api.ts`,
mirroring `src/lib/backend-rpc.ts`): components consume it via `createResource`
exactly as they would the live back-end, so the eventual swap to real RPC touches
only the seam, not the components.

The mock stores normalized collections (`users`, `posts`, `captions`,
`categories`, `comments`) in one `src/lib/jedi/data.json`; the seam joins
`owner_id`→author and returns author-embedded responses, and it is the single
trust boundary where every URL field passes through `sanitizeUrl`. **Top Photos**
and **Top Captions** are ranked views derived from Posts/Captions, not stored
lists. Selection and category filtering are deferred to issue #29.

## Considered and rejected

- **Static JSON imported synchronously** — rejected: components would skip the
  loading/error/Suspense surface the real back-end needs, and the later swap to
  live RPC would force a sync→async rewrite of every consumer.
- **Full contract mirror** (bigint-string ids, `cid/ctime/mid/mtime` audit
  columns on every row) — rejected: the UI reads none of it, so it adds noise
  without aiding front-end compatibility. Plain number ids and domain fields only;
  the back-end adds its standard audit columns by its existing convention.
- **Author denormalized onto every record** — rejected: duplicates author data
  and drifts; the seam joins from a single `users` source instead.
- **Tags as a concept separate from Category** — rejected: a Post's tags _are_ its
  Categories (many-to-many), so category filtering and the on-card chips share one
  entity. ("Cute" is added as a missing Category.)
