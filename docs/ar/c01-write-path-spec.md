# C01 Write-Path Completion — Spec (#89 + #90)

**Slice:** the two write-path follow-ups to C01 (owner-scoped read/write seam).
**Refs:** [ADR-0014](../../../docs/adr/0014-backend-row-scoped-authorization-seam.md),
`c01-owner-scope-design.md` §7.2 (add_msg) & §8 (verification), issues #89 #90.
**Out of scope:** #88 (C03/ADR-0015 realtime hardening — different ADR, WS + frontend).

---

## 1. Why these two together

C01 (ADR-0014) scoped **reads** at the model seam and added an owner **Write**
scope (`owner_id = me`). Two write paths were left incoherent by that change and
are documented as the immediate next slices in `c01-owner-scope-design.md` §7.2:

- **#89** — `add_msg` create-path has no "may I post here?" check.
- **#90** — `delete_many` under the new Write scope can partial-delete and mask it
  as a failure, with no transaction.

Both live in `lib-core/src/model/`, both are small and surgical, and they touch
**non-overlapping files** — one spec, two independent commits.

| Slice | Seam (file) | Change |
| ----- | ----------- | ------ |
| #89 | `model/conv.rs` `ConvBmc::add_msg` | add a parent-conv read check before insert |
| #90 | `model/base/crud_fns.rs` `delete_many` | wrap scoped delete in a transaction |

---

## 2. Slice A — #89: post-permission on `add_msg`

### Problem (grounded)

`add_conv_msg` → `ConvBmc::add_msg` → `base::create::<ConvMsgBmc, _>`:

- `add_msg` calls `base::create` with no authorization (`conv.rs:200`).
- `base::create` applies no `access_scope` — create is unscoped (`crud_fns.rs:28-56`).
- `ConvMsgBmc`'s `Access::Write` is `None` (`conv_msg.rs:125`).

So any authenticated User inserts a `ConvMsg` into **any** conv by id. After C01
the read-back then fails: `add_conv_msg` does `get_msg` immediately after
(`conv_rpc.rs:42-43`), which is now Read-scoped and returns `EntityNotFound` for a
conv the caller may not read — **the RPC errors and never broadcasts, but the row
is already persisted** and the owner sees it on the next `list_msgs`.

### Fix

Enforce at the model seam (consistent with ADR-0014): in `ConvBmc::add_msg`,
authorize the **parent conv read** before inserting. Reuse the exact predicate
`base::get::<ConvBmc, Conv>` applies — `ConvBmc::access_scope(_, Read)` =
`owner_id = me OR kind = 'MultiUsers'` (`conv.rs:163-175`). On a miss it already
returns `EntityNotFound { entity, id }` (`crud_fns.rs:126`) — no existence oracle.

`add_msg` (`conv.rs:194-203`) becomes:

```rust
pub async fn add_msg(
    ctx: &Ctx,
    mm: &ModelManager,
    msg_c: ConvMsgForCreate,
) -> Result<i64> {
    // Post-permission: may post iff may read the parent conv (same predicate
    // as ConvBmc::get). Miss → EntityNotFound, before any insert. (#89)
    let conv_id = msg_c.conv_id;
    let _ = base::get::<ConvBmc, Conv>(ctx, mm, conv_id).await?;

    let msg_i = ConvMsgForInsert::from_msg_for_create(ctx.user_id(), msg_c);
    let conv_msg_id = base::create::<ConvMsgBmc, _>(ctx, mm, msg_i).await?;

    Ok(conv_msg_id)
}
```

(`conv_id` is read first because `from_msg_for_create` moves `msg_c` — `conv.rs:199`.)

### Acceptance criteria

- User B `add_conv_msg` → A's `OwnerOnly` conv → `EntityNotFound`, **no row
  inserted** (A's `list_msgs` count unchanged before/after).
- User B `add_conv_msg` → A's `MultiUsers` conv → `Ok` (inserted + broadcast).
- Owner posts to own `OwnerOnly` → `Ok`.
- `root_ctx` (user_id 0, scope bypassed — `crud_fns.rs:21-22`) → `Ok`.

### Cost / note

Adds one `SELECT` (the parent-conv read) per post. Accepted — it is the same read
the RPC already does at `get_msg`; net effect is one extra read moved *before* the
insert. Subscribe-path read-DoS is a separate concern tracked in #88.

---

## 3. Slice B — #90: atomic `delete_many` under Write scope

### Problem (grounded)

`delete_many` (`crud_fns.rs:323-361`): a scoped `DELETE ... WHERE id IN (..)
AND owner_id = me` (`:343-345`), then a count check — `if result != ids.len()`
→ `EntityNotFound` (`:353-357`). **No transaction.** So `ids = [own, other]`
deletes `own` (owned) but not `other` (scoped out); `result (1) != len (2)` →
returns `Err`, yet `own` is already gone. The Write scope silently turned a
mixed-ownership delete into a partial delete masked as an error.

### Fix

All-or-nothing via the existing Dbx transaction, mirroring the `create_user`
precedent (`user.rs:132-155`): `new_with_txn()` (`mod.rs:59-62`) builds a
`with_txn = true` Dbx; `begin_txn` errors on a non-txn Dbx (`dbx/mod.rs:70-72`),
so the passed-in `mm` (constructed `with_txn = false` — `mod.rs:55`) must be
upgraded first.

```rust
pub async fn delete_many<MC>(
    ctx: &Ctx,
    mm: &ModelManager,
    ids: Vec<i64>,
) -> Result<u64>
where
    MC: DbBmc,
{
    if ids.is_empty() {
        return Ok(0);
    }

    // Atomic: a scoped-out id must not leave an owned id partially deleted. (#90)
    let mm = mm.new_with_txn()?;
    mm.dbx().begin_txn().await?;

    let mut query = Query::delete();
    query
        .from_table(MC::table_ref())
        .cond_where(Expr::col(CommonIden::Id).is_in(ids.clone()));
    if let Some(scope) = scope_cond::<MC>(ctx, Access::Write) {
        query.cond_where(scope);
    }

    let (sql, values) = query.build_sqlx(PostgresQueryBuilder);
    let result = mm.dbx().execute(sqlx::query_with(&sql, values)).await?;

    if result as usize != ids.len() {
        mm.dbx().rollback_txn().await?;   // nothing deleted
        Err(Error::EntityNotFound { entity: MC::TABLE, id: 0 })
    } else {
        mm.dbx().commit_txn().await?;
        Ok(result)
    }
}
```

### Acceptance criteria

- User B (or A) `delete_many([own, other])` on a Write-scoped BMC (e.g. `ConvBmc`,
  Write = `owner_id = me` — `conv.rs:173`) → `EntityNotFound` **and `own` still
  present** (row count unchanged).
- `delete_many([own1, own2])`, both owned → `Ok(2)`, both gone.
- `delete_many([])` → `Ok(0)` (unchanged early return).
- `root_ctx` (no scope) `delete_many([a, b])` → `Ok(2)`.

### Risk / caveat

`new_with_txn()` opens a **fresh** Dbx on the same pool (`mod.rs:60`), independent
of any outer txn. No current caller wraps `delete_many` in an outer transaction,
so this matches `create_user` and is safe. If nested-txn callers appear later,
revisit (thread the existing txn instead of opening a new one). The rejected
lighter alternative — pre-count scoped ids then reject — still needs a txn to
close the TOCTOU window, so it buys nothing over this.

---

## 4. Shared test scaffolding

Both slices need the **non-root two-user fixture** from `c01-owner-scope-design.md`
§8 (existing model tests use `root_ctx`, which bypasses scope — e.g.
`conv.rs:238`). One fixture (User A owns an `OwnerOnly` + a `MultiUsers` conv, each
with messages; User B is a non-owner) covers both:

- **#89**: B posts to each of A's convs (deny `OwnerOnly` + assert no insert;
  allow `MultiUsers`).
- **#90**: B and A `delete_many` mixed-ownership id sets; assert atomicity.

Add one cross-user post/delete case to the in-process HTTP test
(`crates/services/web-server/src/app.rs`), matching the C01 integration pattern.

---

## 5. Sequencing

Independent files → either order. Suggested: **#90 first** (pure `base` change,
no domain coupling), then **#89** (depends only on the seam, not on #90). Two
commits, `cgs test` green after each:

1. `feat(backend): make delete_many atomic under owner Write scope (C01 #90)`
2. `feat(backend): enforce post-permission on add_msg (C01 #89)`

Close out with `/code-review` (Standards + Spec) over the branch diff before
merge; update ADR-0014 Consequences to mark both slices landed.
