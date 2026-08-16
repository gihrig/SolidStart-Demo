> _Planning seed for [ADR-0013](../../docs/adr/0013-in-browser-turso-server-sync.md)
> — the optional in-browser Turso Database + server sync on the Turso build
> ([ADR-0012](../../docs/adr/0012-postgres-turso-db-swap-seam.md)). This note is the
> research; the decision, constraints, and the open "what does it sync to" question
> live in ADR-0013._

## Turso embedded database in Rust

[turso](https://crates.io/crates/turso) is the next evolution of SQLite: A high-performance, SQLite-compatible database library for Rust

## Turso supports an embedded database that runs in the browser

Turso in the browser (via WebAssembly) and can sync bidirectionally with a Turso instance on the server (Turso Cloud or a self-hosted/local sync server).

### Key pieces

- **Browser embedded DB**: Use [@tursodatabase/database-wasm](https://www.npmjs.com/package/@tursodatabase/database-wasm) (or the Vite-friendly subpath). It stores the database in the browser’s Origin Private File System (OPFS) so data persists across sessions. All reads/writes are local and offline-capable.
- **Sync in the browser**: Use the dedicated [@tursodatabase/sync-wasm](https://www.npmjs.com/package/@tursodatabase/sync-wasm) package (again with a `/vite` import path in Vite projects). It provides the same local-first API plus explicit `push()` and `pull()` methods.

### How sync works

- Reads and writes happen against the **local** database file (fast, works offline).
- Call `push()` to send local changes (as logical mutations / CDC) to the remote Turso instance.
- Call `pull()` to fetch and apply remote changes.
- On first connect the local DB is typically bootstrapped from the remote. You can also run a local sync server with the Turso CLI (`tursodb ... --sync-server`) for fully local development with no cloud account.

### Example (browser / Vite)

```js
import { connect } from "@tursodatabase/sync-wasm/vite";

const db = await connect({
  path: "local.db", // stored in OPFS
  url: "libsql://your-db.turso.io", // or http://localhost:8080 for local sync server
  authToken: "...", // required for Turso Cloud; not needed for local server
  longPollTimeoutMs: 5000, // optional
});

// Local writes
await db.exec("INSERT INTO notes VALUES ('n1', 'hello')");

// Sync when online
await db.push();
const changed = await db.pull();
```

### Important notes

- Requires COOP/COEP headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) because of SharedArrayBuffer usage.
- Auth tokens used in the browser are visible to clients—treat them as non-secret (e.g., use limited-scope or demo tokens).
- This is the modern **Turso Sync** approach (local-first, explicit push/pull, logical CDC). Older libSQL “Embedded Replicas” still exist but Turso recommends the new Sync packages for new projects.

Official examples and docs: look for the `sync-wasm-vite` example in the Turso repo and the Turso Sync / browser sections on docs.turso.tech.
