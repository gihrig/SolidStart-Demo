# Run an in-browser Turso Database that syncs to the server (optional, on the Turso build)

_Status: proposed / deferred. This is the optional in-browser capability of the
Turso build introduced by [ADR-0012](0012-postgres-turso-db-swap-seam.md); the
back-end DB-swap seam does not depend on it. Planning seed:
[`backend/planning/Turso-in-browser.md`](../../backend/planning/Turso-in-browser.md)._

When the back-end is built with `--features turso` ([ADR-0012](0012-postgres-turso-db-swap-seam.md)),
the front-end may **optionally** run a local Turso Database in the browser and sync
it to the server — the "local in-browser db with sync to the server db" from #17.
This is a distinct architectural decision from the server seam (offline-first
client, an explicit sync protocol, and browser-platform constraints), so it gets its
own ADR and its own issue and is **gated behind the Turso build**.

## Shape (from the planning seed)

- **Browser embedded DB** via [`@tursodatabase/database-wasm`](https://www.npmjs.com/package/@tursodatabase/database-wasm),
  stored in the browser's Origin Private File System (OPFS) so data persists across
  sessions. All reads/writes are local and offline-capable.
- **Sync** via [`@tursodatabase/sync-wasm`](https://www.npmjs.com/package/@tursodatabase/sync-wasm)
  (Vite `/vite` import path): the same local-first API plus explicit `push()` (send
  local changes as logical CDC) and `pull()` (fetch/apply remote changes). This is the
  modern **Turso Sync** approach; older libSQL "Embedded Replicas" are superseded for
  new projects.

## Open question — what the browser syncs *to*

`sync-wasm` targets a **Turso/libSQL sync endpoint**, not a raw Postgres/`sqlx` DB.
The planning seed shows the `url` as `libsql://…turso.io` or a local
`tursodb … --sync-server` (`http://localhost:8080`). So the server side must run a
sync endpoint; the candidates, to be decided at design time, are:

- **Turso Cloud** (`libsql://…`) — hosted, needs an auth token.
- **A local `tursodb --sync-server`** — a separate process, keeps dev fully local
  (no cloud account), but is extra infra alongside the embedded back-end DB.
- **The Rust back-end itself** exposing a sync endpoint — only if the `turso` server
  story supports it; otherwise the sync server is a component beside the app's own
  Turso file.

This choice determines whether "sync to the server db" is one Turso file or an
embedded-DB-plus-sync-server pair, and is the first thing the implementing issue must
resolve.

## Constraints

- **COOP/COEP headers required** (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`) because of `SharedArrayBuffer`. This
  affects the SolidStart/Vinxi dev and prod header config.
- **Browser auth tokens are non-secret** — visible to clients; use limited-scope or
  demo tokens only.

## Consequences

- Purely additive and optional: with sync off, the Turso build is just the embedded
  server DB of ADR-0012; with sync on, the client gains an offline-first local DB.
- Pulls a client-side data layer and a sync/conflict model into the front-end that
  did not exist before — sequenced **after** the ADR-0012 seam and the Jedi domain
  land, on the back-end-expansion track.
