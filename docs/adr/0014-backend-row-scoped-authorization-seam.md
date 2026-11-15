# Row-scoped authorization lives in a per-Bmc `access_scope` hook

Each model function takes a `Ctx`, the caller's identity. Without a row scope,
any logged-in User could edit or delete any Post or Comment by its id. A filter
in the client is not a security boundary.

## Decisions

- **Authorization is a row predicate for each Bmc, applied in `base`.** The
  `DbBmc` trait has one hook:

  ```rust
  pub enum Access { Read, Write }

  fn access_scope(_ctx: &Ctx, _access: Access) -> Option<Condition> {
      None
  }
  ```

  Each scoped `base` function (`get`, `list`, `count`, `update`, `delete`,
  `delete_many` and their kin) adds the hook's `Condition` to its `WHERE`.
  Reads pass `Access::Read`, and writes pass `Access::Write`. The default `None`
  leaves an entity unscoped, so each entity opts in.
- **Reads and writes scope apart.** A Post, a Caption and each Comment return
  `None` for `Read`, so each logged-in User reads them. They return
  `owner_id = me` for `Write`, so only the Owner edits or deletes.
- **A wrong Owner looks like a missing row.** A scope miss gives
  `EntityNotFound`, never "forbidden". A `get` finds no row, and an `update` or
  `delete` changes 0 rows. So a caller learns nothing about ids it cannot see.
- **`delete_many` is atomic.** It runs in a transaction. If one id is out of
  scope, the count does not match, and nothing is deleted.
- **The root bypass is in one place.** `root_ctx()` has `user_id` 0, and
  `Ctx::new` rejects 0, so a login is never root. `base` skips the scope for
  root; no hook checks root again. Root is the system identity for seeding and
  internal calls, not an Admin.

## Considered and rejected

- **Use the `has_owner_id()` flag as the gate.** It is a boolean for the create
  step. It cannot express a predicate such as "Owner, or a public row".
- **A separate "forbidden" error.** It tells a caller which ids exist.
- **A root check in each hook.** One hook that forgets it opens a gap.
- **Check the User role now.** `Ctx` carries only `user_id`. Admin rules wait
  for the privilege system (#181), which will read through `access_scope`.

## Consequences

- A test of a scope needs two non-root Users. Model tests that use `root_ctx`
  prove nothing about the scope.
- A new authorization rule extends this hook. It does not add a second seam.
