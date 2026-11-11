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
| Audit columns                 | [Contract seam](#contract-seam)   |
| Author                        | [Domain](#domain)                 |
| Brand link                    | [User interface](#user-interface) |
| Caption                       | [Domain](#domain)                 |
| Caption hold                  | [User interface](#user-interface) |
| Category                      | [Domain](#domain)                 |
| Channel                       | [Real-time feed](#real-time-feed) |
| Channel semantics rule        | [Real-time feed](#real-time-feed) |
| Comment                       | [Domain](#domain)                 |
| Draft                         | [User interface](#user-interface) |
| Event                         | [Real-time feed](#real-time-feed) |
| Feed                          | [Real-time feed](#real-time-feed) |
| Focus ring                    | [User interface](#user-interface) |
| Focus visibility              | [User interface](#user-interface) |
| Hero                          | [Domain](#domain)                 |
| `IconName`                    | [Contract seam](#contract-seam)   |
| Jedi                          | [Domain](#domain)                 |
| Like                          | [Domain](#domain)                 |
| Nav links                     | [User interface](#user-interface) |
| Owner                         | [Domain](#domain)                 |
| Params shapes                 | [Contract seam](#contract-seam)   |
| photographer                  | [Domain](#domain)                 |
| Post                          | [Domain](#domain)                 |
| Post card                     | [User interface](#user-interface) |
| Post hold                     | [User interface](#user-interface) |
| Profile menu                  | [User interface](#user-interface) |
| Public projection             | [Contract seam](#contract-seam)   |
| RPC contract                  | [Contract seam](#contract-seam)   |
| RPC surfaces                  | [Contract seam](#contract-seam)   |
| `SafeUrl` / `HeroView`        | [Contract seam](#contract-seam)   |
| Sanitization boundary         | [Contract seam](#contract-seam)   |
| Selection highlight           | [User interface](#user-interface) |
| Site menu                     | [User interface](#user-interface) |
| Standard user                 | [Domain](#domain)                 |
| Subscription                  | [Real-time feed](#real-time-feed) |
| Theme                         | [User interface](#user-interface) |
| Top Nav                       | [User interface](#user-interface) |
| Top Photos / Top Captions     | [Domain](#domain)                 |
| ts-rs bindings                | [Contract seam](#contract-seam)   |
| `~/types/backend` barrel      | [Contract seam](#contract-seam)   |
| `useAuth` identity            | [Contract seam](#contract-seam)   |
| User                          | [Domain](#domain)                 |

## Domain

The entities of Jedi and the people who use it.

**Admin user**:
A User with maximum control and configuration permissions. An Admin user creates
the Category taxonomy and edits the Hero.

_BE_: `UserTyp = "Sys"`.
_Planned_: write-gating on admin-only actions; no privilege system exists yet (#181).
_See_: [ADR-0011][0011] addendum.
_Avoid_: system user, superuser, root.

**Author**:
The User who owns a Post, Caption, or Comment (`owner_id`). The UI shows the
Author's name and avatar. A content entity's Author and its Owner are the same
User.

_Avoid_: user (when the owning role is meant); poster.

**Caption**:
An independently-liked line of text that a User submits for a Post, with its own
real-time Comment thread and real-time Likes. Many Captions compete per Post, each
ranked by its own Likes, and the top one shows on the Post. A first-class entity,
never merely a Post's "caption text".

- Its Owner may edit its text only until its first Like or Comment, the Owner's
  own Like too. After that, the Owner may only delete it.
- A delete also removes the Caption's Comments and Likes.
- Text over 36 characters, or an unknown Post, is a `Validation` error.
- A logged-in User clicks **Add** in the Caption actions to open the Caption form
  in the Caption line. On a Post with no Caption, the form shows directly. An edit
  form takes the place of the Caption text.
- A logged-in User likes the Caption shown, from the Caption actions. To like
  another Caption, the User selects it in Top Captions first. Top Captions shows
  counts only.
- The Caption actions start with a **Caption Comments** toggle and the Caption's
  comment count. It opens the thread of the Caption shown in the Comments panel.
  While the thread is open, a re-rank does not change the Caption shown.
- In the Post actions and the Caption actions, a logged-out visitor sees the
  Comments toggle, the fire-heart and the count. A logged-in User sees every
  button, and a button that cannot act now is disabled. Only the Owner can use
  **Edit** and **Delete**. The **Add** in the Post actions opens the New Post
  dialog, as the Nav's **New Post** does.

_BE_: `add_caption` takes a `CaptionForCreate` (`post_id`, `text`), sets the
caller as Owner, and returns the `CaptionView` (author, derived like and comment
counts). The Owner edits with `update_caption` and deletes with `delete_caption`.
A Caption is ranked by its own `caption_like` rows and hosts its own
`CaptionComment` thread. An add, edit or delete pokes `post_caption:{post_id}`. A
Like toggle that changed a Like pokes `caption_like:{caption_id}` and
`post_caption:{post_id}`.
_FE_: the Jedi route holds the selected Post's channel while a User is logged in,
so Top Captions refetches and re-ranks.
_See_: [ADR-0030][0030] addendum; #106, #108, #121, #123, #127, #187.
_Avoid_: title; caption text (as a Post field).

**Category**:
A back-end-owned classification that a Post carries. A Post's on-card "tags" _are_
its Categories. Many-to-many with Post, with **minimum one** per Post. The
single-select sidebar filters Posts by one Category.

- **Static**: loaded once on page load, never real-time.
- A Category has no Owner. An Admin user creates the taxonomy.

_BE_: `Category = { id, name, icon: String }`. `icon` is an **opaque key** that
the back-end never interprets; the front-end maps it to `IconName` with a
fallback. **No** `owner_id` and **no** AI fields.
_Planned_: Admin write-gating (#181).
_See_: [ADR-0011][0011] addendum; #107.
_Avoid_: Tag, Label (as concepts separate from Category); Agent, Topic, Channel
(the retired FullStack term and its abandoned rename targets).

**Comment**:
A User's remark, in a Post's thread or a Caption's thread. Two flat entities, not
one: a **PostComment** parented to a Post, and a **CaptionComment** parented to a
Caption.

- Each is real-time: a new or edited Comment pushes to its thread's subscribers.
- A thread lists its Comments newest first.
- An Owner may edit or delete their own Comment.
- `content` is plain text or markdown, stored as written. The server renders it
  to sanitized HTML on read, and the Owner's edit form loads the stored text.
- In a Comment form, a plain Enter submits and Shift+Enter adds a new line. With a
  touch pointer, Enter adds a new line, and only the button submits.

_BE_: `PostComment` carries `post_id`, and `CaptionComment` carries `caption_id`.
Each has **one direct-parent FK**, an `owner_id` author, and `content`; there is
no polymorphic `parent_kind` discriminator. A read returns a `CommentView`
(author, `content_html` and times), one shape for both kinds; `parent_id` is the
Post or Caption id. One Comment module serves both kinds. An add or a delete also
pokes the channel of the parent's comment count: `posts` for a PostComment,
`post_caption:{post_id}` for a CaptionComment.
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

_BE_: `Hero = { id, title, subtitle, cta_text, background_image, + audit }`, a
single mutable row (`CHECK (id = 1)`) seeded from the fixture. `cta_href` is
**dropped**. The public `get_hero` returns the `HeroView` public projection; the
authenticated `update_hero` edits it. An interim RPC-layer gate admits only an
Admin user (`Sys`); the model write stays unscoped.
_FE_: renders a sanitized `HeroView` (see `SafeUrl` / `HeroView`).
_Planned_: the privilege system replaces the interim gate (#181).
_See_: [ADR-0011][0011] addendum; #110, #119.
_Avoid_: banner, splash (as separate concepts); treating it as per-User content.

**Jedi**:
The application: a responsive, accessible photo-and-caption site with its own
style and navigation. The user-facing brand is **"Awesome"** (`Nav.tsx`, page
`<Title>`, Hero). **Jedi** stays the code and domain token. They coexist by
design: #17's "'Awesome' (formerly Jedi)" is _not_ a rename.

_FE_: `src/types/jedi.ts`, `src/lib/jedi/`; one SolidStart package, a modular
monolith.
_Planned_: a code→brand alignment (Jedi → Awesome) is a separate effort.
_See_: [ADR-0001][0001], [ADR-0008][0008], [ADR-0011][0011]; [ADR-0002][0002]
(the former mock is now the seed source and a test fixture); [ADR-0012][0012]
(database portability).

**Like**:
A User's endorsement of one Post or one Caption: a first-class record, not a
stored counter. At most one Like per User per target (an idempotent toggle). A
like count is _derived_ by counting Likes.

- Captions compete on their own Like tallies (Top Captions).
- A like-count change **pokes** its real-time channel, and the client refetches
  the count.

_BE_: two tables, `post_like = { id, post_id, user_id, + audit }` and
`caption_like = { id, caption_id, user_id, + audit }`, each `unique(parent, user)`
so a toggle is idempotent. A Like is **write-once** (insert or delete, never
updated), but both tables carry the full audit columns. Counts are never stored.
One Like module serves both targets.
_See_: [ADR-0011][0011] addendum, [ADR-0024][0024] addendum; #117, #118, #122,
#123.
_Avoid_: vote, favorite, star; `likeCount` as stored truth.

**Owner**:
The User who created a Post, Caption, or Comment. Fixed for the entity's life: an
entity never transfers to another User.

- Only its Owner or an Admin user may delete it. Only its Owner may edit it.
- A delete also removes the rows under the entity, even rows that other Users own.
- Category and Hero have **no** Owner: the taxonomy is back-end-owned and the Hero
  is a singleton, both Admin-managed.

_BE_: the `owner_id` column on `Post`, `Caption`, `PostComment` and
`CaptionComment`.
_Planned_: Admin write-gating (#181).
_See_: [ADR-0032][0032].
_Avoid_: creator.

**photographer**:
The external Flickr attribution on a Post: the photo's original creator, who is
**not** a User.

_Avoid_: author (that names the owning User); user.

**Post**:
The core entity: a shared Flickr photo with its Owner, Categories, Caption
competition, real-time Comment thread and real-time Likes. The Post _is_ the photo
(mandatory, and fixed for the Post's life). **Every Post is public**: any
logged-in User may read and take part; there is no private or archived scope.

- A Post carries many Categories, **minimum one**.
- The Nav's **New Post** opens the New Post dialog, which creates a Post.
- The Owner edits the title, the image description, the attribution and the
  Categories, never the photo.
- A delete also removes the Post's Captions, Comments and Likes.
- An empty or unknown `category_ids`, a title over 36 characters, or an unsafe
  URL is a `Validation` error.
- **Top Photos** is Posts ranked by likes, not a separate entity.

_BE_: a first-class entity, `owner_id → User`, with its Categories in a
`post_category` join. `create_post` takes a `PostForCreate` (with its
`category_ids`), sets the caller as Owner, and returns the `PostView` (author,
resolved Categories, and derived like and comment counts). The Owner edits with
`update_post` and deletes with `delete_post`. URL fields are validated and
**rejected** on write. Each write pokes `posts`; the Jedi route subscribes while a
User is logged in, so every client refetches.
_Planned_: the Admin delete (#181).
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
Captions is the selected Post's Captions ordered by like count.

_BE_: the same `list_*` RPCs ordered by the derived like count; no stored tables.
_Planned_: Top Photos within the selected Category, once filtering lands (#29).
_See_: [ADR-0011][0011] addendum.
_Avoid_: featured/popular list, best captions (as stored data).

**User**:
An authenticated identity that owns Posts and Captions, authors Comments, and
casts Likes. Every User is either an Admin user or a Standard user. One User is
the identity on both surfaces.

- A username has at most 32 characters.

_BE_: `User = { id, username, typ, avatar_url }` with `UserTyp = "Sys" | "User"`.
`avatar_url` is a back-end column.
_FE_: the nav avatar reads the identity through the `useAuth` seam.
_See_: [ADR-0007][0007], [ADR-0011][0011] addendum; #117, #203.
_Avoid_: account.

## Real-time feed

How Comments, Captions and Likes reach a User's client live, without polling.

**Channel**:
The routing key that an Event is addressed to and a Subscription names. The
exported `Channel` type holds **six variants**:

| Wire string       | Routing key                    | Semantics |
| ----------------- | ------------------------------ | --------- |
| `posts`           | `posts`                        | poke      |
| `post_comment`    | `post_comment:{post_id}`       | payload   |
| `caption_comment` | `caption_comment:{caption_id}` | payload   |
| `post_like`       | `post_like:{post_id}`          | poke      |
| `caption_like`    | `caption_like:{caption_id}`    | poke      |
| `post_caption`    | `post_caption:{post_id}`       | poke      |

_BE_: one ts-rs-exported `Channel` enum (`lib-core::realtime::channel`): one typed
variant per channel, with the id where the routing key needs it, snake_case wire
strings and PascalCase Rust variants. `ChannelKind` is merged into it.
_FE_: the `Channel` constructor module (`lib/channel.ts`) over the generated
`Channel`.
_See_: [ADR-0018][0018] addendum, [ADR-0020][0020]; #109.
_Avoid_: topic, room; the retired `agents` / `conv` / `convs` strings.

**Channel semantics rule**:
A Channel's semantics follow its data shape.

- **Threads push.** An append-or-edit thread carries the item as a payload: the
  two comment channels.
- **Lists and counts poke.** A ranked or derived view sends a contentless poke.
  The client refetches through the scoped `list_*` RPC, so no row crosses the
  push path. This covers `posts` (the list), `post_like` / `caption_like`
  (derived counts), and `post_caption` (the Top Captions ranking, which
  reshuffles on every like).
- **The writer does not wait.** A User's own write shows at once in that User's
  client: it does not wait for the Event. The Event is for the other clients.

_BE_: a list-or-count mutation proves its poke at compile time. A `broadcast_*`
mints a channel-typed `PokeReceipt<C>`, and the handler returns
`PokedRpcResult<T, C>`, which `::new` cannot build without the matching receipt:
no poke, no receipt, no compile. A wrong-feed poke is a type error. The wire stays
`{ data: … }` (the marker is skipped), so no binding changes.
_See_: [ADR-0016][0016]; #85, #102, #109, #283 (C-29).
_Avoid_: refresh, notify.

**Event**:
One notification carried on the Feed. A **payload** Event carries its item: a
PostComment or CaptionComment, as a tagged upsert-or-removal (a Comment may be
edited or deleted, not only appended). A **poke** Event is contentless, and the
client refetches (`posts`, `post_like`, `caption_like`, `post_caption`).

_BE_: `WsEvent` (`lib-core::realtime::event`): payload variants (an upsert and a
removal for each of the two comment channels) plus one `Poke(Channel)` for the
contentless pokes, tagged by `event_type` (ts-rs-exported). A poke carries its
`Channel`; a payload derives its `Channel` from the payload. A Comment upsert
carries a `CommentView`, and a removal a `CommentRemoval` (`id`, `parent_id`).
_See_: [ADR-0011][0011] addendum, [ADR-0020][0020]; #109, #125.
_Avoid_: notification, broadcast (the mechanism, not the item).

**Feed**:
The live stream that a User's client receives Events on, without polling. One per
client: every view that a client shows shares the single Feed.

_BE_: a WebSocket at `GET /ws` (auth-required). One broadcast fans Events to all
connections, each filtered to its Subscriptions. The transport is `lib-web::ws`
(hub, socket driver, authorization fan-out); the exported contract lives in
`lib-core::realtime`.
_FE_: the shared client Feed (`lib/feed.ts`), one per client, injected into each
view-model. A WebSocket transport carries it; an in-memory transport serves tests.
_See_: [ADR-0017][0017], [ADR-0026][0026], [ADR-0028][0028].
_Avoid_: socket (as the concept), push.

**Subscription**:
A client's standing request to receive Events on a Channel. Every Channel is
**authenticated-read**: any logged-in socket may subscribe, because every Post is
public. A connection with no Subscription receives nothing.

_BE_: `SubscriptionRequest { action, channel }` with `channel: Channel`. The id
rides inside the variant, so `post_comment` without an id fails to deserialize.
Held per connection and authorized per variant. Every variant is
authenticated-read; the exhaustive `authorize` match stays as the seam for a
future scoped channel.
_FE_: `feed.subscribe(channel, handler)`: a view-model names a Channel and a
handler, and its reactive scope releases the Subscription. Each view-model holds
its own. The Feed sends one per Channel to the server, replays them on
(re)connect, then asks each handler to resync.
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
`mid` / `mtime`: creator id / create time, modifier id / modify time. `ctime` and
`mtime` are RFC3339 `TEXT` in the portable schema.

- A Like is write-once, but `post_like` / `caption_like` still carry the full
  audit columns.

_See_: [ADR-0012][0012]; #117, #118.

**`IconName`** (↔ `Category.icon`):
The union of the sprite ids, `IconName = (typeof ICON_NAMES)[number]`. The
back-end owns `Category.icon` as an opaque `String`, so the `jedi-api` seam maps
that key to an `IconName` **with a fallback** to `"menu"`.

_FE_: `components/Icon.tsx`; `toIconName` (`lib/jedi/jedi-api.ts`). The unit test
checks "known key or fallback" (`lib/jedi/jedi-api.unit.test.ts`).
_See_: [ADR-0011][0011]; #116.

**Params shapes**:
The shared RPC param shapes, exported through the same ts-rs seam as the entities.

- `ParamsIded = { id }` carries an id-only call (fetch or delete by id).
- `ParamsIdedList = { id }` carries a child list by its parent id
  (`list_captions_for_post`, the Comment lists).
- `ParamsForCreate<D> = { data }` carries a create.
- `ParamsForUpdate<D> = { id, data }` carries an update.
- `ParamsList<F>` exports no field: its `filters` and `list_options` stay on the
  back-end until a front-end caller needs them.

_See_: #176.

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
  surface strips, and a future admin surface reads the full row. A visitor and a
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

_BE_: `web/rpcs/rpc_contract.rs`, exported as `bindings/RpcContract.ts`.
_FE_: `authenticatedRpc(method, params)` and `publicRpc(method, params)` in
`lib/backend-rpc.ts`.
_See_: [ADR-0029][0029].
_Avoid_: API schema, method registry; an RPC member per method.

**RPC surfaces** (authenticated and public):
The back-end's two JSON-RPC endpoints. `/api/rpc` is **authenticated** (behind
`mw_ctx_require`): it carries every mutation and every row-scoped read, and runs
under the caller's own `Ctx`. `/api/rpc-public` is **public** (no auth): it
carries a hand-picked set of anonymous reads, and runs under `root_ctx`.

- The Jedi feed's static, back-end-owned content is public, so the front-end reads
  it without a login: the Category, Post, Caption and Hero reads.
- Register ONLY safe public reads there: never a mutation or a row-scoped read.
- The **RPC contract** test enforces the list: the public surface must carry
  exactly the contract's public entries.

_See_: #116–#119.
_Avoid_: putting an anonymous read behind auth (it breaks the public landing page).

**`SafeUrl` / `HeroView`** (↔ `Hero`):
The seam returns the `Hero` as a sanitized `HeroView` whose URL field is typed
`SafeUrl`: a brand `string & { __brand: "SafeUrl" }` minted only by `sanitizeUrl`
/ `trustedUrl`, so a raw string cannot reach a URL sink unsanitized. `HeroView`
keeps `backgroundImage` as its one `SafeUrl` field. The CTA runs fixed front-end
code (a `#` placeholder until an account-creation flow exists).

- The back-end also **rejects** an unsafe URL on write: a `DbBmc::url_fields`
  column must be `http(s)://…`, a root-relative path, or a fragment, with no
  `' " ( ) \` (`check_safe_url`, the same rule as `sanitizeUrl`).
- `Hero.background_image`, `User.avatar_url`, and the Post's `image_src`,
  `photographer_url` and `source_url` declare it.

_FE_: `types/jedi.ts`; `lib/sanitizeUrl.ts`.
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

## User interface

How the front-end (`frontend/src/`) shows the domain.

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

**Draft** (unsaved form text):
Text that a User typed in a form and has not saved.

- A Comment compose box or an Add Caption form holds one when it is not blank.
- A New Post dialog holds one when a field is not blank or a Category is checked.
- An open Comment, Caption or Post edit holds one when it differs from the saved
  entity.
- A Cancel, an Escape or a user-started move that would close the form asks first.
- While the form is saving, no user-started move closes it.
- An Event that removes the form's subject discards the Draft, and a notice says so.
- A Caption that arrives does not close an Add Caption form with a Draft.
- An Event that moves the Post out of the selected Category keeps the Post shown.
  The User then chooses to keep or discard the Draft.

_See_: [ADR-0030][0030].
_Avoid_: unsaved comment, pending edit; "lost" or "rejected" for a forced discard.

**Focus ring** (active-option ring):
The keyboard-navigation indicator on the active option of a sidebar listbox. It
marks where roving keyboard focus sits, and it is **keyboard-modality only** (see
Focus visibility).

- Painting it on a pointer click, or leaving it on an unfocused listbox, is a bug.
- It is a separate visual state from the Selection highlight.

_FE_: `ring-2 ring-(--theme-accent)`. The three sidebar cards (Categories, Top
Photos, Top Captions) are single-select **listboxes** with a roving
`aria-activedescendant`.
_See_: #38.
_Avoid_: selection ring; treating it as a selection cue.

**Focus visibility** (`:focus-visible`):
Focus indicators show for **keyboard** interaction only, never for pointer clicks.

- The app's global rule styles focus via `:focus-visible` (keyboard-only, WCAG
  2.4.7–compliant). The sidebar's Focus ring follows the same modality rule.
- A focus ring on a mouse click is a defect, not desired behavior. The `<main>`
  action buttons that show no ring on click are correct.

_Avoid_: always-on focus outlines; showing the ring on pointer interaction.

**Nav links**:
Home, About and Readme.

- The Top Nav shows them on a wide screen (768 px and wider). The Site menu shows
  them on a narrow screen.
- The Nav link of the current page has an underline.

_Avoid_: menu items, tabs.

**Post card**:
The main article, which shows the selected Post. From the top, it holds the title
bar, the photo and the **Author line**. Under them come the **Post actions**, the
**Caption line**, the **Caption actions** and the **Comments panel**.

- The Author line holds the Author's avatar and name, the Post title and the
  Categories.
- The Caption line holds the Caption shown, or a Caption form in its place.
- Each actions line starts with its Comments toggle: **Post Comments** or
  **Caption Comments**.
- The Comments panel shows one thread at a time, the Post's or the Caption's.

_FE_: `FeaturedPost` (`components/FeaturedPost.tsx`).
_See_: [ADR-0030][0030] addendum; #210.
_Avoid_: Featured Post (`featured` is the top-ranked Post, only the default); Post
line; categories line.

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

**Profile menu**:
The drop-down that the avatar button in the nav opens. It holds My Profile, Log In
or Log Out, and the three Theme items.

- Every visitor can open it, at every width, also before login.

_FE_: the `profile-menu` disclosure in `Nav` (`components/Nav.tsx`).
_Avoid_: nav drop-down, profile dropdown, user menu.

**Selection highlight**:
The persistent mark on the option that _is_ the current selection in a sidebar
listbox. It reflects application state: the selected Category, Post or Caption.

- It must **always** be present on the selected option, regardless of input
  modality. Losing it when the selection changes is a bug.
- It is a separate visual state from the Focus ring.

_FE_: `bg-(--theme-highlight)`.
_See_: #37.
_Avoid_: focus highlight; conflating it with the focus ring.

**Site menu**:
The drop-down that holds the Nav links on a narrow screen (below 768 px). The ☰
button in the Top Nav opens it. It is not the Profile menu.

_FE_: the `site-mobile-nav` disclosure in `Nav`; its accessible name is "Site menu".
_Avoid_: mobile menu, mobile nav, hamburger menu.

**Theme**:
The light or dark look of the site. There are three: **System Theme**, **Light
Theme** and **Dark Theme**.

- System Theme follows the light or dark setting of the device, and it is the
  default.
- A visitor chooses a Theme in the Profile menu, and a check mark shows the Theme
  in use.
- The browser keeps the choice: the **saved theme**. A User does not own it. It
  does not follow the User to another browser, and login and logout do not
  change it.

_FE_: the server reads the saved theme from a cookie, so the first paint shows it.
_See_: [ADR-0033][0033].
_Avoid_: mode, color mode, dark mode, auto, selected theme; color scheme (the CSS
`color-scheme` property tells the browser which built-in colors to use).

**Top Nav**:
The bar at the top of every page. It holds the Brand link, the Nav links, the
Profile menu button, New Post for a logged-in User, and the Site menu button on a
narrow screen.

_FE_: `Nav` (`components/Nav.tsx`).
_Avoid_: header, navbar, top bar.

## Pending renames

Identity tokens that still wait for a rename.

| Live BE token                   | Planned              | Note                                   |
| ------------------------------- | -------------------- | -------------------------------------- |
| `typ` (field on `User`)         | `userType`           | field rename                           |
| `UserTyp` values `Sys` / `User` | `admin` / `standard` | align to the Admin/Standard user terms |

[0001]: docs/adr/0001-frontend-modular-monolith.md
[0002]: docs/adr/0002-jedi-mock-data-contract.md
[0006]: docs/adr/0006-safeurl-brand-enforces-sanitize-boundary.md
[0007]: docs/adr/0007-consolidate-jedi-shell-unified-identity.md
[0008]: docs/adr/0008-keep-solidstart-leptos-tradeoff.md
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
