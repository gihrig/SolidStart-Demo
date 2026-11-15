# A Post or Caption delete cascades to every row under it, other Users' rows too

Origin: #187

The Owner can delete a Post or a Caption. Other Users can own rows under it:
Captions, Comments and Likes. But only the Owner or an Admin user may delete a
Caption or a Comment. Each foreign key to `post` or `caption` ends in
`ON DELETE CASCADE`.

## Decisions

**A delete is a hard delete, and the database cascades it.** The model deletes one
row. In the same statement, the database deletes the rows under it. A Post delete
removes its Category links, Likes, Comments and Captions, and each Caption's Likes
and Comments. A Caption delete removes its Likes and Comments. Rows that other
Users own go too. This is the one exception to the Owner rule.

**Only the Owner deletes, for now.** The existing Write scope admits only the Owner,
and a non-Owner gets `EntityNotFound`. The Admin delete comes with the privilege
system (#181). It uses the same cascade.

**A delete pokes only the lists that change.** `delete_post` pokes `posts`.
`delete_caption` pokes `post_caption:{post_id}`. No Event goes to a Channel of a
deleted row. Each client moves its Subscriptions when its selection changes.

## Considered and rejected

- **Refuse the delete while another User's row exists.** Rejected: one Like from
  another User would stop the Owner from deleting their own Post.
- **A soft delete** (a `deleted` flag). Rejected: every read and every count would
  have to filter the flag. The schema already cascades.
- **An Event on each Channel of the deleted rows.** Rejected: a client would refetch
  a row that no longer exists. For example, `get_post_like` fails with "unknown
  Post".

## Consequences

- No User can undo a delete. So the client asks first, and the question names what
  goes: "Delete this Post? Its Captions, Comments and Likes are deleted too."
- The cascade needs foreign-key enforcement. A Turso build
  ([ADR-0012](0012-postgres-turso-db-swap-seam.md)) must enable
  `PRAGMA foreign_keys = ON`, and the cascade tests must also run on that build.
- The **Owner** entry in `GLOSSARY.md` names the exception.
