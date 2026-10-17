# Jedi tables are built beside the FullStack tables, which are then removed

The [ADR-0011](0011-jedi-backend-domain-contract.md) addendum (#110) says that the
merge **evolves** the live Conversations back-end into Jedi's vocabulary. Its lineage
table says that `Agent` and `Conv` are renamed and that "the table lives on". The
build did not do that. Each Jedi table was built **beside** its FullStack table:
`category` beside `agent`, `post` beside `conv`, and `post_comment` and
`caption_comment` beside `conv_msg` (#190). #128 then removed the FullStack surface.

## Decisions

**Expand, then contract.** Each Jedi capability is built as new tables, RPCs and
channels beside the FullStack ones (#116–#127). The FullStack page keeps running on
its own tables until every capability that replaces it is in place. Then one
contract step (#128) removes the FullStack surface. CI stays green at each step.

**The contract step removes the whole FullStack surface.** It removes:

- the `agent`, `conv`, `conv_user` and `conv_msg` tables, with their entities, RPCs
  and ts-rs bindings;
- the `conv` / `agents` / `convs` Channel variants, `WsEvent::ConvMsg` and their
  poke markers;
- the `/fullstack` route, its Nav and Footer links, the Conversation navigator and
  the message panel.

**The subscribe-time authorization seam stays.** After the contract step, every
Channel is authenticated-read. `Channel::authorize` keeps its `(ctx, mm)` arguments
and its exhaustive match with no `_` arm, so a new variant must still choose its
rule ([ADR-0015](0015-realtime-push-authorization-at-subscribe-time.md)).

## Considered and rejected

- **Rename the FullStack tables in place** (the ADR-0011 addendum plan). Rejected:
  the FullStack page ran on those tables until #128. A rename in place breaks the
  live page, or forces the whole merge into one change. The tables hold only dev
  seed data, so a build beside them loses nothing.
- **Delete `Channel::authorize` when no Channel needs a row scope.** Rejected: a
  later scoped Channel would have to build the seam again. The exhaustive match
  costs nothing today.

## Consequences

- The ADR-0011 addendum is superseded in part. Its lineage table's "renamed … the
  table lives on" changes to "built beside, then removed". Its other decisions stand.
- [ADR-0004](0004-conversation-navigator-disclosure-listbox.md) is superseded in
  part. The Conversation navigator is removed. Its `useDisclosure` section stays in
  force, because the Nav profile dropdown and the mobile menu use it.
- The schema and the dev seed drop the FullStack tables in place. The project has
  no migrations.
- The ADR-0015 mechanism stays, but no current Channel uses a row read scope.
- The login form moves from `/fullstack` into a Nav dialog (#128).
