# SolidStart Demo — Front-end

The front-end of a technology demo, serving as a production-standard reference
for future projects. It is a single SolidStart package — a modular monolith (see
[ADR-0001](docs/adr/0001-frontend-modular-monolith.md),
[ADR-0007](docs/adr/0007-consolidate-jedi-shell-unified-identity.md)). **Jedi** is
the top-level application: it serves as the home page and its nav and header are
the global app shell. **Realtime Conversations** — the **FullStack** nav link —
is a sub-application reached from that shell. The two share one theme and are
converging on one authenticated identity, surfaced in the nav avatar (see
ADR-0007).

## Realtime Conversations

A demo of real-time conversations: Users exchange Messages within Conversations,
each Conversation organized under an Agent.

**User**:
An authenticated identity that owns Agents and Conversations and authors
Messages. Every User is either an Admin user or a Standard user.
_Avoid_: account.
_Converging_: the global nav avatar unifies this identity with the Jedi profile
at back-end integration (#17, ADR-0007). In the client the `useAuth` seam already
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

Future refactor: Rename Agent to Channel. See #31

**Conversation**:
A thread of Messages within one Agent, owned by the Standard user who created it.
Ownership is fixed — a Conversation and its Messages never transfer to another User. Each Conversation has an access `kind` that scopes who may take part.
_Avoid_: chat, room.

**Owner**:
The User who created an entity — an Agent (an Admin user) or a Conversation (a Standard user). Fixed for the entity's life. For a Conversation, only its Owner or an Admin user may delete Messages or the whole thread.
_Avoid_: creator.

**Member**:
A User admitted to a Conversation beyond its Owner; Only Owner-plus-Members may take part in a private Conversation.
_Avoid_: participant.

**Message**:
An entry a User — the Owner or a Member — posts in a Conversation; that User is the Message's author, distinct from the Conversation Owner.
_Avoid_: post, comment.

**Conversation kind** (`OwnerOnly` | `MultiUsers`):
A Conversation's access scope. `OwnerOnly` is private — only its Owner and invited Members may read or post. `MultiUsers` is public — any User may read and post, without invitation.
_Avoid_: visibility, permission.

**Conversation state** (`Active` | `Archived`):
A Conversation's lifecycle. `Active` is in the working set; `Archived` is retained but hidden from it — never deleted.
_Avoid_: status.

### Planned renames

Headings above use today's back-end tokens so the glossary matches the current code; these are the names a future back-end refactor is expected to adopt.

- `Agent` → **Channel** see #31
- `typ` → **userType**; tier values `Sys` → **admin**, `User` → **standard**
- `kind` values `OwnerOnly` → **Private**, `MultiUsers` → **Public**
- the `Conv*` type family → **`Thread*`** (`Conv`→`Thread`, `ConvMsg`→`ThreadMsg`,
  `ConvUser`→`ThreadUser`, `ConvKind`→`ThreadKind`, `ConvState`→`ThreadState`)

## Jedi

A responsive, accessible photo-and-caption sub-application with its own style and navigation. Users share Flickr photos as Posts and compete to caption them; both Posts and Captions accrue Likes. Content is served today by a back-end-faithful mock (see [ADR-0002](docs/adr/0002-jedi-mock-data-contract.md)) that doubles as the data contract a future back-end implements.

**Post**:
The core feed entity — a shared Flickr photo with its owner, Categories, caption competition, and like/comment counts. The Post _is_ the photo;

**Top Photos** is Posts ranked by likes, not a separate entity.
_Avoid_: Photo (as a distinct entity), Image, feed item.

**Caption**:
An independently-liked line of text a User submits for a Post. Many Captions
compete per Post, each ranked by its own Likes; the top one is shown on the Post. A first-class entity — never merely a Post's "caption text".
_Avoid_: title; caption text (as a Post field).

**Category**:
A classification a Post carries; a Post's on-card "tags" _are_ its Categories (many-to-many). The single-select sidebar filters Posts by one Category.
_Avoid_: Tag, Label (as concepts separate from Category).

**Comment**:
A User's remark on a Post; today only its count is surfaced. Distinct from a
Conversations **Message**.
_Avoid_: post, reply.

**Author**:
The User who owns a Post, Caption, or Comment (`owner_id`); the UI renders the author's name and avatar. Distinct from the photo's original author.

**photographer**
(the external Flickr attribution), who is not a User.
_Avoid_: user (when the owning role is meant); poster.

**Top Photos** / **Top Captions**:
Ranked _views_, not stored lists. Top Photos = Posts ordered by like count (within the selected Category once filtering lands, #29); Top Captions = the
selected/featured Post's Captions ordered by like count.
_Avoid_: featured/popular list, best captions (as stored data).

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
