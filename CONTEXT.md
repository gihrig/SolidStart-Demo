# SolidStart Demo — Domain Model

The shared domain model for the SolidStart Demo mono-repo — **one bounded context
with two surfaces** ([ADR-0010](docs/adr/0010-monorepo-structure.md)): a SolidStart
front-end (`frontend/`) and a Rust/Axum back-end (`backend/`), unified by one
authenticated **User** ([ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md),
[ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)). The front-end is a single
SolidStart package — a modular monolith ([ADR-0001](docs/adr/0001-frontend-modular-monolith.md),
ADR-0007): **Jedi** is the top-level application — the home page, and its nav,
header, and theme are the global app shell; **Realtime Conversations** — the
**FullStack** nav link — is a sub-application reached from that shell. The back-end
owns the domain and exports it to the front-end as ts-rs bindings the front-end
consumes (the _contract seam_, below).

**Reading this glossary.** Entity entries are surface-neutral; italic labels mark
the rest:

- `_BE_:` — how the **back-end** realizes the term (fields, tables, tokens).
- `_FE_:` — how the **front-end** realizes it (render, seam, a11y).
- `_Planned_:` — contracted but **not yet built** ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)); see each section's status note.
- `_Avoid_:` — synonyms the project deliberately does **not** use.

## Realtime Conversations

A demo of real-time conversations: Users exchange Messages within Conversations,
each Conversation organized under an Agent.

_Status_: the Conversations back-end is **live** — `crates/libs/lib-core/src/model/`
holds `agent.rs`, `conv.rs`, `conv_msg.rs`, `conv_user.rs`, `user.rs`, all exported
via ts-rs. The `_BE_` notes below are built code.

**User**:
An authenticated identity that owns Agents and Conversations and authors
Messages. Every User is either an Admin user or a Standard user.
_Avoid_: account.
_BE_: `User = { id, username, typ }` with `UserTyp = "Sys" | "User"` — the lean
identity. The nav avatar's `displayName` / `avatarUrl` are **not** back-end
columns; they are front-end `useAuth`-seam fields (see Front-end surface).
_Converging_: the global nav avatar unifies this identity with the Jedi profile
at back-end integration (#17, ADR-0007; formalized as one back-end `User`
spanning both surfaces in ADR-0011). In the client the `useAuth` seam already
carries the interim `displayName` / `avatarUrl`; #17 swaps only the avatar's source.

**Admin user**:
A User holding maximum control and configuration permissions.
_Avoid_: system user, superuser, root.

**Standard user**:
A User with ordinary permissions — the default tier (deliberately not called
"User", which names the identity above).
_Avoid_: regular user.

**Agent**:
A container that groups Conversations; a User selects one and converses within it.
An Agent is not a participant — it never authors Messages — despite carrying an AI provider and model (`ai_provider`, `ai_model`).
_Avoid_: bot, assistant, responder; "agent" in the AFK / coding-agent sense used by the issue tracker.
_BE_: `Agent = { id, owner_id, name, ai_provider, ai_model, … }` — the label field
is `name` (not `title`).

Future refactor: Rename Agent to Topic. See #31 (see the rename table under
Back-end surface & contract seam). Not to be confused with the realtime **Channel**
(the live-Event routing key, below), which keeps its name.

**Conversation**:
A thread of Messages within one Agent, owned by the Standard user who created it.
Ownership is fixed — a Conversation and its Messages never transfer to another User. Each Conversation has an access `kind` that scopes who may take part.
_Avoid_: chat, room.
_BE_: `Conv = { id, agent_id, owner_id, title, kind, state, … }`; `kind` and
`state` are stored as `TEXT` + `CHECK` in the portable-subset schema
([ADR-0012](docs/adr/0012-postgres-turso-db-swap-seam.md)).

**Owner**:
The User who created an entity — an Agent (an Admin user) or a Conversation (a Standard user). Fixed for the entity's life. For a Conversation, only its Owner or an Admin user may delete Messages or the whole thread. Only its Owner may update a Conversation — rename it, or change its `kind` or `state`; the Admin override extends to deletion, not editing.
_Avoid_: creator.
_BE_: the `owner_id` column on `Agent` / `Conv`.

**Member**:
A User admitted to a Conversation beyond its Owner; Only Owner-plus-Members may take part in a private Conversation.
_Avoid_: participant.
_BE_: a `ConvUser = { conv_id, user_id, … }` row admits a User to a Conversation.

**Message**:
An entry a User — the Owner or a Member — posts in a Conversation; that User is the Message's author, distinct from the Conversation Owner.
_Avoid_: post, comment.
_BE_: `ConvMsg = { id, conv_id, user_id, content, … }` — `user_id` is the author,
distinct from the Conversation's `owner_id`.

**Conversation kind** (`OwnerOnly` | `MultiUsers`):
A Conversation's access scope. `OwnerOnly` is private — only its Owner and invited Members may read or post. `MultiUsers` is public — any User may read and post, without invitation.
_Avoid_: visibility, permission.
_BE_: `ConvKind = "OwnerOnly" | "MultiUsers"`.

**Conversation state** (`Active` | `Archived`):
A Conversation's lifecycle. `Active` is in the working set; `Archived` is retained but hidden from it — never deleted.
_Avoid_: status.
_BE_: `ConvState = "Active" | "Archived"`.

### Realtime feed

How a Conversation's Messages reach a User's client live, honoring the same access
rules as a read. This is the vocabulary of the push path; the entities above are
what it carries.

**Feed**:
The live stream a User's client receives Conversation Events on, without polling.
One per client: every view a client shows shares the single Feed.
Access-scoped: a client receives an Event only for a Channel it holds a
Subscription to.
_Avoid_: socket (as the concept), push.
_BE_: a WebSocket at `GET /ws` (auth-required); one broadcast fans Events to all
connections, each filtered to its Subscriptions (`web/routes_ws.rs`).
_FE_: the `MessageFeed` port (`lib/websocket.ts`); one shared Feed per client,
consumed by each view ([ADR-0017](docs/adr/0017-shared-client-feed-multiplexed.md)).

**Channel**:
The routing key an Event is addressed to and a Subscription names. One
Conversation's is `conv:{id}`. Two id-less global list feeds also exist: `agents`
and `convs`, each a contentless "poke" that some Agent list or Conversation list
may have changed (#85); a subscriber refetches through the scoped `list_*` RPC,
so no row crosses the push path. Distinct from the planned Agent → **Topic**
rename (#31): a Channel routes live Events; a Topic groups Threads. A channel
string tracks its entity's domain name, so when Agent → **Topic** and `Conv*` →
`Thread*` land, `agents` / `convs` / `conv` rename with them
([ADR-0018](docs/adr/0018-channel-strings-track-domain-names.md)).
_Avoid_: topic (that names the Agent rename); room.
_BE_: `WsEvent.channel` (derived from the variant) and the inbound `SubscriptionRequest.channel` — now the ts-rs-exported `ChannelKind` enum, not a bare string (ADR-0018).
_FE_: the `Channel` module (`lib/channel.ts`): `conv(id)` / `agents` / `convs` constructors over the generated `ChannelKind`; `subscribe` / `unsubscribe` take a `Channel`.

**Subscription**:
A client's standing request to receive Events on a Channel; permitted only for a
Channel the client is entitled to read — owner ∪ `MultiUsers`, the same scope as a
direct read ([ADR-0014](docs/adr/0014-backend-row-scoped-authorization-seam.md)). A
connection with no Subscription receives nothing.
_Avoid_: listener, watch.
_BE_: `SubscriptionRequest { action, channel, id }`; authorized at subscribe-time
and held per-connection ([ADR-0015](docs/adr/0015-realtime-push-authorization-at-subscribe-time.md)).
_FE_: `subscribe` / `unsubscribe` on the `MessageFeed`, replayed on (re)connect.

**Event**:
One notification carried on the Feed: a new Message (`conv_msg`, with the Message
as payload), or a list-feed poke (`agent_update` / `conv_update`, payload-less —
the client refetches).
_Avoid_: notification, broadcast (the mechanism, not the item).
_BE_: `WsEvent` — a discriminated union tagged by `event_type` (ts-rs-exported):
`conv_msg` carries a typed `ConvMsg`; `agent_update` / `conv_update` are
payload-less. The routing Channel is derived from the variant, not carried on the
wire.
_FE_: the same generated `WsEvent`, consumed through the `~/types/backend` barrel
so the `conv_msg` payload gets the `NumericIds` id rewrite (ADR-0003).

**Poke rule**:
Every Conversation or Agent mutation pokes its list feed. A create, update, or
delete emits the matching list-feed Event, and every client then refetches (#85).
The rule is per-entity: a Conv mutation pokes `convs`, an Agent mutation pokes
`agents`. Adding a Message pokes its Conversation's Channel instead.
_Avoid_: refresh, notify.
_BE_: the create/update/delete handlers plus `add_conv_msg` (`web/rpcs/*.rs`).

## Jedi

A responsive, accessible photo-and-caption sub-application with its own style and navigation. Users share Flickr photos as Posts and compete to caption them; both Posts and Captions accrue Likes. Content is served today by a back-end-faithful mock (see [ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)) that doubles as the data contract a future back-end implements. That contract is now specified in [ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md); the database portability it must respect is [ADR-0012](docs/adr/0012-postgres-turso-db-swap-seam.md), and the mono-repo that houses both surfaces is [ADR-0010](docs/adr/0010-monorepo-structure.md) (with the front-end kept over full-Rust per [ADR-0008](docs/adr/0008-keep-solidstart-leptos-tradeoff.md)).

_Status_: the Jedi **back-end is contracted but not yet built** —
`crates/libs/lib-core/src/model/` has no `Post` / `Caption` / `Category` /
`Comment` / `…Like` / `Hero` today; Jedi is still served entirely by the front-end
mock ([ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)). Every `_BE_` note in
this section is therefore `_Planned_` per
[ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md).

_Brand_: the user-facing wordmark is **"Awesome"** (`Nav.tsx`, page `<Title>`,
hero); **Jedi** stays the code/domain token (`src/types/jedi.ts`, `src/lib/jedi/`,
ADRs). They coexist by design — #17's "'Awesome' (formerly Jedi)" is _not_ a
rename. A future code→brand alignment (Jedi → Awesome), if pursued, is parked
with the planned renames in #31.

**Post**:
The core feed entity — a shared Flickr photo with its owner, Categories, caption competition, and like/comment counts. The Post _is_ the photo;

**Top Photos** is Posts ranked by likes, not a separate entity.
_Avoid_: Photo (as a distinct entity), Image, feed item.
_BE_ (Planned): a first-class entity owned via `owner_id`.

**Caption**:
An independently-liked line of text a User submits for a Post. Many Captions
compete per Post, each ranked by its own Likes; the top one is shown on the Post. A first-class entity — never merely a Post's "caption text".
_Avoid_: title; caption text (as a Post field).
_BE_ (Planned): a first-class entity; ranked by its own CaptionLikes.

**Category**:
A classification a Post carries; a Post's on-card "tags" _are_ its Categories (many-to-many). The single-select sidebar filters Posts by one Category.
_Avoid_: Tag, Label (as concepts separate from Category).
_BE_ (Planned): `Category = { id, name, icon: String }` — `icon` is an **opaque
key** the back-end never interprets; the front-end maps it to `IconName` (see
Front-end surface). Keeps the taxonomy fully back-end-owned.

**Comment**:
A User's remark on a Post; today only its count is surfaced. Distinct from a
Conversations **Message**.
_Avoid_: post, reply.
_BE_ (Planned): a first-class entity owned via `owner_id`; only its count is
surfaced today.

**Like**:
A User's endorsement of one Post or one Caption — a first-class record, not a
stored counter (see [ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)). At
most one Like per User per target (an idempotent toggle); a Post's or Caption's
like count is _derived_ by counting Likes. Captions compete on their own Like
tallies (Top Captions).
_Avoid_: vote, favorite, star; `likeCount` as stored truth.
_BE_ (Planned): two tables — `post_like` and `caption_like`, each
`{ owner_id, target_id, ctime }` with `unique(owner_id, target_id)` so a toggle is
idempotent; like counts are **derived by counting rows**, never stored.

**Author**:
The User who owns a Post, Caption, or Comment (`owner_id`); the UI renders the author's name and avatar. Distinct from the photo's original author.

**photographer**
(the external Flickr attribution), who is not a User.
_Avoid_: user (when the owning role is meant); poster.

**Top Photos** / **Top Captions**:
Ranked _views_, not stored lists. Top Photos = Posts ordered by like count (within the selected Category once filtering lands, #29); Top Captions = the
selected/featured Post's Captions ordered by like count.
_Avoid_: featured/popular list, best captions (as stored data).
_BE_ (Planned): **derived views** ordered by like count — not stored tables.

**Hero**:
The home page's banner content — title, subtitle, CTA, background image. A
BE-owned **singleton** an Admin user edits to change home branding; not
user-generated and not `owner_id`-owned like Posts. FE renders it through the seam
(URL fields sanitized). See
[ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md).
_Avoid_: banner, splash (as separate concepts); treating it as per-User content.
_BE_ (Planned): `Hero = { title, subtitle, cta_text, cta_href, background_image }`
— a single mutable row, not `owner_id`-owned. The front-end renders it as a
sanitized `HeroView` (see Front-end surface).

## Back-end surface & contract seam

The back-end (`backend/`, Rust/Axum, rust10x blueprint) owns the domain and
exports it to the front-end as **ts-rs bindings** — the contract both surfaces
share. This section names that seam's vocabulary; the _mechanism_ (the tsconfig
`paths` alias, the CI bindings-drift guard) lives in
[ADR-0010](docs/adr/0010-monorepo-structure.md), not here.

**Unified `User`** (the cross-surface identity):
One back-end `User = { id, username, typ }` (`UserTyp = "Sys" | "User"`) is the
same identity that owns Agents and Conversations **and** — once the Jedi back-end
lands — Posts, Captions, and Likes. The Jedi mock's `JediProfile { userId }` _is_
this User ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)), completing
the convergence set out in
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
hand-authored types. Consumers never import raw `bindings/` files directly. See
[ADR-0003](docs/adr/0003-entity-identity-number-at-barrel.md),
[ADR-0010](docs/adr/0010-monorepo-structure.md).

**`ParamsIded` / `ParamsForUpdate<D>`** (shared RPC param shapes):
`ParamsIded = { id }` carries an id-only call (fetch/delete by id);
`ParamsForUpdate<D> = { id, data }` carries an update. Both are exported through
the same ts-rs seam as the entities.

**Audit columns** (`cid` / `ctime` / `mid` / `mtime`):
Every back-end entity carries rust10x audit fields — creator id / create time,
modifier id / modify time. `ctime` and `mtime` are RFC3339 `TEXT` in the portable
schema ([ADR-0012](docs/adr/0012-postgres-turso-db-swap-seam.md)).

**`Conv*` token family & planned renames**:
The exported tokens are **today's back-end names**, so this glossary matches the
current code; a future back-end refactor is expected to adopt the planned names
below. (The Jedi brand `Jedi → Awesome` is a separate code→brand alignment, not a
token rename — see the Jedi `_Brand_` note; both are parked in #31.)

| Today (BE token / ts-rs)                           | Planned                                                      | Note                           |
| -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| `Agent`                                            | `Topic`                                                      | #31                            |
| `typ` (field on `User`)                            | `userType`                                                   |                                |
| `UserTyp` values `Sys` / `User`                    | `admin` / `standard`                                         | tier values                    |
| `ConvKind` values `OwnerOnly` / `MultiUsers`       | `Private` / `Public`                                         | access scope                   |
| `Conv` `ConvMsg` `ConvUser` `ConvKind` `ConvState` | `Thread` `ThreadMsg` `ThreadUser` `ThreadKind` `ThreadState` | the `Conv*` family → `Thread*` |
| `ChannelKind` values `conv` / `agents` / `convs`   | `thread` / `topics` / `threads`                             | channels track their entity (ADR-0018) |

## Front-end surface

Front-end-only realizations — how the SolidStart client (`frontend/src/`) presents
the shared domain and consumes the contract seam.

### Seam-end realizations

**`IconName`** (↔ `Category.icon`):
`IconName = (typeof ICON_NAMES)[number]` (`components/Icon.tsx`) — a union of the
sprite ids. **Today** the mock's `JediCategory.icon` is typed `IconName` directly,
and the unit test asserts strict membership (`expect(ICON_NAMES).toContain(c.icon)`,
`lib/jedi/jedi-api.unit.test.ts`).
_Planned_: once the back-end owns `Category.icon` as an opaque `String`, the barrel
maps that key to `IconName` **with a fallback** and the test relaxes to "known key
or fallback" ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md)).

**`SafeUrl` / `HeroView`** (↔ `Hero`):
The seam returns the `Hero` as a sanitized `HeroView` (`types/jedi.ts`) whose URL
fields `ctaHref` / `backgroundImage` are typed `SafeUrl` — a brand
`string & { __brand: "SafeUrl" }` minted only by `sanitizeUrl` / `trustedUrl`
(`lib/sanitizeUrl.ts`), so a raw string can't reach a URL sink unsanitized
([ADR-0006](docs/adr/0006-safeurl-brand-enforces-sanitize-boundary.md)).

**`useAuth` interim identity & mock→real swap**:
The nav avatar's `displayName` / `avatarUrl` live on the `useAuth` seam
([ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md)), not on the
back-end `User`. As the Jedi back-end lands, the front-end swaps mock→real **behind
this seam, slice by slice** ([ADR-0011](docs/adr/0011-jedi-backend-domain-contract.md));
the `useAuth` interface is unchanged by #17.
_Avoid_: rewiring components at cutover — the seam absorbs the swap.

### Sidebar selection & focus

The three sidebar cards (Categories, Top Photos, Top Captions) are single-select **listboxes** with a roving `aria-activedescendant`. Two distinct visual states ride on each option — keep them separate:

**Selection highlight**:
The persistent mark on the option that _is_ the current selection (`bg-(--theme-highlight)`). It reflects application state (the selected Category / Post / Caption) and must **always** be present on the selected option, regardless of input modality. Losing it when the selection changes is a bug (#37).
_Avoid_: focus highlight; conflating it with the focus ring.

**Focus ring** (active-option ring):
The keyboard-navigation indicator on the active option (`ring-2 ring-(--theme-accent)`). It marks where roving keyboard focus sits and is **keyboard-modality only** (see focus visibility, below). Painting it on pointer click — or leaving it on an unfocused listbox — is a bug (#38).
_Avoid_: selection ring; treating it as a selection cue.

**Focus visibility (`:focus-visible`)**:
Focus indicators are shown for **keyboard** interaction only, never for pointer clicks. The app's global rule styles focus via `:focus-visible` (keyboard-only, WCAG 2.4.7–compliant), and the sidebar's active-option ring must follow the same modality rule. A focus ring appearing on mouse click is a defect, not desired behavior; the `<main>` action buttons showing no ring on click are correct.
_Avoid_: always-on focus outlines; showing the ring on pointer interaction.
