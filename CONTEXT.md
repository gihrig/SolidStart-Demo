# SolidStart Demo — Front-end

The front-end of a technology demo, serving as a production-standard reference
for future projects. It is a single SolidStart package — a modular monolith (see
[ADR-0001](docs/adr/0001-frontend-modular-monolith.md)) — holding two independent
demo contexts, **Realtime Conversations** and **Jedi**, over a shared app shell
and theme.

## Realtime Conversations

A demo of real-time conversations: Users exchange Messages within Conversations,
each Conversation organized under an Agent.

**User**:
An authenticated identity that owns Agents and Conversations and authors
Messages. Every User is either an Admin user or a Standard user.
_Avoid_: account.

**Admin user**:
A User holding maximum control and configuration permissions.
_Avoid_: system user, superuser, root.

**Standard user**:
A User with ordinary permissions — the default tier (deliberately not called
"User", which names the identity above).
_Avoid_: regular user.

**Agent**:
A container that groups Conversations; a User selects one and converses within it.
An Agent is not a participant — it never authors Messages — despite carrying an AI
provider and model (`ai_provider`, `ai_model`).
_Avoid_: bot, assistant, responder; "agent" in the AFK / coding-agent sense used
by the issue tracker.

**Conversation**:
A thread of Messages within one Agent, owned by the Standard user who created it.
Ownership is fixed — a Conversation and its Messages never transfer to another
User. Each Conversation has an access `kind` that scopes who may take part.
_Avoid_: chat, room.

**Owner**:
The User who created an entity — an Agent (an Admin user) or a Conversation (a
Standard user). Fixed for the entity's life. For a Conversation, only its Owner
or an Admin user may delete Messages or the whole thread.
_Avoid_: creator.

**Member**:
A User admitted to a Conversation beyond its Owner; Owner-plus-Members are who
may take part in a private Conversation.
_Avoid_: participant.

**Message**:
An entry a User — the Owner or a Member — posts in a Conversation; that User is the
Message's author, distinct from the Conversation Owner.
_Avoid_: post, comment.

**Conversation kind** (`OwnerOnly` | `MultiUsers`):
A Conversation's access scope. `OwnerOnly` is private — only its Owner and invited
Members may read or post. `MultiUsers` is public — any User may read and post,
without invitation.
_Avoid_: visibility, permission.

**Conversation state** (`Active` | `Archived`):
A Conversation's lifecycle. `Active` is in the working set; `Archived` is retained
but hidden from it — never deleted.
_Avoid_: status.

### Planned renames

Headings above use today's back-end tokens so the glossary matches the current
code; these are the names a future back-end refactor is expected to adopt.

- `Agent` → **Channel**
- `typ` → **userType**; tier values `Sys` → **admin**, `User` → **standard**
- `kind` values `OwnerOnly` → **Private**, `MultiUsers` → **Public**
- the `Conv*` type family → **`Thread*`** (`Conv`→`Thread`, `ConvMsg`→`ThreadMsg`,
  `ConvUser`→`ThreadUser`, `ConvKind`→`ThreadKind`, `ConvState`→`ThreadState`)

## Jedi

A responsive, accessible photo-and-caption sub-application with its own style and
navigation. Its content will be database-backed (work in progress); the glossary
is deferred until that model lands. The first term to pin will be **Caption** — an
independently-liked entity, ranked separately from Photos, not merely a Photo's
caption text.
