# The back-end owns the Jedi domain; the mock becomes its fixture

Today the Jedi photo-and-caption domain is served entirely by a front-end mock
that was purpose-built to double as the back-end's data contract
([ADR-0002](0002-jedi-mock-data-contract.md)). #17 makes that contract real: the
back-end takes ownership of the Jedi domain as first-class rust10x entities,
exported to the front-end via ts-rs exactly as the Conversations domain already is
([ADR-0003](0003-entity-identity-number-at-barrel.md)). The mock `data.json`
becomes the fixture/seed. Bindings are regenerated once the back-end domain is
complete; the front-end swaps mock→real behind its existing seam, slice by slice.

The new entities: **Post, Caption, Category, Comment, PostLike, CaptionLike,
Hero**, alongside the existing, unified **User**. `Top Photos` and `Top Captions`
stay **derived views** (ordered by like count), not stored tables.

## Decisions

**Like is a first-class entity, not a stored counter.** Two tables —
`post_like` and `caption_like` — each `{ owner_id, target_id, ctime }` with
`unique(owner_id, target_id)` so a toggle is idempotent (at most one Like per User
per target). A Post's or Caption's like count is **derived by counting rows**, not
stored; the front-end seam already returns it as a number, so components are
unaffected. Two tables (rather than one polymorphic FK) matches the rust10x
BMC-per-entity pattern.

**`Category.icon` is an opaque string the back-end never interprets.** The
back-end `Category = { id, name, icon: String }`; `icon` is an opaque key. The
front-end maps that key to its `IconName` union with a fallback. This keeps the
taxonomy fully back-end-owned (ready for a future dynamic/admin-managed category
set) while keeping the front-end type honest at the barrel — the same philosophy
as [ADR-0003](0003-entity-identity-number-at-barrel.md).

**Hero is a back-end-owned singleton, edited by an Admin user.** `Hero =
{ title, subtitle, cta_text, cta_href, background_image }` is a single mutable row
an Admin user edits to change home branding — not user-generated and not
`owner_id`-owned like Posts. The front-end renders it through the seam as a
sanitized `HeroView` ([ADR-0006](0006-safeurl-brand-enforces-sanitize-boundary.md)).

**The Jedi "profile" is the unified User.** The mock's `JediProfile { userId }` is
the authenticated User — the same identity that owns Conversations _and_
Posts/Captions/Likes. One back-end `User` entity spans both surfaces, completing
the convergence set out in [ADR-0007](0007-consolidate-jedi-shell-unified-identity.md).

## Considered and rejected

- **Like as a stored counter** (`like_count` column, no per-Like rows) — rejected:
  the domain ranks Captions by their own Likes (a competition), and #17's
  e-commerce direction wants per-user endorsement records. A counter cannot answer
  "did this User already like this?" idempotently.
- **One polymorphic `like` table** (`target_type` + `target_id`) — rejected: it
  fights the BMC-per-entity pattern and weakens the `unique` constraint's clarity.
- **`Category.icon` as a back-end enum** — rejected: it would bake the icon set
  into the back-end and re-open the type every time the front-end adds an icon; the
  opaque-key + front-end fallback keeps both sides free to evolve.
- **Hero as front-end config** — rejected by the maintainer: the goal is to let an
  Admin change home style/branding without a front-end deploy, which requires a
  back-end-owned, editable row.

## Consequences

- ts-rs bindings for the new entities flow through the single-source alias of
  [ADR-0010](0010-monorepo-structure.md); no per-type copy step.
- The `ICON_NAMES` unit test relaxes from "icon ∈ ICON_NAMES" to "known key or
  fallback," reflecting the opaque-key contract.
- The idempotent Like toggle needs `ON CONFLICT(owner_id, target_id) DO NOTHING`,
  which must be written in the portable Postgres/Turso subset tracked in
  [ADR-0012](0012-postgres-turso-db-swap-seam.md).
- All new schema is authored in that portable subset from the start (enums →
  `TEXT`, app-generated salts, RFC3339 timestamps); ids are DB-generated, rendered
  per dialect by the single sea-query schema ([ADR-0012](0012-postgres-turso-db-swap-seam.md)).

---

## Addendum: the merged real-time model (#110)

The merge (#105) **evolves** the live Conversations back-end into Jedi's
vocabulary, rather than building the Jedi back-end fresh. This addendum records
the locked model's architectural decisions and supersedes the parts noted below.
The full entity, RPC, and real-time contract lives in issue **#110**; this ADR
keeps the decisions and their rationale. The map writes no code.

### Entity lineage — two layers, do not conflate

The rename spans two namespaces. An **entity** (a table / ts-rs type) is renamed
and lives on; a real-time **channel** (a routing key) is renamed or retired
independently ([ADR-0018](0018-channel-strings-track-domain-names.md), #109):

| Layer   | Before      | After                            | Why                                                    |
| ------- | ----------- | -------------------------------- | ------------------------------------------------------ |
| Entity  | `Agent`     | `Category`                       | renamed and re-modeled (#107); the table lives on      |
| Entity  | `Conv`      | `Post`                           | renamed and re-modeled (#106); the table lives on      |
| Entity  | `ConvMsg`   | `PostComment` + `CaptionComment` | split into two (#108)                                  |
| Channel | `agents`    | retired                          | a Category is static — no real-time (#107, #109)       |
| Channel | `convs`     | `posts`                          | list poke, renamed (#109)                              |
| Channel | `conv:{id}` | retired                          | message push splits to the two comment channels (#108) |

So the `Agent` **entity** survives as `Category`, while the `agents` **channel**
is gone. The two facts are consistent.

### Decisions the merge locks

- **The live model is evolved, not rebuilt.** The merged entities are `Post`,
  `Category`, `Caption`, `PostComment`, `CaptionComment`, `post_like`,
  `caption_like`, and `Hero`, alongside the unified `User`. Every Post is public;
  ownership is `owner_id → User` (#106). A Post carries many Categories, minimum
  one, via a `post_category` join (#107).
- **A Like gains a surrogate `id` and an explicit parent FK.** `post_like =
  { id, owner_id, post_id, ctime }` and `caption_like = { id, owner_id,
  caption_id, ctime }`, each `unique(owner, parent)`. This **supersedes** the
  original `{ owner_id, target_id, ctime }` generic-`target_id` shape above. A
  Like is write-once (insert or delete, never updated), so it carries no `mid` /
  `mtime`. Counts stay derived by counting rows.
- **A Comment is two entities, not one.** `PostComment` and `CaptionComment`,
  each with one direct-parent FK and an `owner_id` author (#108). This
  **supersedes** the single `Comment` named in the entity list above. An owner
  may edit or delete their own comment.
- **Hero drops `cta_href`.** The CTA runs fixed front-end code (create a new
  account), not an admin-set link, so the target is not a stored, editable field.
  `Hero = { id, title, subtitle, cta_text, background_image, + audit }`, one row.
  This **supersedes** the `cta_href` field above.
- **`User` gains a persisted `avatar_url`.** The avatar moves from the front-end
  seam to a back-end-owned column, realizing the identity convergence of
  [ADR-0007](0007-consolidate-jedi-shell-unified-identity.md).
- **The server is the authoritative sanitization boundary for persisted URLs.**
  The create / update path validates and **rejects** an unsafe URL before it
  persists it — `Post.image_src` / `photographer_url` / `source_url`,
  `Hero.background_image`, and `User.avatar_url`. The front-end `SafeUrl` brand
  ([ADR-0006](0006-safeurl-brand-enforces-sanitize-boundary.md)) stays as
  cooperative, defense-in-depth, but is no longer the only line. A blanket policy
  for user-supplied **text** is a separate decision, tracked in **#112**.
- **Admin-only writes are deferred.** `Category` and `Hero` drop `owner_id`, and
  no privilege check exists yet, so their model-layer writes are unscoped pending
  the privilege ACS. Read stays open; write gating waits.

### Read model

`Post` and `Caption` reads return enriched views — author, resolved categories,
and derived counts — while `Category` and `Hero` return bare rows. Top Photos and
Top Captions are the same list RPCs ordered by the derived like count, not stored
tables.

### Real-time

The merged `WsEvent` carries one variant per #109 channel: a payload for the two
comment kinds, and contentless pokes for `posts`, `post_like`, `caption_like`,
and `post_caption`. Because a comment may now be edited or deleted — not only
appended — each comment channel carries a small tagged payload (an upsert or a
removal). This **refines**, but does not change, #109's channel set and keys.

### Considered and rejected (merge)

- **One polymorphic Comment** — rejected in #108: two tables give each parent a
  real FK and match the BMC-per-entity pattern.
- **Client-only URL sanitization** — rejected: the front-end brand is
  cooperative, so a direct API client bypasses it; the server must sanitize
  persisted URLs.
- **Enforcing Admin writes now** — deferred: no privilege system exists, and
  enforcing it needs `Ctx` to carry the user type, which is outside this map.
