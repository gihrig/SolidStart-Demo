# Row-scoped authorization lives in a per-Bmc `access_scope` hook

The back-end threads a `Ctx` (caller identity + scope) through every model
function but ignores it on reads, updates, and deletes: `owner_id` is written
once on create and never read back, so every read/mutate keys on `id` alone. Any
authenticated User can `get`/`update`/`delete` any entity by guessing its id, and
`list` returns rows across all owners. `CONTEXT.md` already specifies the
ownership rules the back-end does not yet honor (a Conversation is owned by its
creating User; `OwnerOnly` is private; only the Owner may update). The landed
front-end filter fix ([ADR-0005](0005-rpc-mutations-via-rpcaction.md) surface,
`conv.list`) was a symptom — a client-side filter is not a security boundary.

This ADR records **where authorization lives** in the back-end. The first
enforcing slice (the Owner boundary for `Conv`, `ConvMsg`, `Agent`) is specified
in `backend/docs/ar/c01-owner-scope-design.md`; this ADR distills the durable
seam that slice establishes and that later slices extend. No prior ADR
(0001–0013) governs back-end authorization; [ADR-0011](0011-jedi-backend-domain-contract.md)
defines *what entities exist*, this one defines *who may touch them*.

## Decisions

**Authorization is a per-Bmc row-scoping predicate, applied in `base`.** The
`DbBmc` trait gains one hook returning an optional SQL condition:

```rust
pub enum Access { Read, Write }

fn access_scope(_ctx: &Ctx, _access: Access) -> Option<Condition> {
    None
}
```

The six `Ctx`-taking `base` functions (`get`, `list`, `count`, `update`,
`delete`, `delete_many`) AND the hook's `sea_query::Condition` into their query
after the existing `WHERE`. Reads pass `Access::Read`, writes pass
`Access::Write`. Default `None` leaves an entity unscoped, so entities opt in;
`User`, `ConvUser`, etc. are unchanged. This puts one enforcement seam in `base`
rather than scattering checks across RPC handlers.

**The hook, not the existing `has_owner_id()` flag.** `has_owner_id()`
(`base/mod.rs:67`, `default: false`) is a create-time stamping flag — a single
boolean that cannot express `owner_id = me OR kind = 'MultiUsers'`, and would
wrongly gate `Agent` (Admin-owned, but every User must read it). Ownership is a
predicate, not a boolean, so it needs a predicate-shaped hook. `has_owner_id()`
keeps its create-time job unchanged.

**Reads and writes scope asymmetrically.** `Access::Read` admits owner ∪ public
rows; `Access::Write` admits owner-only. An entity that is world-readable but
creator-mutable (e.g. `Agent`) expresses exactly that by returning `None` for
Read and an owner predicate for Write.

**Wrong owner is indistinguishable from a missing row.** A scope miss yields
`EntityNotFound`, never a distinct "forbidden": single-row `get` →
`fetch_optional` `None`; `update`/`delete` → affected count `0`. No existence
oracle leaks which ids exist to a caller not entitled to see them.

**Root bypass is centralized once, in `base`.** `root_ctx()` is `user_id: 0`
(`ctx/mod.rs`), and `Ctx::new` rejects `0`, so real logins are always non-root.
`base` skips scoping when `ctx.user_id() == 0`; individual hooks never re-check
root. Root is the system identity for seeding and internal calls — **not** a
logged-in Admin user.

## Considered and rejected

- **Extend `has_owner_id()` into the gate** — rejected: a boolean cannot express
  a `ConvKind`-aware predicate and mis-gates world-readable, Admin-owned Agents.
- **A distinguishable "forbidden" error** — rejected: it is an existence oracle;
  `EntityNotFound` on a scope miss reveals nothing.
- **Per-hook root checks** — rejected: duplicated bypass logic invites a hook
  that forgets it; centralizing in `base` makes root-safety structural.
- **Check the User *role* (`typ`) now** — rejected for this seam: the request
  `Ctx` carries only `user_id` (auth builds `Ctx::new(user.id)`, discarding
  `typ`). This ADR enforces the **Owner** boundary; role-based overrides are
  deferred to the privilege ACS (below).

## Consequences

- The front-end `owner_id` filter becomes a **view** filter (mine vs.
  all-visible), no longer a security boundary — kept, not removed.
- Existing model tests all use `root_ctx` (bypass), so proving scope needs a
  non-root two-user fixture; new tests assert wrong-owner → `EntityNotFound` at
  the Bmc, plus one cross-user HTTP case.
- Future authorization slices **extend this seam** rather than inventing another:
  - **`add_msg` post-permission** — the immediate next slice; a create-path
    "may I post here?" check that today's design does not cover. Create is
    unscoped, so an unentitled post inserts and then fails its `get_msg`
    read-back with `EntityNotFound` — persisted but reported as failed. Tracked
    in [#89](https://github.com/gihrig/SolidStart-Demo/issues/89).
  - **Admin (`typ = Sys`) delete override** on Conversations/Messages
    (`CONTEXT.md`) — needs `typ` on the auth context; belongs to the privilege
    ACS, and will read through `Access`/`access_scope`.
  - **Member reads** of another Owner's `OwnerOnly` Conversation — lands with
    the `ConvUser` Member feature (a stub today, so no regression).
- **`delete_many` is non-atomic under Write scope.** A mixed list of owned and
  scoped-out ids deletes the owned rows, then the count mismatch reports the whole
  call as `EntityNotFound` — with no surrounding transaction to roll back the
  partial delete. Close with a txn + rollback (Dbx already exposes
  `begin_txn`/`commit_txn`/`rollback_txn`), or a pre-count. Tracked in
  [#90](https://github.com/gihrig/SolidStart-Demo/issues/90).
- The candidate-02 per-row `conv_id` scaffolding is retired: a parent-conv
  subquery in `ConvMsgBmc`'s Read scope replaces it, so one mechanism does the
  job instead of two (detailed in the C01 design doc).
