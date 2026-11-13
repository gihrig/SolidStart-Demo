# SolidStart Demo — Glossary

Jedi is a photo-and-caption site: Users share Flickr photos as Posts, compete to
caption them, and talk in real-time Comment threads. It is one domain with two
surfaces, a SolidStart front-end and a Rust/Axum back-end, that share one User
and one generated contract ([ADR-0010][0010]).

**Labels.** A definition is the same for both surfaces. These labels follow it:

- `_FE_` — how the front-end realizes the term (code names and files).
- `_BE_` — how the back-end realizes the term (fields, tables, RPCs).
- `_Planned_` — agreed, but not built yet.
- `_See_` — the ADRs and issues behind the term.
- `_Avoid_` — words the project does not use for the term.

**Index.**

| Term                          | Group                             |
| ----------------------------- | --------------------------------- |
| Admin user                    | [Domain](#domain)                 |
| Announcement                  | [User interface](#user-interface) |
| Audit columns                 | [Contract seam](#contract-seam)   |
| Author line                   | [User interface](#user-interface) |
| Brand link                    | [User interface](#user-interface) |
| Caption                       | [Domain](#domain)                 |
| Caption actions               | [User interface](#user-interface) |
| Caption hold                  | [User interface](#user-interface) |
| Caption line                  | [User interface](#user-interface) |
| Caption lock                  | [User interface](#user-interface) |
| Category                      | [Domain](#domain)                 |
| Channel                       | [Real-time feed](#real-time-feed) |
| Comment                       | [Domain](#domain)                 |
| Comments panel                | [User interface](#user-interface) |
| Comments toggle               | [User interface](#user-interface) |
| Compose box                   | [User interface](#user-interface) |
| Draft                         | [User interface](#user-interface) |
| Draft guard                   | [User interface](#user-interface) |
| Draft scope                   | [User interface](#user-interface) |
| Event                         | [Real-time feed](#real-time-feed) |
| Feed                          | [Real-time feed](#real-time-feed) |
| Focus ring                    | [User interface](#user-interface) |
| Guarded move                  | [User interface](#user-interface) |
| Hero                          | [Domain](#domain)                 |
| `IconName`                    | [Contract seam](#contract-seam)   |
| Jedi                          | [Domain](#domain)                 |
| Like                          | [Domain](#domain)                 |
| Nav links                     | [User interface](#user-interface) |
| Notice                        | [User interface](#user-interface) |
| Owner                         | [Domain](#domain)                 |
| photographer                  | [Domain](#domain)                 |
| Poke rule                     | [Real-time feed](#real-time-feed) |
| Post                          | [Domain](#domain)                 |
| Post actions                  | [User interface](#user-interface) |
| Post card                     | [User interface](#user-interface) |
| Post dialog                   | [User interface](#user-interface) |
| Post hold                     | [User interface](#user-interface) |
| Post shown / Caption shown    | [User interface](#user-interface) |
| Profile menu                  | [User interface](#user-interface) |
| Public projection             | [Contract seam](#contract-seam)   |
| RPC contract                  | [Contract seam](#contract-seam)   |
| RPC surfaces                  | [Contract seam](#contract-seam)   |
| `SafeUrl`                     | [Contract seam](#contract-seam)   |
| Sanitization boundary         | [Contract seam](#contract-seam)   |
| Selection highlight           | [User interface](#user-interface) |
| Sidebar                       | [User interface](#user-interface) |
| Sidebar cards                 | [User interface](#user-interface) |
| Site menu                     | [User interface](#user-interface) |
| Standard user                 | [Domain](#domain)                 |
| Subject                       | [User interface](#user-interface) |
| Subscription                  | [Real-time feed](#real-time-feed) |
| Theme                         | [User interface](#user-interface) |
| Top Nav                       | [User interface](#user-interface) |
| Top Photos / Top Captions     | [Domain](#domain)                 |
| ts-rs bindings                | [Contract seam](#contract-seam)   |
| `~/types/backend` barrel      | [Contract seam](#contract-seam)   |
| `useAuth` identity            | [Contract seam](#contract-seam)   |
| User                          | [Domain](#domain)                 |
| View                          | [Contract seam](#contract-seam)   |
| View-model                    | [User interface](#user-interface) |
| Visitor                       | [User interface](#user-interface) |

## Domain

The entities of Jedi and the people who use it.

**Admin user**:
A User with maximum control and configuration permissions. An Admin user creates
the Category taxonomy and edits the Hero.

_BE_: `UserTyp = "Sys"`.
_Planned_: write-gating on admin-only actions; no privilege system exists yet (#181).
_See_: [ADR-0011][0011] addendum.
_Avoid_: system user, superuser, root.

**Caption**:
A short text that a User submits for a Post. Many Captions compete per Post, each
ranked by its own Likes, and the top one shows on the Post. Each has its own
real-time Comment thread and Likes. A first-class entity, never a Post's
"caption text".

- A Caption lock limits an edit.
- Text over 36 characters, or an unknown Post, is a `Validation` error.

_BE_: `add_caption` (`CaptionForCreate`), `update_caption`, `delete_caption`;
reads return `CaptionView`.
_See_: [ADR-0030][0030] addendum; #106, #108, #121, #123, #127, #187.
_Avoid_: title; caption text (as a Post field).

**Category**:
A back-end-owned classification that a Post carries. A Post's on-card "tags" _are_
its Categories. Many-to-many with Post, with **minimum one** per Post. The
single-select sidebar filters Posts by one Category.

- **Static**: loaded once on page load, never real-time.
- A Category has no Owner.

_BE_: `Category = { id, name, icon }`; `icon` is an opaque key (see `IconName`).
_See_: [ADR-0011][0011] addendum; #107.
_Avoid_: Tag, Label (as concepts separate from Category); Agent, Topic, Channel
(the retired FullStack term and its abandoned rename targets).

**Comment**:
A User's remark, in a Post's thread or a Caption's thread. Two flat entities, not
one: a **PostComment** parented to a Post, and a **CaptionComment** parented to a
Caption.

- Each is real-time: a new or edited Comment pushes to its thread's subscribers.
- A thread lists its Comments newest first.
- `content` is plain text or markdown, stored as written. The server renders it
  to sanitized HTML on read, and the Owner's edit form loads the stored text.

_BE_: `PostComment` (`post_id`), `CaptionComment` (`caption_id`); reads return
`CommentView`.
_See_: [ADR-0011][0011] addendum, [ADR-0019][0019] addendum, [ADR-0024][0024]
addendum; #108, #124–#127, #246.
_Avoid_: post, reply; Message (the retired FullStack term).

**Hero**:
The home page's banner content: title, subtitle, CTA text and background image. A
back-end-owned **singleton** that an Admin user edits to change home branding. It
is not user-generated and has no Owner.

- The CTA target is not stored: the button runs fixed front-end code (create a
  new account).
- No RPC creates or deletes the Hero.

_FE_: `Hero` (`components/Hero.tsx`).
_BE_: one `Hero` row; `get_hero` returns `HeroView`; `update_hero`, Admin user only.
_Planned_: the privilege system replaces the interim gate (#181).
_See_: [ADR-0011][0011] addendum; #110, #119.
_Avoid_: banner, splash (as separate concepts); treating it as per-User content.

**Jedi**:
The application: a photo-and-caption site where Users share Flickr photos as
Posts and compete to caption them. "Awesome" is the brand that users see.
"Jedi" is the name in code and in ADRs.

_Avoid_: "Awesome" in code; "Jedi" in UI text.

**Like**:
A User's endorsement of one Post or one Caption: a first-class record, not a
stored counter. The Post or Caption that a Like is for is its **Like target**.
At most one Like per User per Like target (an idempotent toggle). A like count
is _derived_ by counting Likes.

_BE_: the `post_like` and `caption_like` tables, each `unique(parent, user)`.
_See_: [ADR-0011][0011] addendum, [ADR-0024][0024] addendum; #117, #118, #122,
#123.
_Avoid_: vote, favorite, star; `likeCount` as stored truth.

**Owner**:
The User who created a Post, Caption or Comment. The UI shows the Owner as the
Author. An entity never moves to another Owner.

- Only its Owner or an Admin user may delete it. Only its Owner may edit it.
- A delete also removes the rows under the entity, even rows that other Users own.

_BE_: `owner_id` on `Post`, `Caption`, `PostComment`, `CaptionComment`; `AuthorRef`.
_See_: [ADR-0032][0032].
_Avoid_: creator, poster; user (when the owning role is meant).

**photographer**:
The external Flickr attribution on a Post: the person who took the photo, who is
**not** a User.

_Avoid_: author (that names the owning User); user.

**Post**:
The core entity: a shared Flickr photo with its Owner, Categories, Caption
competition, real-time Comment thread and real-time Likes. The Post _is_ the photo
(mandatory, and fixed for the Post's life). **Every Post is public**: any
logged-in User may read and take part; there is no private or archived Post.

- A Post carries many Categories, **minimum one**.
- The Owner edits the title, the image description, the attribution and the
  Categories.
- An empty or unknown `category_ids`, a title over 36 characters, or an unsafe
  URL is a `Validation` error.

_BE_: `create_post` (`PostForCreate`), `update_post`, `delete_post`; reads return
`PostView`; Categories in `post_category`.
_See_: [ADR-0011][0011] addendum, [ADR-0019][0019]; #106, #107, #120, #187.
_Avoid_: Photo (as a distinct entity), Image, feed item; Conversation, thread,
room (the retired FullStack terms).

**Standard user**:
A User with ordinary permissions: the default tier. It is deliberately not called
"User", which names the identity.

_BE_: `UserTyp = "User"`.
_Avoid_: regular user.

**Top Photos** / **Top Captions**:
Ranked _views_, not stored lists. Top Photos is Posts ordered by like count. Top
Captions is the Captions of the Post shown ordered by like count.

_BE_: the same `list_*` RPCs ordered by the derived like count; no stored tables.
_Planned_: Top Photos within the selected Category, once filtering lands (#29).
_See_: [ADR-0011][0011] addendum.
_Avoid_: featured/popular list, best captions (as stored data).

**User**:
An authenticated identity that owns Posts and Captions, authors Comments, and
casts Likes. Every User is either an Admin user or a Standard user. One User is
the identity on both surfaces.

- A username has at most 32 characters.

_FE_: the nav avatar reads the identity through the `useAuth` seam.
_BE_: `User = { id, username, typ, avatar_url }` with `UserTyp = "Sys" | "User"`.
`avatar_url` is a back-end column.
_See_: [ADR-0007][0007], [ADR-0011][0011] addendum; #117, #203.
_Avoid_: account.

## Real-time feed

How Comments, Captions and Likes reach a User's client live, without polling.

**Channel**:
The routing key that an Event is addressed to and a Subscription names. The
exported `Channel` type has **six variants**:

| Wire string       | Routing key                    | Semantics |
| ----------------- | ------------------------------ | --------- |
| `posts`           | `posts`                        | poke      |
| `post_comment`    | `post_comment:{post_id}`       | payload   |
| `caption_comment` | `caption_comment:{caption_id}` | payload   |
| `post_like`       | `post_like:{post_id}`          | poke      |
| `caption_like`    | `caption_like:{caption_id}`    | poke      |
| `post_caption`    | `post_caption:{post_id}`       | poke      |

_FE_: `lib/channel.ts`.
_BE_: the `Channel` enum (`lib-core::realtime::channel`).
_See_: [ADR-0018][0018] addendum, [ADR-0020][0020]; #109.
_Avoid_: topic, room; the retired `agents` / `conv` / `convs` strings.

**Event**:
One notification carried on the Feed. A **payload** Event carries a Comment
upsert or removal. A **poke** Event is contentless, and the client refetches.

_BE_: `WsEvent` (`lib-core::realtime::event`); `CommentView`, `CommentRemoval`.
_See_: [ADR-0011][0011] addendum, [ADR-0020][0020]; #109, #125.
_Avoid_: notification, broadcast (the mechanism, not the item).

**Feed**:
The live stream that a User's client receives Events on, without polling. One per
client: every view that a client shows shares the single Feed.

_FE_: `lib/feed.ts`; `feed.websocket.ts`, `feed.memory.ts`.
_BE_: `GET /ws` (`lib-web::ws`); contract in `lib-core::realtime`.
_See_: [ADR-0017][0017], [ADR-0026][0026], [ADR-0028][0028].
_Avoid_: socket (as the concept), push.

**Poke rule**:
A Channel's semantics follow its data shape.

- **Threads push.** A Comment thread's Event carries the Comment.
- **Lists and counts poke.** A ranked list or a count gets a contentless poke,
  and the client refetches it. No row crosses the push path.
- **The writer does not wait.** A User's own write shows at once in that
  User's client. The Event is for the other clients.

_BE_: `PokeReceipt<C>`, `PokedRpcResult<T, C>` (`lib-web::ws::poke`).
_See_: [ADR-0016][0016]; #85, #102, #109, #283 (C-29).
_Avoid_: Channel semantics rule; refresh, notify.

**Subscription**:
A client's standing request to receive Events on a Channel. Every Channel is
**authenticated-read**: any logged-in socket may subscribe, because every Post is
public. A connection with no Subscription receives nothing.

_FE_: `feed.subscribe(channel, handler)`.
_BE_: `SubscriptionRequest { action, channel }`; `authorize`.
_See_: [ADR-0014][0014], [ADR-0015][0015], [ADR-0018][0018] addendum,
[ADR-0020][0020], [ADR-0028][0028], [ADR-0031][0031]; #106, #109.
_Avoid_: listener, watch.

## Contract seam

The back-end (`backend/`, Rust/Axum, rust10x blueprint) owns the domain and
exports it to the front-end as **ts-rs bindings**: the contract that both surfaces
share. The _mechanism_ (the tsconfig `paths` alias, the CI bindings-drift guard)
lives in [ADR-0010][0010].

**Audit columns**:
The rust10x audit fields that most back-end entities carry, `cid` / `ctime` /
`mid` / `mtime`: the id of the User who created the row and the create time,
and the id of the User who last changed it and the change time. `ctime` and
`mtime` are RFC3339 `TEXT` in the portable schema.

- A Like is write-once, but `post_like` / `caption_like` still carry the full
  audit columns.

_See_: [ADR-0012][0012]; #117, #118.

**`IconName`** (↔ `Category.icon`):
The name of a front-end icon. The front-end maps each Category's `icon` key to
an `IconName`. An unknown key shows a fallback icon.

_FE_: `components/Icon.tsx`; `toIconName` (`lib/jedi/jedi-api.ts`).
_See_: [ADR-0011][0011]; #116.

**Public projection**:
An entity's public-facing shape: its fields **minus** the internal audit columns.
It never carries the actor ids (`cid` / `mid`), so an anonymous `/api/rpc-public`
response never leaks them. It carries a time (`ctime` / `mtime`) only when the UI
shows that time.

- Each public read names one such type, and **one read serves it**:
  `CategoryPublic` (`CategoryBmc::list_public`), `PostView` / `AuthorRef`
  (`PostBmc`), `CaptionView` (`CaptionBmc`), `HeroView` (`HeroBmc`) and
  `CommentView` (the Comment module, for both kinds).
- A projection may be **enriched** (an author-and-counts `PostView`) or a bare
  **narrowing** (`CategoryPublic`).
- Audit visibility is chosen by **surface**, not by the caller's role: the public
  surface strips, and a future admin surface reads the full row. A Visitor and a
  logged-in User share one read shape and differ only in **write**.

_BE_: the `PublicProjection` marker in the model `base`. `base::list_public`
requires it, so the audit-bearing entity row can never be served from a public
read.
_Planned_: the admin read of the full row, with the admin system.
_See_: [ADR-0021][0021] and addendum; #116–#119, #125, #127, C-06.
_Avoid_: **Public view** (**View** means the _enriched_ read model: `PostView` /
`CaptionView` / `HeroView`); a single role-keyed read that returns different
columns per caller (it gives ts-rs one call two shapes and breaks the
one-source-of-truth seam).

**RPC contract**:
The part of the contract seam that covers the Jedi RPC methods. Each entry names a
method, its RPC surface, its params type and its result type, all read from the
handler.

- A wrong method name, params shape or result type fails the front-end type check.
- A back-end test proves that each method is routed on its own surface.

_FE_: `authenticatedRpc(method, params)` and `publicRpc(method, params)` in
`lib/backend-rpc.ts`.
_BE_: `web/rpcs/rpc_contract.rs`, exported as `bindings/RpcContract.ts`.
_See_: [ADR-0029][0029].
_Avoid_: API schema, method registry; an RPC member per method.

**RPC surfaces** (authenticated and public):
The back-end's two JSON-RPC endpoints. `/api/rpc` is **authenticated** (behind
`mw_ctx_require`): it carries every mutation and every row-scoped read, and runs
under the caller's own `Ctx`. `/api/rpc-public` is **public** (no auth): it
carries a hand-picked set of anonymous reads, and runs under `root_ctx`.

- Jedi's static, back-end-owned content is public, so the front-end reads
  it without a login: the Category, Post, Caption and Hero reads.
- Register ONLY safe public reads there: never a mutation or a row-scoped read.
- The **RPC contract** test enforces the list: the public surface must carry
  exactly the contract's public entries.

_See_: #116–#119.
_Avoid_: putting an anonymous read behind auth (it breaks the public landing page).

**`SafeUrl`**:
A URL string that passed the URL safety check, so it can go to a URL sink.

- A safe URL is `http(s)://…`, a root-relative path or a fragment, with no
  `' " ( ) \`.
- The back-end rejects an unsafe URL on write, with the same rule.
- The URL fields are `Hero.background_image`, `User.avatar_url`, and the Post's
  `image_src`, `photographer_url` and `source_url`.

_FE_: `sanitizeUrl`, `trustedUrl` (`lib/sanitizeUrl.ts`).
_BE_: `check_safe_url`, `DbBmc::url_fields`.
_See_: [ADR-0006][0006], [ADR-0011][0011] addendum; #119, #120.

**Sanitization boundary** (user text and URLs):
The server is the authoritative sanitization boundary. **User text** is sanitized
in four layers:

1. Input hygiene on write: Unicode NFC normalize, trim, and **reject** control,
   zero-width and bidirectional-override characters, plus length caps. The
   server stores the **original** markdown or text.
2. On read, the `markdown` crate renders markdown → HTML.
3. **ammonia** sanitizes the result.
4. The client escapes at every sink (Solid), with a **neosanitize** backstop where
   sanitized HTML is injected.

- **URLs** are validated and **rejected** on write, and carry the front-end
  `SafeUrl` brand at the sink.
- Text is never HTML-escaped on write: that would double-escape.
- Each front-end copy of a length cap pins to the generated `HygieneCaps` literal
  type, so a back-end cap change fails the front-end type check.

_See_: [ADR-0019][0019], [ADR-0011][0011] addendum, [ADR-0006][0006],
[ADR-0029][0029].
_Avoid_: store-escaped text; client-only sanitization as the sole line of defense.

**ts-rs bindings** (the FE↔BE contract):
The back-end's `#[derive(TS)]` types, exported to
`backend/crates/services/web-server/bindings/`. The front-end consumes them, so a
back-end type change _is_ a front-end contract change; CI guards the two in step.

- Every back-end integer, an id or a count, is a `number` in the bindings, as on
  the JSON wire. A value above 2⁵³−1 loses precision.

_See_: [ADR-0010][0010], [ADR-0027][0027].
_Avoid_: DTO, hand-kept schema: there is one generated source of truth.

**`~/types/backend` barrel**:
The one place where the front-end imports bindings. It re-exports each binding
unchanged and layers its locally-defined types. Consumers never import raw
`bindings/` files directly.

_See_: [ADR-0010][0010], [ADR-0027][0027].
_Avoid_: re-typing a binding at the barrel; fix the type at its Rust source.

**`useAuth` identity**:
The seam that serves the nav avatar's identity: the logged-in User's **profile**.
A change of the identity's source stays behind this seam.

- The authenticated `get_profile` RPC returns the ctx User as an `AuthorRef`. It
  loads only after login, so a logged-out nav shows no name and an empty avatar
  circle.
- A User with no `avatar_url` shows the first characters of the name in the
  circle.

_See_: [ADR-0007][0007], [ADR-0011][0011] addendum; #119.
_Avoid_: rewiring components when the source changes; the seam absorbs it.

**View**:
A back-end read shape that adds data to an entity row for the UI, such as the
author and the like and comment counts. Each View is a Public projection.

_BE_: `PostView`, `CaptionView`, `CommentView`, `HeroView`.
_Avoid_: Public view; "view" for a page or a screen.

## User interface

How the front-end (`frontend/src/`) shows the domain.

**Author line**:
The line under the photo on the Post card. It shows the Author's avatar and
name, the Post title and the Post's Categories.

_FE_: `FeaturedPost` (`components/FeaturedPost.tsx`).
_Avoid_: Post line; categories line.

**Brand link**:
The "Awesome" logo and wordmark at the left of the Top Nav. It goes to the home
page. It is not a Nav link, so it never marks the current page.

_Avoid_: logo link, home button.

**Caption hold**:
The time in which the Caption line keeps the Caption shown.

- An open Caption edit or an open Caption Comments panel starts it. It ends when
  the last of them closes.
- During a Caption hold, a re-rank does not change the Caption shown.
- A pick of another Caption ends it, and so does a move to another Post. With a
  Draft, the User is asked first.
- A deleted Caption ends it.

_FE_: `createSelection` (`lib/jedi/createSelection.ts`).
_See_: [ADR-0030][0030] addendum; #271.
_Avoid_: pin, lock, freeze; "hold" alone.

**Caption line**:
The line on the Post card that shows the Caption. A **Caption form** takes its
place to add or edit a Caption. On a Post with no Caption, the form shows there
at once.

_FE_: `PostCaption` (`components/PostCaption.tsx`); `CaptionForm`
(`components/CaptionForm.tsx`).

**Caption lock**:
The rule that a Caption's text cannot change after its first Like or Comment,
the Owner's own Like too. After that, the Owner can only delete the Caption.

- An **Edit** on a locked Caption shows a Notice.
- The back-end is the authority: an edit with a stale count gets a `Validation` error.

_FE_: `captionLocked` (`components/FeaturedPost.tsx`).
_BE_: `update_caption`.
_Avoid_: "lock" alone.

**Comments panel**:
The part of the Post card that shows one Comment thread: the Post's or the
Caption's.

_FE_: `CommentThread` (`components/CommentThread.tsx`), `createCommentThread`
(`lib/jedi/createCommentThread.ts`).
_Avoid_: comment section; "thread" for the panel.

**Comments toggle**:
The first button of the Post actions (**Post Comments**) and of the Caption
actions (**Caption Comments**). It shows the comment count. It opens or closes
the Comments panel on that thread.

**Compose box**:
The form in the Comments panel that adds a new Comment.

- A plain Enter submits, and Shift+Enter adds a new line.
- With a touch pointer, Enter adds a new line, and only the button submits.

_FE_: `CommentForm` (`components/CommentThread.tsx`).
_Avoid_: reply box, comment input.

**Draft** (unsaved form text):
Text that a User typed in a form and has not saved.

- A Comment compose box or an Add Caption form has one when it is not blank.
- A New Post dialog has one when a field is not blank or a Category is checked.
- An open Comment, Caption or Post edit has one when it differs from the saved
  entity.
- A Cancel, an Escape or a user-started move that would close the form asks first.
- While the form is saving, no user-started move closes it.
- An Event that removes the form's Subject discards the Draft, and a Notice says so.
- A Caption that arrives does not close an Add Caption form with a Draft.
- An Event that moves the Post out of the selected Category leaves the Draft for
  the User to keep or discard.

_See_: [ADR-0030][0030].
_Avoid_: unsaved comment, pending edit; "lost" or "rejected" for a forced discard.

**Draft guard**:
The one record, for the whole app, of the forms that have a Draft or are
saving. It asks the User before a Guarded move closes a form with a Draft. It
shows a Notice when an Event discards a Draft.

_FE_: `createDraftGuard` (`lib/createDraftGuard.ts`), `DraftGuardProvider`
(`components/DraftGuardContext.tsx`, mounted in `app.tsx`).
_See_: [ADR-0030][0030].

**Draft scope**:
A group of forms whose Drafts one move closes together. A move that closes the
group asks only about the Drafts in its Draft scope and in each Draft scope under
it. So the close of one Comments panel never asks about, or discards, a Draft in
another place on the page.

- A form takes the Draft scope of the place where it shows.
- A form outside the Post card, such as the New Post dialog, has no Draft scope.
- A move that names no Draft scope asks about every Draft.

```
Post scope ............... Post edit, Add Caption form
├── Post thread scope .... Post Comments: compose box, Comment edits
└── Caption scope ........ Caption edit
    └── Caption thread scope ... Caption Comments: compose box, Comment edits
```

| Move                                  | Draft scope that it names |
| ------------------------------------- | ------------------------- |
| Top Photo click, Category change      | Post scope                |
| Pick of another Caption               | Caption scope             |
| Close of a Comments panel             | that thread scope         |
| Switch to the other Comments panel    | the other thread scope    |
| Logoff, route change                  | none: every Draft         |

_FE_: `DraftScope`, `createDraftScope` (`lib/createDraftGuard.ts`); `DraftScopeContext`.
_See_: [ADR-0030][0030] addendum (#271).
_Avoid_: "scope" alone; form group.

**Focus ring**:
The ring that marks the element with keyboard focus. It shows for keyboard use
only, never for a pointer click.

- In a sidebar listbox, the ring marks the active option. The option does not
  hold the focus, so code paints the ring.
- A ring after a pointer click, or on an unfocused listbox, is a bug.
- It is a separate visual state from the Selection highlight.

_FE_: the `:focus-visible` rule (`app.css`); `useListbox` (`lib/useListbox.ts`).
_See_: #38.
_Avoid_: selection ring; always-on focus outlines.

**Guarded move**:
A User action that would close a form. Examples are a Cancel, an Escape, a Top
Photo click, a Category selection, a Caption pick, a Comments panel close, a
route change and a logoff.

- With a Draft in the move's Draft scope, the UI asks "You have unsaved changes.
  Discard them?" **Discard** runs the move. **Keep editing** stops it.
- While a form in that Draft scope is saving, the move does nothing.
- A move that keeps the Post shown is not a Guarded move.

_FE_: `guard.attempt(move, scope)`.
_Avoid_: "move" alone.

**Nav links**:
Home, About and Readme.

- The Top Nav shows them on a wide screen (768 px and wider). The Site menu shows
  them on a narrow screen.
- The Nav link of the current page has an underline.

_Avoid_: menu items, tabs.

**Notice** / **Announcement**:
A Notice is a modal dialog with one **OK** button. It tells the User a fact,
such as a discarded Draft or a Caption lock. An Announcement is text that only
a screen reader speaks, such as "Post saved."

_FE_: Notice: `ConfirmDialog` with no `cancelLabel`. Announcement: the
`role="status"` region in `routes/index.tsx`, set by `createSelection`.
_Avoid_: toast; "alert" for a Notice (an alert is the error text under an action).

**Post actions** / **Caption actions**:
The row of buttons under the Author line (Post actions) or under the Caption
line (Caption actions). From the left: the Comments toggle, the fire-heart, the
like count, then **Like**, **Add**, **Edit** and **Delete**.

- A Visitor sees only the Comments toggle, the fire-heart and the count.
- A logged-in User sees every button. A button that cannot act now is disabled.
- Only the Owner can use **Edit** and **Delete**.
- **Add** in the Post actions opens the Post dialog. **Add** in the Caption actions opens the Caption form.
- The Like in the Caption actions is for the Caption shown. To like another
  Caption, the User selects it in Top Captions first. Top Captions shows counts
  only.

_FE_: `ActionsLine`, `LikeControl`, `OwnerActions`.

**Post card**:
The main article, which shows the Post. From the top: the title bar, the photo,
the Author line, the Post actions, the Caption line, the Caption actions and the
Comments panel.

_FE_: `FeaturedPost` (`components/FeaturedPost.tsx`).
_See_: [ADR-0030][0030] addendum; #210.
_Avoid_: Featured Post (`featured` is the top-ranked Post, only the default).

**Post dialog**:
The modal form that creates or edits a Post. Its heading is **New Post** or
**Edit Post**.

_FE_: `PostDialog` (`components/PostDialog.tsx`).
_Avoid_: create-post dialog.

**Post hold**:
The time in which the Post card keeps the Post shown.

- A Draft on the Post, an open Post edit or an open Comments panel starts it. It
  ends when the last of them ends.
- During a Post hold, a re-rank does not move the Post card.
- An Event that moves the Post out of the selected Category keeps the Post shown
  until the Post hold ends.
- A move by the User to another Post ends it: a Top Photo click, or a change to a
  Category without the Post. With a Draft, the User is asked first.
- A deleted Post ends it.

_FE_: `createSelection` (`lib/jedi/createSelection.ts`).
_See_: [ADR-0030][0030] addendum; #271.
_Avoid_: pin, lock, freeze; "hold" alone.

**Post shown** / **Caption shown**:
The Post in the Post card, and the Caption in its Caption line. By default,
each is the top-ranked one. A Top Photo click or a Category change sets the Post
shown. A Top Captions click sets the Caption shown.

_FE_: `selectedPost`, `selectedCaption` (`lib/jedi/createSelection.ts`).
_Avoid_: selected Post, current Post (in text).

**Profile menu**:
The drop-down that the avatar button in the nav opens. It has My Profile, Log In
or Log Out, and the three Theme items.

- Every Visitor can open it, at every width, also before login.

_FE_: the `profile-menu` disclosure in `Nav` (`components/Nav.tsx`).
_Avoid_: nav drop-down, profile dropdown, user menu.

**Selection highlight**:
The persistent mark on the option that _is_ the current selection in a sidebar
listbox. It reflects application state: the selected Category, the Post shown or
the Caption shown.

- It must **always** be present on the selected option, regardless of input
  modality. Losing it when the selection changes is a bug.
- It is a separate visual state from the Focus ring.

_FE_: `bg-(--theme-highlight)`.
_See_: #37.
_Avoid_: focus highlight; conflating it with the focus ring.

**Sidebar** / **Sidebar cards**:
The column beside the Post card. It has three Sidebar cards: Categories, Top
Photos and Top Captions. Each card is a single-select listbox. Below 768 px, a
**Categories** button shows or hides the Sidebar.

_FE_: `Card`, `CategoriesCard`, `TopPhotosCard`, `TopCaptionsCard`; the
`jedi-sidebar` disclosure (`routes/index.tsx`).

**Site menu**:
The drop-down that has the Nav links on a narrow screen (below 768 px). The ☰
button in the Top Nav opens it. It is not the Profile menu.

_FE_: the `site-mobile-nav` disclosure in `Nav`; its accessible name is "Site menu".
_Avoid_: mobile menu, mobile nav, hamburger menu.

**Subject**:
The Post, Caption or Comment that an action or a form is for.

_FE_: `subjectId` (`components/OwnerActions.tsx`).
_Avoid_: target (in code, "target" names the Like target and the Comment target).

**Theme**:
The light or dark look of the site. There are three: **System Theme**, **Light
Theme** and **Dark Theme**.

- System Theme follows the light or dark setting of the device, and it is the
  default.
- A Visitor chooses a Theme in the Profile menu, and a check mark shows the Theme
  in use.
- The browser keeps the choice: the **saved theme**. A User does not own it. It
  does not follow the User to another browser, and login and logout do not
  change it.

_FE_: the server reads the saved theme from a cookie, so the first paint shows it.
_See_: [ADR-0033][0033].
_Avoid_: mode, color mode, dark mode, auto, selected theme; color scheme (the CSS
`color-scheme` property tells the browser which built-in colors to use).

**Top Nav**:
The bar at the top of every page. It has the Brand link, the Nav links, the
Profile menu button, New Post for a logged-in User, and the Site menu button on a
narrow screen.

_FE_: `Nav` (`components/Nav.tsx`).
_Avoid_: header, navbar, top bar.

**View-model**:
A front-end module that has the state and the rules of one part of a page,
so that the components only render it.

_FE_: `createJediFeed`, `createSelection`, `createCommentThread`, `createLikeState`.
_Avoid_: store, controller.

**Visitor**:
A person who uses the site and is not logged in. A Visitor can read every
Post, Caption and Comment, and can choose a Theme. A Visitor cannot write.

_Avoid_: viewer, anonymous user, guest.

## Pending renames

Identity tokens that still wait for a rename.

| Live BE token          | Planned              | Note                        |
| ---------------------- | -------------------- | --------------------------- |
| `User.typ`             | `userType`           | field rename                |
| `UserTyp` `Sys`/`User` | `admin` / `standard` | match Admin / Standard user |

[0006]: docs/adr/0006-safeurl-brand-enforces-sanitize-boundary.md
[0007]: docs/adr/0007-consolidate-jedi-shell-unified-identity.md
[0010]: docs/adr/0010-monorepo-structure.md
[0011]: docs/adr/0011-jedi-backend-domain-contract.md
[0012]: docs/adr/0012-postgres-turso-db-swap-seam.md
[0014]: docs/adr/0014-backend-row-scoped-authorization-seam.md
[0015]: docs/adr/0015-realtime-push-authorization-at-subscribe-time.md
[0016]: docs/adr/0016-poke-rule-typed-receipt.md
[0017]: docs/adr/0017-shared-client-feed-multiplexed.md
[0018]: docs/adr/0018-channel-strings-track-domain-names.md
[0019]: docs/adr/0019-layered-user-text-sanitization.md
[0020]: docs/adr/0020-collapse-channel-vocabulary.md
[0021]: docs/adr/0021-public-projection-surface-selected.md
[0024]: docs/adr/0024-typed-bmc-owner-post-child-tables.md
[0026]: docs/adr/0026-realtime-feed-in-lib-web-contract-in-lib-core.md
[0027]: docs/adr/0027-backend-integers-cross-seam-as-number.md
[0028]: docs/adr/0028-feed-subscriptions-by-channel.md
[0029]: docs/adr/0029-rpc-contract-from-handler-signatures.md
[0030]: docs/adr/0030-unsaved-draft-guard.md
[0031]: docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md
[0032]: docs/adr/0032-delete-cascades-to-every-row-under-it.md
[0033]: docs/adr/0033-saved-theme-in-an-httponly-cookie.md
