# The Post child tables own their table identity through typed marker BMCs, routed via `table_ref()`

`lib-core`'s Post model reads three child tables. `post_like` and `post_comment`
feed the derived `like_count` / `comment_count` on a `PostView`; `post_category`
links a Post to its Categories. `CONTEXT.md` covers the Jedi domain terms (Post,
Category), but this ADR is a code-structure change, so it leaves that glossary
untouched.

Before this ADR the table identity was smeared as string literals across the read
path. `counts_by_post` took `table: &str` (`model/post.rs:548`) and was called as
`counts_by_post(mm, "post_like", …)` and `counts_by_post(mm, "post_comment", …)`
(`post.rs:367`–`368`). `ranked_post_ids` built its correlated like-count subquery
with `.from(Alias::new("post_like"))` (`post.rs:462`). Worst of all, the typed
owner already existed and was bypassed: `PostCategoryBmc` (`post.rs:128`,
`const TABLE = "post_category"`) was skipped by `post_category_links`, which read
`.from(Alias::new("post_category"))` (`post.rs:528`).

The seam to concentrate this already existed. `DbBmc::table_ref()`
(`model/base/bmc.rs:71`) turns a BMC's `const TABLE` into a `TableRef`, and the
typed `PostBmc` already used it — `.from(PostBmc::table_ref())` (`post.rs:473`).
The child tables did not.

The architecture review after #165 raised this as card **C-10 — give the Post
child-tables a typed BMC owner** (`backend/docs/ar/architecture-review-20260921-001306.html`).
This ADR records the deepening: each child table's identity owned by one typed
marker BMC, routed through `table_ref()`. It follows ADR-0023's C-07 move —
concentrate a scattered identity behind one small seam.

## Decisions

**Each child table has a typed marker BMC.** `PostLikeBmc` and `PostCommentBmc`
join the existing `PostCategoryBmc`, each a unit struct with `impl DbBmc` and a
`const TABLE`. The three live together in one region, renamed
`// region: --- child-table BMCs`. A marker BMC owns the table name only; it is
not a write path.

**Reads route through `table_ref()`.** `counts_by_post` becomes generic over
`MC: DbBmc` and drops its `table: &str` parameter; its `FROM` is
`MC::table_ref()`. The call sites read `counts_by_post::<PostLikeBmc>(mm, &post_ids)`
and `counts_by_post::<PostCommentBmc>(mm, &post_ids)`. The type parameter matches
the blueprint idiom `base::create::<Self, _>` (`post.rs:240`).

**The `PostCategoryBmc` bypass is closed.** `post_category_links` swaps
`.from(Alias::new("post_category"))` (`post.rs:528`) for
`PostCategoryBmc::table_ref()`. `ranked_post_ids` swaps its subquery
`.from(Alias::new("post_like"))` (`post.rs:462`) for `PostLikeBmc::table_ref()`.

**The seam owns the `FROM` clause only.** `table_ref()` returns a `TableRef`, so it
fills a `FROM`. Column qualification needs an iden, not a `TableRef`, so
`ranked_post_ids` keeps `Alias::new("post_like")` where it qualifies
`post_like.post_id` (`post.rs:464`). This matches the existing typed `PostBmc`,
which still qualifies with `Alias::new("post")` (`post.rs:465`, `474`, `484`).

**The test seed stays raw SQL.** The test-only helper `seed_post_like` keeps its
`"INSERT INTO post_like …"` literal (`post.rs:591`); a marker BMC is not a write
path. Its comment changes from "`post_like` has no Bmc yet (#118)" (`post.rs:584`)
to note that the write path — not the marker — is what #118 adds.

## Considered and rejected

- **A table-name `const` or `&str` helper** instead of a marker BMC. Rejected:
  `DbBmc` is already the table's owner and `table_ref()` already exists. A second
  owner would split the identity again.
- **A runtime value parameter** `counts_by_post(mm, MC::table_ref(), post_ids)`.
  Rejected: a `TableRef` value is a dressed-up string. The type parameter keeps the
  compiler as the checker and matches `base::create::<Bmc, _>`.
- **A new `DbBmc` method for column qualification** (a table iden), routing the
  qualification aliases through the seam too. Rejected: it adds a seam to every
  entity for one call site, and `PostBmc` itself qualifies with `Alias::new("post")`.
  Out of C-10's scope.
- **A `post_like` / `post_comment` write path now.** Rejected: the write path is
  #118 / #122. C-10 concentrates the read-side table identity only.

## Consequences

- **The query is unchanged.** `table_ref()` emits the same table name via
  `SIden(Self::TABLE)` (`base/bmc.rs:71`), the same name the `Alias` emitted. The
  `FROM` selects the same table, so the result and the behavior do not change.
- **No ts-rs bindings change.** The affected items are private read helpers with no
  `#[derive(TS)]`. The CI drift guard stays green with no `cgs bindings` diff.
- **Each child table name lives in one place** — its marker BMC. The compiler, not
  a string, selects the table at every read `FROM`.
- **Two literals remain by design**: the test-only INSERT (the #118 write path) and
  the column-qualification aliases (the `PostBmc` idiom). This ADR scopes them out;
  it does not claim to remove them.
- **The seam pays forward.** When #118 / #122 add the like / comment write path,
  `PostLikeBmc` / `PostCommentBmc` are the owners it builds on.
- **`CONTEXT.md` is unchanged.** This is a code-structure change, not a domain
  change.
- **The ADR index regenerates** via `cgs adr:index`.
