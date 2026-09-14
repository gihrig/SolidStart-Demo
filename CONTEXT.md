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
folds the former **Realtime Conversations** page — the **FullStack** nav link —
into Jedi: the standalone page and its nav link retire, but its real-time thread
mechanism lives on as Jedi's Comment threads
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum). The back-end
owns the domain and exports it to the front-end as ts-rs bindings (the _contract
seam_, below).

**Merge status.** The Conversations back-end is **live** today —
`crates/libs/lib-core/src/model/` holds `agent.rs`, `conv.rs`, `conv_msg.rs`,
`conv_user.rs`, `user.rs`, all exported via ts-rs. The merge **evolves** that live
model into Jedi's vocabulary rather than building fresh
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum, #110); the
transformation is **contracted, not yet built**, and Jedi's front-end still runs on
the mock ([ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)). So every `_BE_`
note below is `_Planned_` — the evolved target. The live-token → merged-token
lineage is the table under **Back-end surface & contract seam**.

**Reading this glossary.** Entity entries are surface-neutral; italic labels mark
the rest:

- `_BE_:` — how the **back-end** realizes the term (fields, tables, tokens).
- `_FE_:` — how the **front-end** realizes it (render, seam, a11y).
- `_Planned_:` — contracted but **not yet built** ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)); see each section's status note.
- `_Avoid_:` — synonyms the project deliberately does **not** use.

## Jedi

A responsive, accessible photo-and-caption application with its own style and
navigation. Users share Flickr photos as **Posts** and compete to caption them;
both Posts and Captions accrue **Likes** and host real-time **Comment** threads.
Content is served today by a back-end-faithful mock
([ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)) that doubles as the data
contract a future back-end implements; that contract is specified in
[ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md), the database portability
it must respect is [ADR-0012](docs/adr/0012-postgres-turso-db-swap-seam.md), and the
mono-repo that houses both surfaces is [ADR-0010](docs/adr/0010-monorepo-structure.md).

_Brand_: the user-facing wordmark is **"Awesome"** (`Nav.tsx`, page `<Title>`,
hero); **Jedi** stays the code/domain token (`src/types/jedi.ts`, `src/lib/jedi/`,
ADRs). They coexist by design — #17's "'Awesome' (formerly Jedi)" is _not_ a
rename. A future code→brand alignment (Jedi → Awesome) is a separate effort, not
part of this merge.

_Status_: the merged model is **contracted but not yet built** — the live
Conversations back-end is being evolved into these names
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum, #110), and Jedi
is still served entirely by the front-end mock. Every `_BE_` note in this section
is therefore `_Planned_`.

**User**:
An authenticated identity that owns Posts and Captions, authors Comments, and casts
Likes. Every User is either an Admin user or a Standard user.
_Avoid_: account.
_BE_ (Planned): `User = { id, username, typ, avatar_url }` with
`UserTyp = "Sys" | "User"`. `id` / `username` / `typ` are the live identity; the
merge **persists `avatar_url`** as a back-end column, moving it off the front-end
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
_BE_ (Planned): `UserTyp = "User"`.

**Owner**:
The User who created a Post, Caption, or Comment — the `owner_id`. Fixed for the
entity's life; an entity never transfers to another User. Only its Owner or an Admin
user may delete it; only its Owner may edit it. Category and Hero have **no** Owner
— the taxonomy is back-end-owned and the Hero is a singleton, both Admin-managed
(write-gating deferred).
_Avoid_: creator.
_BE_ (Planned): the `owner_id` column on `Post`, `Caption`, `PostComment`, and
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
(mandatory). **Every Post is public** — any logged-in User may read and take part;
there is no private or archived scope. **Top Photos** is Posts ranked by likes, not
a separate entity.
_Avoid_: Photo (as a distinct entity), Image, feed item; Conversation, thread, room
(the retired FullStack terms).
_BE_ (Planned): a first-class entity, `owner_id → User`. The FullStack access
`kind` / `state` and the `ConvUser` membership table are **dropped** — every Post is
public (#106). A Post carries many Categories, **minimum one**, via a
`post_category` join (#107). Read returns an enriched `PostView` — author, resolved
Categories, and derived like / comment counts. URL fields are validated and
**rejected** on write ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)
addendum, [ADR-0019](docs/adr/0019-layered-user-text-sanitization.md)).
_Lineage_: evolved from the live `Conv`.

**Caption**:
An independently-liked line of text a User submits for a Post, with its own
real-time Comment thread and real-time Likes. Many Captions compete per Post, each
ranked by its own Likes; the top one is shown on the Post. A first-class entity —
never merely a Post's "caption text".
_Avoid_: title; caption text (as a Post field).
_BE_ (Planned): a first-class entity; ranked by its own `caption_like` rows; hosts
its own `CaptionComment` thread (#106, #108). Read returns an enriched
`CaptionView` (author, derived like / comment counts).

**Category**:
A back-end-owned classification a Post carries; a Post's on-card "tags" _are_ its
Categories. Many-to-many with Post, **minimum one** per Post. The single-select
sidebar filters Posts by one Category.
_Avoid_: Tag, Label (as concepts separate from Category); Agent, Topic, Channel
(the retired FullStack term and its abandoned rename targets).
_BE_ (Planned): `Category = { id, name, icon: String }` — `icon` is an **opaque
key** the back-end never interprets; the front-end maps it to `IconName` with a
fallback (Front-end surface). **No** `owner_id` and **no** AI fields — an Admin user
creates the taxonomy (write-gating deferred). **Static** — loaded once on page
load, never real-time (#107).
_Lineage_: evolved from the live `Agent` (re-modeled — the `ai_provider` /
`ai_model` fields dropped); the `agents` real-time channel is **retired**
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum, #107).

**Comment**:
A User's remark, authored in a Post's thread or a Caption's thread. Two flat
entities, not one: a **PostComment** parented to a Post, and a **CaptionComment**
parented to a Caption. Each is real-time — a new or edited Comment pushes to its
thread's subscribers.
_Avoid_: post, reply; Message (the retired FullStack term).
_BE_ (Planned): `PostComment` carries `post_id`; `CaptionComment` carries
`caption_id`. Each has **one direct-parent FK**, an `owner_id` author, and
`content`; there is no polymorphic `parent_kind` discriminator (#108). An owner may
edit or delete their own Comment
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).
_Lineage_: evolved from the live `ConvMsg`, **split into two** (#108).

**Like**:
A User's endorsement of one Post or one Caption — a first-class record, not a stored
counter. At most one Like per User per target (an idempotent toggle); a like count
is _derived_ by counting Likes. Captions compete on their own Like tallies (Top
Captions). A like-count change **pokes** its real-time channel; the client refetches
the count.
_Avoid_: vote, favorite, star; `likeCount` as stored truth.
_BE_ (Planned): two tables — `post_like = { id, owner_id, post_id, ctime }` and
`caption_like = { id, owner_id, caption_id, ctime }`, each `unique(owner, parent)`
so a toggle is idempotent. A Like is **write-once** (insert or delete, never
updated), so it carries no `mid` / `mtime`. Counts are **derived by counting rows**,
never stored ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).

**Top Photos** / **Top Captions**:
Ranked _views_, not stored lists. Top Photos = Posts ordered by like count (within
the selected Category once filtering lands, #29); Top Captions = the selected Post's
Captions ordered by like count.
_Avoid_: featured/popular list, best captions (as stored data).
_BE_ (Planned): the same `list_*` RPCs ordered by the derived like count — not
stored tables ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).

**Hero**:
The home page's banner content — title, subtitle, CTA text, background image. A
back-end-owned **singleton** an Admin user edits to change home branding; not
user-generated and not `owner_id`-owned.
_Avoid_: banner, splash (as separate concepts); treating it as per-User content.
_BE_ (Planned): `Hero = { id, title, subtitle, cta_text, background_image, + audit }`
— a single mutable row. The CTA target is **not** a stored field: the button runs
fixed front-end code (create a new account), so `cta_href` is **dropped**
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum, #110). The
front-end renders it as a sanitized `HeroView` (Front-end surface). Admin
write-gating is deferred.

### Real-time feed

How Jedi's Comments, Captions, and Likes reach a User's client live, without
polling. This is the mechanism the former Realtime Conversations page ran on; the
merge re-points it at Jedi's entities
([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum, #109). The
entities above are what it carries.

_Status_: the WebSocket back-end is **live** today (serving Conversations); the
merged channel map below is contracted, not yet built.

**Feed**:
The live stream a User's client receives Events on, without polling. One per client:
every view a client shows shares the single Feed.
_Avoid_: socket (as the concept), push.
_BE_: a WebSocket at `GET /ws` (auth-required); one broadcast fans Events to all
connections, each filtered to its Subscriptions (`web/routes_ws.rs`).
_FE_: the shared client Feed (`lib/websocket.ts`); one per client, consumed by each
view ([ADR-0017](docs/adr/0017-shared-client-feed-multiplexed.md)).

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
_BE_ (Planned): one ts-rs-exported `Channel` enum — one typed variant per channel,
id where the routing key needs it, snake_case wire strings, PascalCase Rust variants;
`ChannelKind` is merged into it ([ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)). The live `agents` channel is **retired** (Category
static), the id-bearing `conv:{id}` is **retired** (its message stream splits into
the two comment channels), and `convs` becomes `posts`
([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum, #109).
_FE_ (Planned): the `Channel` constructor module (`lib/channel.ts`) over the
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
_BE_ (Planned): `SubscriptionRequest { action, channel }` with `channel: Channel` —
the id rides inside the variant, so `conv` without an id fails to deserialize; held
per-connection and authorized per variant (`Conv` keeps the read scope until #128, the
rest authenticated-read) ([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum,
[ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)).
_FE_: `subscribe` / `unsubscribe` on the Feed, replayed on (re)connect.

**Event**:
One notification carried on the Feed. A **payload** Event carries its item — a
PostComment or CaptionComment, as a tagged upsert-or-removal (a Comment may be
edited or deleted, not only appended). A **poke** Event is contentless; the client
refetches (`posts`, `post_like`, `caption_like`, `post_caption`).
_Avoid_: notification, broadcast (the mechanism, not the item).
_BE_ (Planned): the merged `WsEvent` — payload variants (`conv_msg` and the two
comment channels) plus one `Poke(Channel)` for the contentless pokes, tagged by
`event_type` (ts-rs-exported). A poke carries its `Channel`; a payload derives its
`Channel` from the payload ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)
addendum, #109; [ADR-0020](docs/adr/0020-collapse-channel-vocabulary.md)).

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
(`UserTyp = "Sys" | "User"`) is the same identity that owned Conversations **and** —
once the merged back-end lands — owns Posts, Captions, and Comments and casts Likes.
The Jedi mock's `JediProfile { userId }` _is_ this User
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)), completing the
convergence set out in
[ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md).

**ts-rs bindings** (the FE↔BE contract):
The back-end's `#[derive(TS)]` types export to
`backend/crates/services/web-server/bindings/`; the front-end consumes them, so a
back-end type change _is_ a front-end contract change (CI guards the two in step —
ADR-0010).
_Avoid_: DTO, hand-kept schema — there is one generated source of truth.

**`~/types/backend` barrel + `NumericIds`**:
The front-end imports bindings **only** through the `~/types/backend` barrel, which
re-applies `NumericIds` (a binding's `id: bigint` → `number`) and layers its
locally-defined types. Consumers never import raw `bindings/` files directly. See
[ADR-0003](docs/adr/0003-entity-identity-number-at-barrel.md),
[ADR-0010](docs/adr/0010-monorepo-structure.md).

**`ParamsIded` / `ParamsForUpdate<D>`** (shared RPC param shapes):
`ParamsIded = { id }` carries an id-only call (fetch/delete by id);
`ParamsForUpdate<D> = { id, data }` carries an update. Both are exported through the
same ts-rs seam as the entities.

**RPC surfaces** (authenticated vs public):
The back-end exposes two JSON-RPC endpoints. `/api/rpc` is **authenticated** (behind
`mw_ctx_require`) and carries every mutation and every row-scoped read, dispatching
under the caller's own `Ctx`. `/api/rpc-public` is **public** (no auth) and carries a
hand-picked set of anonymous reads, dispatching under `root_ctx`. The Jedi feed's
static, back-end-owned content is public — the front-end reads it without a login —
so `list_categories` lives on the public surface (#116), and the other `data.json`
reads (Posts, Captions, Hero) join it as they land. Register ONLY safe public reads
there — never a mutation or a row-scoped read.
_Avoid_: putting an anonymous read behind auth (it breaks the public landing page).

**Audit columns** (`cid` / `ctime` / `mid` / `mtime`):
Most back-end entities carry rust10x audit fields — creator id / create time,
modifier id / modify time. `ctime` and `mtime` are RFC3339 `TEXT` in the portable
schema ([ADR-0012](docs/adr/0012-postgres-turso-db-swap-seam.md)). A Like is
write-once, so `post_like` / `caption_like` carry `ctime` only — no `mid` / `mtime`
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum).

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
_Avoid_: store-escaped text; client-only sanitization as the sole line of defense.

**Merge lineage & pending renames**:
The live Conversations back-end (`Agent` / `Conv` / `ConvMsg` / `ConvUser`) is being
**evolved** into Jedi's vocabulary
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum, #110); Jedi's
front-end still runs on the mock ([ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)).
This table is the live-token → merged-token lineage the build follows. An **entity**
(a table / ts-rs type) is renamed and lives on; a real-time **channel** (a routing
key) is renamed or retired independently
([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md) addendum).

_Entities:_

| Live BE token                                | Merged (Jedi)                    | Note                                                       |
| -------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `Agent`                                      | `Category`                       | renamed + re-modeled — AI fields and `owner_id` dropped (#107) |
| `Conv`                                       | `Post`                           | renamed + re-modeled — every Post public (#106)            |
| `ConvMsg`                                    | `PostComment` + `CaptionComment` | split into two, one direct-parent FK each (#108)           |
| `ConvUser`                                   | _(dropped)_                      | every Post public — no Members (#106)                      |
| `ConvKind` (`OwnerOnly` / `MultiUsers`)      | _(dropped)_                      | every Post public (#106)                                   |
| `ConvState` (`Active` / `Archived`)          | _(dropped)_                      | (#106)                                                     |

_Channels:_

| Live channel  | Merged      | Note                                                   |
| ------------- | ----------- | ------------------------------------------------------ |
| `agents`      | _(retired)_ | Category is static — no real-time (#107, #109)         |
| `convs`       | `posts`     | list poke, renamed (#109)                              |
| `conv:{id}`   | _(retired)_ | splits into `post_comment` / `caption_comment` (#108, #109) |

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
_Planned_: with `Hero.cta_href` dropped
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum), `HeroView`
keeps `backgroundImage` as its one `SafeUrl` field; the CTA runs fixed front-end code.

**`useAuth` identity & mock→real swap**:
The nav avatar's identity is served through the `useAuth` seam
([ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md)). As the merge
lands, `avatar_url` becomes a back-end `User` column
([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md) addendum); the front-end
swaps mock→real **behind this seam, slice by slice**, and the `useAuth` interface is
unchanged.
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
