# The public read is a per-entity public projection, audit visibility selected by surface

Origin: #117

A public read serves an entity on the public surface (`/api/rpc-public`, under
`root_ctx`). This is the anonymous path of the landing page. Its response must
not leak the audit columns: the actor ids (`cid`, `mid`) and the times
(`ctime`, `mtime`).

## Decisions

- **One public projection for each entity.** A public projection is the
  entity's public shape, without the audit columns. One read serves it. It can
  narrow the row (`CategoryPublic`) or enrich it (`PostView`, `CaptionView`,
  `HeroView`, `CommentView`). The `*View` types are their entities' public
  projections.
- **The type system guards it.** Each projection implements the
  `PublicProjection` marker. `base::list_public` requires that bound, so the full
  row can never go out on a public read by mistake.
- **A projection never carries the actor ids. It carries a time only when the UI
  shows that time.** A Comment's time is content: readers use it to follow a
  thread. So `CommentView` carries `ctime`, and `mtime` for the "(edited)" mark.
  The other projections show no time, so they carry none. The actor ids are
  bookkeeping, and `author` already names the Owner.
- **The surface selects audit visibility, not the caller's role.** A visitor
  and a logged-in User share one read shape; they differ only in what they can
  write. A later admin surface reads the full base row, which already carries
  the audit columns.
- **Each entity keeps its own read; the front-end composes the page.**
  `createJediFeed` builds the page from `list_posts`, `list_captions_for_post`,
  `get_hero` and the others. A poke names one list or thread, so the client
  refetches only that part.

## Considered and rejected

- **One read keyed by role, with other columns for each role.** One RPC then has
  two wire shapes, so ts-rs cannot export one type.
- **A `*Admin` type for each entity.** The base row already carries the audit
  columns. The new type would only repeat it.
- **One read for the whole page.** A poke for one thread would then refetch all
  of the page.
- **No times on a Comment.** A reader cannot then see when each Comment was
  written.
- **The name "Public view".** "View" already means the enriched read model, and
  Category has no View.

## Consequences

- Each public read has a test: it carries no `cid` and no `mid`. A projection
  that shows no time also asserts that it carries no `ctime` and no `mtime`.
- An admin panel adds a surface, not new types.
