# AR C01 — Owner-scope at the read seam — Design spec

- **Status:** Reviewed and confirmed. **ready for agent.**
- **Source:** `docs/ar/architecture-review-20260818-223636.html`, candidate 01 ("Give the ownership invariant a home at the read seam").
- **Branch:** `arch-review-8-18` · **Drafted:** 2026-08-20
- **Scope of this slice:** enforce the **Owner** boundary at the model read/write seam for `Conv`, `ConvMsg`, and `Agent`. Deliberately narrower than the rust10x privilege ACS (see [Out of scope](#out-of-scope)).

---

## 1. Problem

The server threads a `Ctx` (caller identity + scope) through every model function, then ignores it on reads and deletes. `owner_id` is written once, on create (`base/utils.rs:11-12`), and never read back. Every read/mutate keys on `id` alone:

- `get` / `list` / `count` / `delete` / `delete_many` take `_ctx` and drop it (`base/crud_fns.rs:89,154,189,262,288`).
- `update` takes `ctx` but only to stamp `mid`/`mtime`; its `WHERE` is `id`-only (`base/crud_fns.rs:224-244`).

Consequences today:

- `get_conv(id)` returns **any** User's Conversation by guessed id.
- `list_conv_msgs` with a `conv_id` filter returns **any** Conversation's Messages, including private (`OwnerOnly`) ones (`web/rpcs/conv_rpc.rs:54-62`).
- `update_agent` / `delete_agent` are exposed to every authenticated User (`web/rpcs/agent_rpc.rs:12-13`), so any User can mutate/delete any Agent by id.

The front-end's landed **C1** filter fix was the _symptom_ (a client-side `conv.list` filter leak). This is the _root_: the server never scoped by Owner, so an absent or broken client filter silently widens the result set.

`CONTEXT.md` already specifies the rules the back-end does not yet honor:

- A Conversation is "owned by the Standard user who created it" (`CONTEXT.md:64`).
- `OwnerOnly` is private — "only its Owner and invited Members may read or post"; `MultiUsers` is public — "any User may read and post, without invitation" (`CONTEXT.md:87-88`).
- "only its Owner **or an Admin user** may delete Messages or the whole thread" (`CONTEXT.md:72`).
- An Agent is Admin-owned but "a User selects one and converses within it" (`CONTEXT.md:54,72`).
- A Member is a `ConvUser` row (`CONTEXT.md:76-79`); `ConvUser` is currently a stub — "not implemented yet" (`model/conv_user.rs`), so **zero Members exist**.

---

## 2. Decision log

Every decision below was settled in the grilling session (Q1–Q11).

| #   | Decision                           | Choice                                                                                                                                               |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Conv read predicate                | `owner_id = me OR kind = 'MultiUsers'` (Member deferred — no Members exist, so no regression)                                                        |
| Q2  | Mechanism / gate                   | A **per-Bmc scope hook**, not the existing `has_owner_id()` flag (which would break Agent and can't express `ConvKind`)                              |
| Q3  | Wrong-owner error                  | `EntityNotFound` — indistinguishable from a missing row (no existence oracle)                                                                        |
| Q4  | Admin/system bypass                | **root context only** (`user_id == 0`); real-Admin (`typ = Sys`) moderation deferred                                                                 |
| Q5  | Op coverage + read/write asymmetry | **All six** ctx-taking fns; **read-scope** (owner ∪ public) on `get`/`list`/`count`, **write-scope** (owner-only) on `update`/`delete`/`delete_many` |
| Q6  | Messages in scope                  | Yes — `ConvMsg` reads scoped via a **parent-conv subquery**                                                                                          |
| Q7  | Hook signature                     | **One** method `access_scope(ctx, Access)` (`Access = Read \| Write`); root-bypass centralized once in `base`                                        |
| Q8  | Candidate 02 scaffolding           | **Retire** it (verified no live caller)                                                                                                              |
| Q9  | `add_msg` post-permission          | **Out** of C01 — it is the explicit _next_ slice                                                                                                     |
| Q10 | Verification                       | Bmc matrix with a non-root two-user fixture **+ one** cross-user HTTP case                                                                           |
| Q11 | Agent Write scope                  | Read `None` (all Users see Agents), **Write `owner_id = me`** (creator-only mutation)                                                                |

---

## 3. Mechanism — one seam

### 3.1 The hook

Add to `DbBmc` (`model/base/mod.rs`):

```rust
pub enum Access { Read, Write }

pub trait DbBmc {
    // ...existing: TABLE, table_ref, has_timestamps, has_owner_id...

    /// Optional row-scoping predicate for this entity.
    /// Returns None to leave the operation unscoped.
    fn access_scope(_ctx: &Ctx, _access: Access) -> Option<Condition> {
        None
    }
}
```

- `Condition` is `sea_query::Condition`, already used by `base::list` (`base/crud_fns.rs:171-175`), so ANDing a hook-supplied condition is idiomatic.
- The default `None` means every entity is unscoped unless it opts in — no change to `User`, `ConvUser`, etc.

### 3.2 Application in `base`

In each of the six ctx-taking functions, after the existing `WHERE`, apply the scope:

- **Reads** — `get`, `list`, `count`: call `MC::access_scope(ctx, Access::Read)`.
- **Writes** — `update`, `delete`, `delete_many`: call `MC::access_scope(ctx, Access::Write)`.
- `first` inherits automatically — it delegates to `list` (`base/crud_fns.rs:149`).
- AND the returned `Condition` into the query via `query.cond_where(cond)` (reads) or `query.and_where(...)` alongside the id predicate (single-row writes).

### 3.3 Root bypass — once, in `base`

The bypass lives in one place, not in every hook:

```text
let scope = if ctx.user_id() == 0 { None } else { MC::access_scope(ctx, access) };
```

`root_ctx()` is `user_id: 0` (`ctx/mod.rs:20-25`); real logins are `user_id != 0` (`Ctx::new` rejects 0, `ctx/mod.rs:27-36`). The root context is the system identity used for seeding and internal calls — **not** a logged-in Admin user.

### 3.4 Error semantics

- Single-row `get` with a non-matching scope → `fetch_optional` yields `None` → `EntityNotFound` (`base/crud_fns.rs:109`).
- `update` / `delete` with a non-matching scope → affected count `0` → `EntityNotFound` (`base/crud_fns.rs:252,278`).
- `delete_many` deleting fewer ids than requested → `EntityNotFound` (`base/crud_fns.rs:312-316`) — consistent with Q3.

---

## 4. Per-entity scope

| Bmc                             | `Access::Read`                                                                | `Access::Write`                |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| `ConvBmc`                       | `owner_id = me OR kind = 'MultiUsers'`                                        | `owner_id = me`                |
| `ConvMsgBmc`                    | `conv_id IN (SELECT id FROM conv WHERE owner_id = me OR kind = 'MultiUsers')` | `None` — no direct CRUD        |
| `AgentBmc`                      | `None` — every User reads Agents                                              | `owner_id = me` — creator-only |
| default (`User`, `ConvUser`, …) | `None`                                                                        | `None`                         |

Notes:

- `ConvBmc::has_owner_id()` and `AgentBmc::has_owner_id()` are already `true` (`model/conv.rs:159-161`, `model/agent.rs:77-79`); they keep stamping `owner_id` on create.
- `ConvMsg` has **no** `owner_id` — only `conv_id` + `user_id` (author) (`model/conv_msg.rs:18-45`) — so its scope references the parent `Conv`, not an own column.
- `ConvMsgBmc` has no generated CRUD (`model/conv_msg.rs:124-127`); only its `list` path (`ConvBmc::list_msgs`) and internal `get_msg` are reachable, so only `Read` needs a condition.
- Agent `Read = None` is the whole reason Agent was excluded from a `has_owner_id()`-gated predicate (Q2): a Standard user must see Admin-owned Agents to converse.

---

## 5. Retire candidate 02 (dead scaffolding)

Verified: the future-ACS scaffolding has **no live caller** — references appear only in its own definition/impls and in `docs/`. Delete:

- `ConvScoped` trait + `conv_id()` (`model/conv.rs:27-29`) and its three impls (`model/conv_msg.rs:41-45,53-57,93-97`), plus the `use ...ConvScoped` import (`model/conv_msg.rs:2`).
- `Ctx.conv_id` field, `add_conv_id()`, `conv_id()` accessor (`ctx/mod.rs:15,39-43,52-55`).
- The `get_msg` TODO block (`model/conv.rs:209-211`). Afterward `get_msg` is a thin `base::get` passthrough — now auto-scoped by the `ConvMsg` `Read` hook.
- Doc references in `crates/libs/lib-core/docs/ctx.md` and `.../docs/images/ctx.svg`.

The Q6 subquery needs no per-row `conv_id` threading, so keeping the scaffolding would mean two mechanisms for one job. Retiring it resolves candidate 02 as a side effect of C01.

---

## 6. The User ↔ Admin relationship (why this slice enforces _Owner_, not _role_)

C01 enforces the **Owner** boundary. It does **not** check the User type. The request `Ctx` carries only `user_id` (`ctx/mod.rs:11-16`); the auth path loads a `UserForAuth` that has no `typ` (`model/user.rs:65-72`) and builds `Ctx::new(user.id)` (`middleware/mw_auth.rs:86`), discarding role. Only the full `User` struct carries `typ` (`model/user.rs:40`).

Reading `CONTEXT.md` precisely, the Admin user's **only** elevated power over these entities is the **delete override** on a Conversation and its Messages (`CONTEXT.md:72`). It grants the Admin user **no** extra power to _read_ an `OwnerOnly` Conversation (only Owner + Members read it — `CONTEXT.md:88`), **no** power to _update_ a Conversation (only its Owner may — `CONTEXT.md:72`), and **no** extra power over Agents beyond ownership.

So the User-to-Admin difference is narrow, and **C01 defers exactly that one override.** After C01:

| Action                           | The Owner | Any other User (C01 today) | `CONTEXT.md` rule                                      |
| -------------------------------- | --------- | -------------------------- | ------------------------------------------------------ |
| Agent — read                     | yes       | yes                        | every User reads Agents                                |
| Agent — update / delete          | yes       | no                         | the Owner (an Admin user)                              |
| Conversation `OwnerOnly` — read  | yes\*     | no                         | the Owner and Members                                  |
| Conversation `MultiUsers` — read | yes       | yes                        | any User                                               |
| Conversation — update            | yes       | no                         | the Owner                                              |
| Conversation — delete            | yes       | no                         | the Owner **or an Admin user**                         |
| Message — read (in `OwnerOnly`)  | yes\*     | no                         | the Owner and Members                                  |
| Message — post (create)          | yes       | **yes — not checked**      | `OwnerOnly` = Owner + Members; `MultiUsers` = any User |

\* the Owner **or a Member** of that Conversation (Members not built yet). The root context (system) does every action; it is not a logged-in Admin user.

The two cells that differ from the `CONTEXT.md` rule today are **Conversation — delete** (Admin override missing) and **Message — post** (unchecked). Both are deferred; see below.

---

## 7. Out of scope (documented gaps — deferred, not silent)

1. **Admin (`typ = Sys`) delete override** on Conversations and Messages (`CONTEXT.md:72`). Needs `typ` on `UserForAuth` + a role field on `Ctx` (touches `Ctx::new` and every call site). Belongs to the privilege ACS.
2. **`add_msg` post-permission** — the _immediate next slice_, not open-ended. `add_conv_msg → ConvBmc::add_msg → base::create` has no "may I post here?" check (`model/conv.rs:180-189`, `web/rpcs/conv_rpc.rs:42`), so any User posts to any Conversation by id. ⚠️ **Interaction with this slice:** with message-read scoped (§4) but posting unchecked, an illicit post to an unreadable Conversation **inserts, then fails its `get_msg` read-back with `EntityNotFound`** (`web/rpcs/conv_rpc.rs:42-43`). This surfaces the incoherence and motivates the next slice.
3. **Member reads** of another Owner's `OwnerOnly` Conversation. `ConvUser` is a stub (zero Members), so no regression today; lands with the Member feature.
4. **Create-time role check.** `CONTEXT.md` says an Admin user owns Agents and a Standard user owns Conversations; C01 does not verify the creator's type at create — it records the creator as Owner.

---

## 8. Verification plan (Q10)

Every existing model test uses `root_ctx` (bypasses scope) — e.g. `model/conv.rs:238`, `model/agent.rs:111`. Proving C01 needs a **non-root two-user fixture**.

**Bmc-level matrix** — User A owns an `OwnerOnly` and a `MultiUsers` Conversation (each with Messages):

- B `get` / `update` / `delete` A's `OwnerOnly` conv → `EntityNotFound`.
- B `get` A's `MultiUsers` conv → `Ok`.
- B `list` convs → excludes A's `OwnerOnly`, includes `MultiUsers`.
- B `list_msgs` on A's `OwnerOnly` → empty (subquery excludes); on `MultiUsers` → returns rows.
- B `update` / `delete` A's Agent → `EntityNotFound`; B `get` / `list` Agent → `Ok`.
- `root_ctx` still sees everything (bypass).

**Integration** — one cross-user case in the in-process HTTP test (`crates/services/web-server/src/app.rs`).

This realizes the AR's promised "wrong Owner → `EntityNotFound`, assertable at the Bmc."

---

## 9. Files to change

| File                                                             | Change                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `crates/libs/lib-core/src/model/base/mod.rs`                     | Add `Access` enum + `access_scope` default on `DbBmc`                        |
| `crates/libs/lib-core/src/model/base/crud_fns.rs`                | Root gate + apply `access_scope` in the six fns                              |
| `crates/libs/lib-core/src/model/conv.rs`                         | `ConvBmc::access_scope`; delete `ConvScoped` + `get_msg` TODO                |
| `crates/libs/lib-core/src/model/conv_msg.rs`                     | `ConvMsgBmc::access_scope` (Read subquery); drop `ConvScoped` impls + import |
| `crates/libs/lib-core/src/model/agent.rs`                        | `AgentBmc::access_scope` (Write only)                                        |
| `crates/libs/lib-core/src/ctx/mod.rs`                            | Drop `conv_id` field + `add_conv_id` + `conv_id()`                           |
| `crates/libs/lib-core/docs/ctx.md`, `.../docs/images/ctx.svg`    | Drop scaffolding references                                                  |
| `crates/libs/lib-core/src/model/conv.rs`, `.../agent.rs` (tests) | Non-root two-user fixtures + matrix                                          |
| `crates/services/web-server/src/app.rs`                          | One cross-user HTTP case                                                     |
| `docs/ar/architecture-review-20260818-223636.html`               | Mark C01 landed (per the `c15ea84` pattern)                                  |

---

## 10. Non-decision note

Once the server enforces scope, the front-end's `owner_id` filter (the landed C1 fix) becomes a **view** filter (mine vs. all-visible), no longer a security boundary. Keep it — a User still needs it to ask for "only my Conversations" rather than "everything I may see."

---

## 11. No ADR conflict

No ADR (0001–0013) governs back-end authorization. These changes enforce access rules `CONTEXT.md` already specifies but the back-end does not yet honor.
