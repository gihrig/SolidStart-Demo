# Run an in-browser Turso Database that syncs to the server (optional, on the Turso build)

_Status: Proposed_

Origin: #17

On the Turso build ([ADR-0012](0012-postgres-turso-db-swap-seam.md)), the
front-end can run a local Turso Database in the browser and sync it to the
server. This is an offline-first client with its own sync protocol. So it has
its own ADR, and the server seam does not depend on it. The planning notes are
in `backend/planning/Turso-in-browser.md`.

## Decisions

- **The browser database is `@tursodatabase/database-wasm`.** It stores data in
  the Origin Private File System (OPFS), so data persists across sessions. All
  reads and writes are local.
- **Sync is `@tursodatabase/sync-wasm`.** `push()` sends local changes, and
  `pull()` applies remote changes.
- **The feature is optional.** With sync off, the Turso build is the server
  database of ADR-0012 only.

## Open question: the sync target

`sync-wasm` syncs to a Turso or libSQL sync endpoint, not to Postgres. The
candidates are:

- **Turso Cloud** (`libsql://…`): hosted, and it needs an auth token.
- **A local `tursodb --sync-server`:** fully local, but one more process.
- **The Rust back-end:** only if the `turso` server side supports a sync
  endpoint.

The first implementing issue must choose one.

## Consequences

- The front-end needs `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`, for `SharedArrayBuffer`. That
  changes the dev and production header config.
- A browser auth token is visible to each client. Use only a limited-scope
  token.
- The front-end gains a client data layer and a conflict model. This work comes
  after the ADR-0012 seam.
