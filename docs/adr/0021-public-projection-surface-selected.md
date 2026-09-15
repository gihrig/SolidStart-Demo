# The public read is a per-entity public projection, audit visibility selected by surface

A **public read** returns an entity on the public surface (`/api/rpc-public`, under
`root_ctx`) — the anonymous, no-login path the Jedi landing page uses (`CONTEXT.md`).
Such a response must never leak the internal audit columns (`cid` / `mid` actor ids,
`ctime` / `mtime`). The first public read already solves this by hand: `CategoryBmc::list_public`
selects a narrow `CategoryPublic { id, name, icon }` type
(`lib-core/src/model/category.rs:118`), so `base::list::<Self, CategoryPublic, _>`
never even queries the audit columns.

The merged Jedi build (#113) lands three more public reads — Post (#117), Caption
(#118), Hero (#119). The architecture review marks this the moment the pattern
recurs (card **C-06**, `backend/docs/ar/architecture-review-20260911-215934.html`):
"add the projection seam when the second public read lands." This ADR records what
the seam is, how audit visibility is selected, and why a single role-keyed read was
rejected.

## Decisions

**One public projection per entity.** Each entity names one public type; one read
serves it. A **public projection** is the entity's public-facing shape — its fields
minus the audit columns. `CategoryPublic` + `list_public` is the first; #117 lifts it
into a shared convention that Post, Caption, and Hero reuse.

**A projection may enrich or narrow; either way it carries no audit columns.** Post,
Caption, and Hero public reads are enriched Views — `PostView` adds author, resolved
Categories, and derived counts (`CONTEXT.md:119`, #117). Category is a bare narrowing
(`CategoryPublic`). "Enriched" and "audit-free" are independent; the projection is
always audit-free, and enrichment is per entity. The `*View` types **are** their
entity's public projection.

**Audit visibility is selected by surface, not by the caller's role.** The public
surface strips audit columns. A future admin surface reads the full base row — which
already carries the audit columns — so no `*Admin` type is invented. Visitor and
logged-in user share one read shape; they differ only in **write** capability, which
is a separate axis (owner-only write). The audit-bearing admin read is deferred with
the admin privilege system (#113 Out of Scope).

**Per-entity reads; the front-end composes the page.** Each entity keeps its own RPC
(`list_posts`, `list_captions_for_post`, `get_hero`). The view-model (`createJediFeed`)
composes the page from them. A live poke targets one list or thread, so a single
page-blob read cannot refetch one thread without refetching all.

**The seam is introduced at the second public read (#117).** Category (#116) is the
first public read; Post (#117) is the second — the first moment two real consumers
exist. #117 introduces the shared convention and absorbs `CategoryPublic` /
`list_public`. #118 and #119 conform, each asserting no audit columns in the public
read.

## Considered and rejected

- **A single role-keyed read** returning different columns per user type. Rejected on
  two counts. First, one RPC would carry two wire shapes, so ts-rs cannot export one
  type and the front-end loses its one source of truth
  (#113 US 36: "the front-end consumes one source of truth"). Second, the admin role
  is deferred (#113 Out of Scope), so the second column set has no consumer today — a
  hypothetical seam the C-06 rule forbids ("one adapter is a hypothetical seam; two is
  a real one").
- **A per-entity `*Admin` type** for the audit-bearing read. Rejected: the base row
  already carries the audit columns, so an admin surface reads it directly. A new type
  would only restate the base row.
- **A standalone seam ticket before #117.** Rejected: before #117 only Category
  exists — one adapter. The seam would be built for a single case, which C-06 warns
  "just moves complexity." Two real consumers first appear at #117.
- **Naming the concept "Public view."** Rejected: "View" already means the *enriched*
  read model (`PostView`, `CaptionView`, `HeroView`; `CONTEXT.md:119,133`), and
  Category has no view. Overloading "View" to also mean "the public shape, enriched or
  not" breaks the one-word-one-meaning rule. The umbrella term is **public
  projection**; "projection" is neutral and spans both the enriched and the narrowed
  case.

## Consequences

- **`CategoryPublic` / `list_public` generalize at #117.** The one-off becomes the
  shared convention; Category is folded in rather than left as a parallel path.
- **Each public read gains a written no-audit-columns guarantee.** #117, #118, and
  #119 each assert it; today it is unwritten for Post, Caption, and Hero.
- **A future admin panel adds a surface, not types.** Because audit visibility is
  isolated to the surface, the admin read is the existing base row on a new endpoint —
  no per-entity `*Admin` shapes.
- **`CONTEXT.md` gains the term "Public projection."** The glossary defines the
  concept; this ADR carries the trade-off. The ADR index regenerates via
  `cgs adr:index`.
