# SolidStart Demo — Domain Model

The shared domain model for the SolidStart Demo mono-repo — **one bounded context
with two surfaces** ([ADR-0010](docs/adr/0010-monorepo-structure.md)): a SolidStart
front-end (`frontend/`) and a Rust/Axum back-end (`backend/`), unified by one
authenticated **User** ([ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md),
[ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)). The front-end is a single
SolidStart package — a modular monolith ([ADR-0001](docs/adr/0001-frontend-modular-monolith.md),
ADR-0007; kept over full-Rust per [ADR-0008](docs/adr/0008-keep-solidstart-leptos-tradeoff.md)).
**Jedi** is the application: a photo-and-caption feed whose Posts, Captions, and
Likes carry **real-time Comment threads and Like counts**. The merge (map #105)
folded the former **Realtime Conversations** page — the **FullStack** nav link —
into Jedi. The standalone page, its nav link and its back-end are removed (#128).
Its real-time thread mechanism lives on as Jedi's Comment threads
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum,
[ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md)). The
back-end owns the domain and exports it to the front-end as ts-rs bindings (the
_contract seam_, below).

**Merge status.** The merge is **complete** (#128). Each Jedi table was built
beside its FullStack table, and #128 removed the FullStack tables, RPCs, channels
and page
([ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md)).
Jedi's front-end reads the back-end through the contract seam. The former mock
`data.json` stays as the source of the seed data and as a test fixture
([ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)). The history is the **Merge
lineage** table under **Back-end surface & contract seam**.

**Reading this glossary.** Entity entries are surface-neutral; italic labels mark
the rest:

- `_BE_:` — how the **back-end** realizes the term (fields, tables, tokens).
- `_FE_:` — how the **front-end** realizes it (render, seam, a11y).
- `_Planned_:` — contracted but **not yet built**, for example Admin write-gating (#181) and the identity-token renames.
- `_Avoid_:` — synonyms the project deliberately does **not** use.

## Jedi

A responsive, accessible photo-and-caption application with its own style and
navigation. Users share Flickr photos as **Posts** and compete to caption them;
both Posts and Captions accrue **Likes** and host real-time **Comment** threads.
The back-end serves the content
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)). The former
back-end-faithful mock ([ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)) is now
the seed source and a test fixture. The database portability the back-end must
respect is [ADR-0012](docs/adr/0012-postgres-turso-db-swap-seam.md), and the
mono-repo that houses both surfaces is [ADR-0010](docs/adr/0010-monorepo-structure.md).

_Brand_: the user-facing wordmark is **"Awesome"** (`Nav.tsx`, page `<Title>`,
hero); **Jedi** stays the code/domain token (`src/types/jedi.ts`, `src/lib/jedi/`,
ADRs). They coexist by design — #17's "'Awesome' (formerly Jedi)" is _not_ a
rename. A future code→brand alignment (Jedi → Awesome) is a separate effort, not
part of this merge.

_Status_: built (#116–#127). #128 removed the FullStack back-end that the Jedi
tables were built beside.

**User**:
An authenticated identity that owns Posts and Captions, authors Comments, and casts
Likes. Every User is either an Admin user or a Standard user.
_Avoid_: account.
_BE_: `User = { id, username, typ, avatar_url }` with
`UserTyp = "Sys" | "User"`. The merge **persisted `avatar_url`** as a back-end
column (#117), moving it off the front-end
`useAuth` seam and realizing the one cross-surface identity of
[ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md)
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).
_FE_: the nav avatar reads the identity through the `useAuth` seam; the mock→real
swap stays behind that seam (Front-end surface).

**Admin user**:
A User holding maximum control and configuration permissions — creates the Category
taxonomy and edits the Hero.
_Avoid_: system user, superuser, root.
_BE_ (Planned): `UserTyp = "Sys"`. Write-gating on admin-only actions is deferred —
no privilege system exists yet ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).

**Standard user**:
A User with ordinary permissions — the default tier (deliberately not called
"User", which names the identity above).
_Avoid_: regular user.
_BE_: `UserTyp = "User"`.

**Owner**:
The User who created a Post, Caption, or Comment — the `owner_id`. Fixed for the
entity's life; an entity never transfers to another User. Only its Owner or an Admin
user may delete it; only its Owner may edit it. A delete also removes the rows under
the entity, even rows that other Users own
([ADR-0032](docs/adr/0032-delete-cascades-to-every-row-under-it.md)). Category and
Hero have **no** Owner — the taxonomy is back-end-owned and the Hero is a singleton,
both Admin-managed (write-gating deferred).
_Avoid_: creator.
_BE_: the `owner_id` column on `Post`, `Caption`, `PostComment`, and
`CaptionComment`.

**Author**:
The User who owns a Post, Caption, or Comment (`owner_id`); the UI renders the
author's name and avatar. Now that Members are retired, a content entity's author
and its Owner are the same User.
_Avoid_: user (when the owning role is meant); poster.

**photographer**:
The external Flickr attribution on a Post — the photo's original creator, who is
**not** a User.
_Avoid_: author (that names the owning User); user.

**Post**:
The core feed entity — a shared Flickr photo with its owner, Categories, caption
competition, real-time Comment thread, and real-time Likes. The Post _is_ the photo
(mandatory, and fixed for the Post's life). **Every Post is public** — any logged-in
User may read and take part; there is no private or archived scope. **Top Photos**
is Posts ranked by likes, not a separate entity.
_Avoid_: Photo (as a distinct entity), Image, feed item; Conversation, thread, room
(the retired FullStack terms).
_BE_: a first-class entity, `owner_id → User`. The FullStack access
`kind` / `state` and the `ConvUser` membership table were **dropped** — every Post is
public (#106). A Post carries many Categories, **minimum one**, via a
`post_category` join (#107). Read returns an enriched `PostView` — author, resolved
Categories, and derived like / comment counts. URL fields are validated and
**rejected** on write ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)
addendum, [ADR-0019](docs/adr/0019-layered-user-text-sanitization.md)).
_Built_ (#120): the authenticated `create_post` takes a `PostForCreate` (with its
`category_ids`), sets the caller as Owner, and returns the `PostView`. An empty or
unknown `category_ids`, a title over 36 characters, or an unsafe URL is a
`Validation` error. A create pokes `posts`; the Jedi route subscribes while a User
is logged in, so every client refetches. The **New Post** dialog submits it. The
Nav's **New Post** opens the dialog.
_Built_ (#187): the Owner edits a Post with `update_post` and deletes it with
`delete_post`. An edit changes the title, the image description, the attribution
and the Categories, never the photo. A delete also removes the Post's Captions,
Comments and Likes. Each write pokes `posts`. The Admin delete waits for #181.
_Lineage_: built beside the FullStack `Conv`, which #128 removed
([ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md)).

**Caption**:
An independently-liked line of text a User submits for a Post, with its own
real-time Comment thread and real-time Likes. Many Captions compete per Post, each
ranked by its own Likes; the top one is shown on the Post. A first-class entity —
never merely a Post's "caption text". Its Owner may edit its text only until its
first Like or Comment; after that, the Owner may only delete it.
_Avoid_: title; caption text (as a Post field).
_BE_: a first-class entity; ranked by its own `caption_like` rows; hosts
its own `CaptionComment` thread (#106, #108). Read returns an enriched
`CaptionView` (author, derived like / comment counts).
_Built_ (#121): the authenticated `add_caption` takes a `CaptionForCreate`
(`post_id`, `text`), sets the caller as Owner, and returns the `CaptionView`. Text
over 36 characters or an unknown Post is a `Validation` error. An add pokes
`post_caption:{post_id}`; the Jedi route holds the selected Post's channel while a
User is logged in, so Top Captions refetches and re-ranks. On the Post, the
full-width caption line swaps to the caption form: a logged-in User clicks **Add**
on the categories line, or sees the form directly when the Post has no
caption.
_Built_ (#123): a logged-in User likes the Caption shown on the Post, from the
Caption actions on the categories line: fire-heart, count, **Like**, **Add**,
**Edit**, **Delete**. To like another Caption, the User selects it in Top
Captions first; Top Captions shows counts only. A toggle that changed a Like pokes
`caption_like:{caption_id}` and `post_caption:{post_id}`. On the Post line and the
Caption line, a visitor who is not logged in sees only the fire-heart and the
count. A logged-in User sees every button, and a button that cannot act now is
disabled: only the Owner can use **Edit** and **Delete**. The Post line's **Add**
opens the same New Post dialog as the Nav.
_Built_ (#127): the Caption actions start with a **Comments** toggle and the
Caption's comment count. It opens the Caption's thread below the categories line,
for the Caption shown. While the thread is open, a re-rank does not change the
Caption shown ([ADR-0030](docs/adr/0030-unsaved-draft-guard.md) addendum).
_Built_ (#187): the Owner edits the text with `update_caption` and deletes the
Caption with `delete_caption`. An edit after the first Like or Comment, the
Owner's own Like too, is a `Validation` error. A delete also removes the Caption's
Comments and Likes. Each write pokes `post_caption:{post_id}`. In the Caption line,
the edit form takes the place of the Caption text.

**Category**:
A back-end-owned classification a Post carries; a Post's on-card "tags" _are_ its
Categories. Many-to-many with Post, **minimum one** per Post. The single-select
sidebar filters Posts by one Category.
_Avoid_: Tag, Label (as concepts separate from Category); Agent, Topic, Channel
(the retired FullStack term and its abandoned rename targets).
_BE_: `Category = { id, name, icon: String }` — `icon` is an **opaque
key** the back-end never interprets; the front-end maps it to `IconName` with a
fallback (Front-end surface). **No** `owner_id` and **no** AI fields — an Admin user
creates the taxonomy (write-gating deferred). **Static** — loaded once on page
load, never real-time (#107).
_Lineage_: built beside the FullStack `Agent`, which #128 removed. It drops
`Agent`'s `ai_provider` / `ai_model` fields, and the `agents` real-time channel is
**retired** ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum,
#107, [ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md)).

**Comment**:
A User's remark, authored in a Post's thread or a Caption's thread. Two flat
entities, not one: a **PostComment** parented to a Post, and a **CaptionComment**
parented to a Caption. Each is real-time — a new or edited Comment pushes to its
thread's subscribers. A thread lists its Comments newest first (#125).
_Avoid_: post, reply; Message (the retired FullStack term).
_BE_: `PostComment` carries `post_id`; `CaptionComment` carries
`caption_id`. Each has **one direct-parent FK**, an `owner_id` author, and
`content`; there is no polymorphic `parent_kind` discriminator (#108). An owner may
edit or delete their own Comment
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).
Read returns an enriched `CommentView` (author, `content_html` and times), one
shape for both kinds; `parent_id` is the Post or Caption id (#125). A Comment's
`content` is plain text or markdown, stored as written. The server renders it to
sanitized HTML on read, and the Owner's edit form loads the stored text
([ADR-0019](docs/adr/0019-layered-user-text-sanitization.md) addendum, #126).
_Built_ (#124–#127): one Comment module serves both kinds
([ADR-0024](docs/adr/0024-typed-bmc-owner-post-child-tables.md) addendum). An add or
a delete also pokes the channel of the parent's comment count: `posts` for a
PostComment, `post_caption:{post_id}` for a CaptionComment.
_Lineage_: built beside the FullStack `ConvMsg`, **split into two** (#108). #128
removed `ConvMsg`
([ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md)).

**Like**:
A User's endorsement of one Post or one Caption — a first-class record, not a stored
counter. At most one Like per User per target (an idempotent toggle); a like count
is _derived_ by counting Likes. Captions compete on their own Like tallies (Top
Captions). A like-count change **pokes** its real-time channel; the client refetches
the count.
_Avoid_: vote, favorite, star; `likeCount` as stored truth.
_BE_: two tables — `post_like = { id, post_id, user_id, + audit }` and
`caption_like = { id, caption_id, user_id, + audit }`, each `unique(parent, user)`
so a toggle is idempotent. A Like is **write-once** (insert or delete, never
updated), but both tables carry the full audit columns (`cid` / `ctime` / `mid` /
`mtime`) like every other table (#117, #118). Counts are **derived by counting
rows**, never stored ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)
addendum).
_Built_ (#122, #123): one Like module serves both targets, Post and Caption
([ADR-0024](docs/adr/0024-typed-bmc-owner-post-child-tables.md) addendum).

**Top Photos** / **Top Captions**:
Ranked _views_, not stored lists. Top Photos = Posts ordered by like count (within
the selected Category once filtering lands, #29); Top Captions = the selected Post's
Captions ordered by like count.
_Avoid_: featured/popular list, best captions (as stored data).
_BE_: the same `list_*` RPCs ordered by the derived like count — not
stored tables ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).

**Hero**:
The home page's banner content — title, subtitle, CTA text, background image. A
back-end-owned **singleton** an Admin user edits to change home branding; not
user-generated and not `owner_id`-owned.
_Avoid_: banner, splash (as separate concepts); treating it as per-User content.
_BE_: `Hero = { id, title, subtitle, cta_text, background_image, + audit }`
— a single mutable row. The CTA target is **not** a stored field: the button runs
fixed front-end code (create a new account), so `cta_href` is **dropped**
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum, #110). The
front-end renders it as a sanitized `HeroView` (Front-end surface). Admin
write-gating is deferred.
_Built_ (#119): the `hero` table is a singleton (`CHECK (id = 1)`), seeded from the
fixture. The public `get_hero` returns the `HeroView` public projection; the
authenticated `update_hero` edits it. An interim RPC-layer gate admits only an
Admin user (`Sys`) until the privilege system lands (#181); the model write stays
unscoped. No RPC creates or deletes it.

### Real-time feed

How Jedi's Comments, Captions, and Likes reach a User's client live, without
polling. This is the mechanism the former Realtime Conversations page ran on; the
merge re-pointed it at Jedi's entities
([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum, #109). The
entities above are what it carries.

_Status_: built. The six merged channels are live, and #128 removed the FullStack
channels.

**Feed**:
The live stream a User's client receives Events on, without polling. One per client:
every view a client shows shares the single Feed.
_Avoid_: socket (as the concept), push.
_BE_: a WebSocket at `GET /ws` (auth-required); one broadcast fans Events to all
connections, each filtered to its Subscriptions. The transport is `lib-web::ws`
(hub, socket driver, authorization fan-out); the exported contract lives in
`lib-core::realtime`.
_FE_: the shared client Feed (`lib/feed.ts`); one per client, injected into each
view-model ([ADR-0017](docs/adr/0017-shared-client-feed-multiplexed.md),
[ADR-0028](docs/adr/0028-feed-subscriptions-by-channel.md)). A WebSocket transport
carries it; an in-memory transport serves tests.

**Channel**:
The routing key an Event is addressed to and a Subscription names. After the merge
the exported `Channel` type holds **six variants** (#109; [ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)):

| Wire string       | Routing key                    | Semantics |
| ----------------- | ------------------------------ | --------- |
| `posts`           | `posts`                        | poke      |
| `post_comment`    | `post_comment:{post_id}`       | payload   |
| `caption_comment` | `caption_comment:{caption_id}` | payload   |
| `post_like`       | `post_like:{post_id}`          | poke      |
| `caption_like`    | `caption_like:{caption_id}`    | poke      |
| `post_caption`    | `post_caption:{post_id}`       | poke      |

_Avoid_: topic, room; the retired `agents` / `conv` / `convs` strings.
_BE_: one ts-rs-exported `Channel` enum (`lib-core::realtime::channel`) — one typed variant per channel,
id where the routing key needs it, snake_case wire strings, PascalCase Rust variants;
`ChannelKind` is merged into it ([ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)). The FullStack `agents` channel is **retired** (Category
static), the id-bearing `conv:{id}` is **retired** (its message stream splits into
the two comment channels), and `convs` became `posts`. #128 removed the retired
variants ([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum,
#109, [ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md)).
_FE_: the `Channel` constructor module (`lib/channel.ts`) over the
generated `Channel` ([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md),
[ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)).

**Subscription**:
A client's standing request to receive Events on a Channel. After the merge every
Channel is **authenticated-read**: any logged-in socket may subscribe, because every
Post is public (#106, #109). The former owner ∪ `MultiUsers` per-row scope
([ADR-0014](docs/adr/0014-backend-row-scoped-authorization-seam.md),
[ADR-0015](docs/adr/0015-realtime-push-authorization-at-subscribe-time.md)) is
dropped. A connection with no Subscription receives nothing.
_Avoid_: listener, watch.
_BE_: `SubscriptionRequest { action, channel }` with `channel: Channel` —
the id rides inside the variant, so `post_comment` without an id fails to
deserialize; held per-connection and authorized per variant. Every variant is
authenticated-read; the exhaustive `authorize` match stays as the seam for a future
scoped channel ([ADR-0015](docs/adr/0015-realtime-push-authorization-at-subscribe-time.md),
[ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md))
([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum,
[ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)).
_FE_: `feed.subscribe(channel, handler)` — a view-model names a Channel and a
handler, and its reactive scope releases the Subscription. Each view-model holds its
own; the Feed sends one per Channel to the server, replays them on (re)connect, then
asks each handler to resync ([ADR-0028](docs/adr/0028-feed-subscriptions-by-channel.md)).

**Event**:
One notification carried on the Feed. A **payload** Event carries its item — a
PostComment or CaptionComment, as a tagged upsert-or-removal (a Comment may be
edited or deleted, not only appended). A **poke** Event is contentless; the client
refetches (`posts`, `post_like`, `caption_like`, `post_caption`).
_Avoid_: notification, broadcast (the mechanism, not the item).
_BE_: the merged `WsEvent` (`lib-core::realtime::event`) — payload variants (an upsert and a removal
for each of the two comment channels) plus one `Poke(Channel)` for the contentless pokes, tagged by
`event_type` (ts-rs-exported). A poke carries its `Channel`; a payload derives its
`Channel` from the payload ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)
addendum, #109; [ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)).
A Comment upsert carries a `CommentView`, and a removal a `CommentRemoval` (`id`,
`parent_id`) (#125).

**Channel semantics rule**:
A Channel's semantics follow its data shape (#109):

- **Threads push.** An append-or-edit thread carries the item as a payload — the two
  comment channels.
- **Lists and counts poke.** A ranked or derived view sends a contentless poke; the
  client refetches through the scoped `list_*` RPC, so no row crosses the push path
  (#85). This covers `posts` (the list), `post_like` / `caption_like` (derived
  counts), and `post_caption` (the Top Captions ranking, which reshuffles on every
  like).

_Avoid_: refresh, notify.
_BE_: a list-or-count mutation proves its poke at compile time. A `broadcast_*`
mints a channel-typed `PokeReceipt<C>`, and the handler returns
`PokedRpcResult<T, C>`, which `::new` cannot build without the matching receipt —
no poke, no receipt, no compile. A wrong-feed poke is a type error. The wire stays
`{ data: … }` (the marker is skipped), so no binding changes
([ADR-0016](docs/adr/0016-poke-rule-typed-receipt.md), #102).

## Back-end surface & contract seam

The back-end (`backend/`, Rust/Axum, rust10x blueprint) owns the domain and exports
it to the front-end as **ts-rs bindings** — the contract both surfaces share. This
section names that seam's vocabulary; the _mechanism_ (the tsconfig `paths` alias,
the CI bindings-drift guard) lives in
[ADR-0010](docs/adr/0010-monorepo-structure.md), not here.

**Unified `User`** (the cross-surface identity):
One back-end `User = { id, username, typ, avatar_url }`
(`UserTyp = "Sys" | "User"`) owns Posts, Captions, and Comments and casts Likes.
It is the same identity that owned the FullStack Conversations, which #128 removed
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)). This completes the
convergence set out in
[ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md).

**ts-rs bindings** (the FE↔BE contract):
The back-end's `#[derive(TS)]` types export to
`backend/crates/services/web-server/bindings/`; the front-end consumes them, so a
back-end type change _is_ a front-end contract change (CI guards the two in step —
ADR-0010). Every back-end integer, an id or a count, is a `number` in the bindings,
as on the JSON wire. A value above 2⁵³−1 loses precision
([ADR-0027](docs/adr/0027-backend-integers-cross-seam-as-number.md)).
_Avoid_: DTO, hand-kept schema — there is one generated source of truth.

**`~/types/backend` barrel**:
The front-end imports bindings **only** through the `~/types/backend` barrel, which
re-exports each binding unchanged and layers its locally-defined types. Consumers
never import raw `bindings/` files directly. See
[ADR-0010](docs/adr/0010-monorepo-structure.md).
_Avoid_: re-typing a binding at the barrel — fix the type at its Rust source
([ADR-0027](docs/adr/0027-backend-integers-cross-seam-as-number.md)).

**`ParamsIded` / `ParamsIdedList` / `ParamsForCreate<D>` / `ParamsForUpdate<D>`** (shared RPC param shapes):
`ParamsIded = { id }` carries an id-only call (fetch/delete by id);
`ParamsIdedList = { id }` carries a child list by its parent id
(`list_captions_for_post`, the Comment lists); `ParamsForCreate<D> = { data }`
carries a create; `ParamsForUpdate<D> = { id, data }` carries an update. All four
are exported through the same ts-rs seam as the entities. `ParamsList<F>` exports
no field: its `filters` and `list_options` stay on the back-end until a front-end
caller needs them (#176).

**RPC surfaces** (authenticated vs public):
The back-end exposes two JSON-RPC endpoints. `/api/rpc` is **authenticated** (behind
`mw_ctx_require`) and carries every mutation and every row-scoped read, dispatching
under the caller's own `Ctx`. `/api/rpc-public` is **public** (no auth) and carries a
hand-picked set of anonymous reads, dispatching under `root_ctx`. The Jedi feed's
static, back-end-owned content is public — the front-end reads it without a login —
so `list_categories` lives on the public surface (#116), and the Post, Caption and
Hero reads join it (#117–#119). Register ONLY safe public reads
there — never a mutation or a row-scoped read. The
**RPC contract** test enforces the list: the public surface must carry exactly the
contract's public entries.
_Avoid_: putting an anonymous read behind auth (it breaks the public landing page).

**RPC contract** (each Jedi method's surface, params and result):
The part of the contract seam that covers the Jedi RPC methods. Each entry names a
method, its RPC surface, its params type and its result type, all read from the
handler. A wrong method name, params shape or result type fails the front-end type
check; a back-end test proves that each method is routed on its own surface
([ADR-0029](docs/adr/0029-rpc-contract-from-handler-signatures.md)).
_BE_: `web/rpcs/rpc_contract.rs`, exported as `bindings/RpcContract.ts`.
_FE_: `authenticatedRpc(method, params)` and `publicRpc(method, params)` in
`lib/backend-rpc.ts`.
_Avoid_: API schema, method registry; an RPC member per method.

**Public projection** (an entity's audit-stripped public shape):
A **public projection** is an entity's public-facing shape — its fields **minus** the
internal audit columns. It never carries the actor ids (`cid` / `mid`), so an
anonymous `/api/rpc-public` response never leaks them. It carries a time (`ctime` /
`mtime`) only when the UI shows that time
([ADR-0021](docs/adr/0021-public-projection-surface-selected.md) addendum, #125). Each public read names
one such type; **one read serves it** — `CategoryPublic` + `CategoryBmc::list_public`
is the first (#116), `PostView` / `AuthorRef` (via `PostBmc`) the second (#117), and
`CaptionView` (via `CaptionBmc`) the third (#118), `HeroView` (via `HeroBmc`) the
fourth (#119), and `CommentView` (via the Comment module, for both kinds) the fifth (#125, #127). The
shared convention is the `PublicProjection` marker in the model `base`: `base::list_public`
requires it, so the audit-bearing entity row can never be served from a public read.
A projection may be **enriched** (an author-and-counts `PostView`)
or a bare **narrowing** (`CategoryPublic`); either way it carries no actor ids, and
no time that the UI does not show.
Audit visibility is chosen by **surface**, not by the caller's role: the public surface
strips; a future admin surface reads the full row (the admin read is deferred with the
admin system). Visitor and logged-in user share one read shape and differ only in
**write** ([ADR-0021](docs/adr/0021-public-projection-surface-selected.md), C-06).
_Avoid_: **Public view** (**View** means the _enriched_ read model — see `PostView` /
`CaptionView` / `HeroView`); a single role-keyed read returning different columns per
caller (it gives ts-rs one call two shapes and breaks the one-source-of-truth seam).

**Audit columns** (`cid` / `ctime` / `mid` / `mtime`):
Most back-end entities carry rust10x audit fields — creator id / create time,
modifier id / modify time. `ctime` and `mtime` are RFC3339 `TEXT` in the portable
schema ([ADR-0012](docs/adr/0012-postgres-turso-db-swap-seam.md)). A Like is
write-once, but `post_like` / `caption_like` still carry the full audit columns
(#117, #118).

**Sanitization boundary** (user text and URLs):
The server is the authoritative sanitization boundary. **User text** is sanitized in
four layers ([ADR-0019](docs/adr/0019-layered-user-text-sanitization.md)): input
hygiene on write (Unicode NFC normalize, trim, and **reject** control / zero-width /
bidirectional-override characters plus length caps), storing the **original**
markdown or text; on read the `markdown` crate renders markdown → HTML and
**ammonia** sanitizes the result; the client escapes at every sink (Solid), with a
**neosanitize** backstop where sanitized HTML is injected. **URLs** are validated and
**rejected** on write ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)
addendum) and carry the front-end `SafeUrl` brand at the sink
([ADR-0006](docs/adr/0006-safeurl-brand-enforces-sanitize-boundary.md)). Text is
never HTML-escaped on write — that would double-escape.
Each front-end copy of a length cap pins to the generated `HygieneCaps` literal
type, so a back-end cap change fails the front-end type check
([ADR-0029](docs/adr/0029-rpc-contract-from-handler-signatures.md)).
_Avoid_: store-escaped text; client-only sanitization as the sole line of defense.

**Merge lineage**:
Each Jedi table was **built beside** its FullStack table, and #128 then **removed**
the FullStack tables ([ADR-0031](docs/adr/0031-jedi-tables-built-beside-fullstack-then-removed.md),
which supersedes the "renamed, the table lives on" lineage of the
[ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum). A real-time
**channel** (a routing key) is renamed or retired independently of its entity
([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum).

_Entities:_

| FullStack token                         | Jedi                             | Note                                                                       |
| --------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `Agent`                                 | `Category`                       | built beside, then removed — AI fields and `owner_id` dropped (#107, #128) |
| `Conv`                                  | `Post`                           | built beside, then removed — every Post public (#106, #128)                |
| `ConvMsg`                               | `PostComment` + `CaptionComment` | built beside as two, one direct-parent FK each, then removed (#108, #128)  |
| `ConvUser`                              | _(dropped)_                      | every Post public — no Members (#106); removed (#128)                      |
| `ConvKind` (`OwnerOnly` / `MultiUsers`) | _(dropped)_                      | every Post public (#106); removed (#128)                                   |
| `ConvState` (`Active` / `Archived`)     | _(dropped)_                      | (#106); removed (#128)                                                     |

_Channels:_

| FullStack channel | Jedi        | Note                                                                        |
| ----------------- | ----------- | --------------------------------------------------------------------------- |
| `agents`          | _(retired)_ | Category is static — no real-time (#107, #109); removed (#128)              |
| `convs`           | `posts`     | list poke, renamed (#109); `convs` removed (#128)                           |
| `conv:{id}`       | _(retired)_ | splits into `post_comment` / `caption_comment` (#108, #109); removed (#128) |

**Pending renames**:
_Identity tokens_ (independent of the merge — it does not touch them; still pending):

| Live BE token                   | Planned             | Note                                       |
| ------------------------------- | ------------------- | ------------------------------------------ |
| `typ` (field on `User`)         | `userType`          | field rename                               |
| `UserTyp` values `Sys` / `User` | `admin` / `standard`| align tier tokens to the Admin/Standard glossary terms |

The earlier `Agent → Topic` / `Channel` and `Conv* → Thread*` rename targets are
**abandoned** — superseded by the merge lineage above (#103).

## Front-end surface

Front-end-only realizations — how the SolidStart client (`frontend/src/`) presents
the shared domain and consumes the contract seam.

### Seam-end realizations

**`IconName`** (↔ `Category.icon`):
`IconName = (typeof ICON_NAMES)[number]` (`components/Icon.tsx`) — a union of the
sprite ids. The back-end now owns `Category.icon` as an opaque `String` (#116),
so the `jedi-api` seam maps that key to an `IconName` **with a fallback** to
`"menu"` (`toIconName`, `lib/jedi/jedi-api.ts`). The unit test is relaxed to
"known key or fallback" (`lib/jedi/jedi-api.unit.test.ts`)
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)).

**`SafeUrl` / `HeroView`** (↔ `Hero`):
The seam returns the `Hero` as a sanitized `HeroView` (`types/jedi.ts`) whose URL
field is typed `SafeUrl` — a brand `string & { __brand: "SafeUrl" }` minted only by
`sanitizeUrl` / `trustedUrl` (`lib/sanitizeUrl.ts`), so a raw string can't reach a
URL sink unsanitized ([ADR-0006](docs/adr/0006-safeurl-brand-enforces-sanitize-boundary.md)).
With `Hero.cta_href` dropped
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum, #119), `HeroView`
keeps `backgroundImage` as its one `SafeUrl` field; the CTA runs fixed front-end code
(a `#` placeholder until an account-creation flow exists).
The back-end also **rejects** an unsafe URL on write: a `DbBmc::url_fields` column
must be `http(s)://…`, a root-relative path, or a fragment, with no `' " ( ) \`
(`check_safe_url`, the same rule as `sanitizeUrl`). `Hero.background_image` and
`User.avatar_url` declare it (#119); so do the Post's `image_src`,
`photographer_url`, and `source_url` (#120).

**`useAuth` identity & mock→real swap**:
The nav avatar's identity is served through the `useAuth` seam
([ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md)). The merge
made `avatar_url` a back-end `User` column
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum). The front-end
swapped mock→real **behind this seam, slice by slice**, and the `useAuth` interface
did not change.
_Built_ (#119): the identity is the logged-in User's **profile** — the authenticated
`get_profile` RPC returns the ctx User as an `AuthorRef`. It loads only after login,
so a logged-out nav shows no name and an empty avatar circle. A User with no
`avatar_url` shows the first characters of the name in the circle.
_Avoid_: rewiring components at cutover — the seam absorbs the swap.

### Sidebar selection & focus

The three sidebar cards (Categories, Top Photos, Top Captions) are single-select
**listboxes** with a roving `aria-activedescendant`. Two distinct visual states ride
on each option — keep them separate:

**Selection highlight**:
The persistent mark on the option that _is_ the current selection
(`bg-(--theme-highlight)`). It reflects application state (the selected Category /
Post / Caption) and must **always** be present on the selected option, regardless of
input modality. Losing it when the selection changes is a bug (#37).
_Avoid_: focus highlight; conflating it with the focus ring.

**Focus ring** (active-option ring):
The keyboard-navigation indicator on the active option
(`ring-2 ring-(--theme-accent)`). It marks where roving keyboard focus sits and is
**keyboard-modality only** (see focus visibility, below). Painting it on pointer
click — or leaving it on an unfocused listbox — is a bug (#38).
_Avoid_: selection ring; treating it as a selection cue.

**Focus visibility (`:focus-visible`)**:
Focus indicators are shown for **keyboard** interaction only, never for pointer
clicks. The app's global rule styles focus via `:focus-visible` (keyboard-only, WCAG
2.4.7–compliant), and the sidebar's active-option ring must follow the same modality
rule. A focus ring appearing on mouse click is a defect, not desired behavior; the
`<main>` action buttons showing no ring on click are correct.
_Avoid_: always-on focus outlines; showing the ring on pointer interaction.

### Unsaved Drafts

**Draft** (unsaved form text):
Text a User typed in a form and has not saved. A Comment compose box or an Add
Caption form holds one when it is not blank. A New Post dialog holds one when a
field is not blank or a Category is checked. An open Comment, Caption or Post edit
holds one when it differs from the saved entity. A Cancel, an Escape or a
user-started move that would close the form asks first. While the form is saving,
no user-started move closes it. An Event that removes the form's subject discards
the Draft, and a notice says so. An Event that moves the Post out of the selected
Category keeps the Post shown. The User then chooses to keep or discard the Draft
([ADR-0030](docs/adr/0030-unsaved-draft-guard.md)).
_Avoid_: unsaved comment, pending edit; "lost" or "rejected" for a forced discard.
