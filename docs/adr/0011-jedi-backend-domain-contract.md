# The back-end owns the Jedi domain contract

The front-end was built first, against a mock that had the shape of a back-end.
The mock sat behind an async seam (`jedi-api.ts`), and components read it with
`createResource`. The swap to the real back-end changed only the seam. The mock
`data.json` is now the test fixture; `02-dev-seed.sql` mirrors it.

## Decisions

- **The entities.** User, Post, Category, Caption, PostComment, CaptionComment,
  `post_like`, `caption_like` and Hero. Top Photos and Top Captions are orders of
  the lists, not stored tables.
- **One User for the whole app.** The same User owns Posts, Captions, Comments
  and Likes, and logs in.
- **A Like is a row.** Each Like table holds `unique (parent, user_id)`, so a
  User likes a parent at most one time. A count is the number of rows.
- **One table for each parent kind.** Likes and Comments each have a Post table
  and a Caption table. Each table has one real foreign key to its parent.
- **`Category.icon` is an opaque key.** The front-end maps it to an icon, with
  a fallback. The back-end never reads it.
- **Hero is one back-end row.** An Admin edits it, so a branding change needs
  no front-end deploy. Its CTA runs fixed front-end code, so it stores no link.
- **Admin writes wait for the privilege system (#181).** Category and Hero have
  no Owner, and their writes are not scoped yet.

## Considered and rejected

- **A static JSON import for the mock.** Components would skip the loading and
  error states that the back-end needs.
- **A like counter column.** It cannot tell if this User already liked it.
- **One polymorphic Like or Comment table.** It loses the real foreign key.
- **`Category.icon` as a back-end enum.** Each new front-end icon would then
  change the back-end.
- **Hero as front-end config.** Each branding change would need a deploy.
