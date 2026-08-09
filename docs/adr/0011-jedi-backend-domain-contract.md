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
  which must be written in the portable Postgres/SQLite subset tracked in
  [ADR-0009](0009-db-swap-seam-postgres-sqlite.md).
- All new schema is authored in that portable subset from the start (enums →
  `TEXT`, app-generated ids/salts, RFC3339 timestamps).
