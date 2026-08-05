# Consolidate to a single Jedi-shell app with a root-level unified identity

Issue #62 collapses the demo's neutral home (a Counter page) and plain shared
nav into one cohesive application. **Jedi** becomes the home page at `/`, and its
chrome — the "Awesome" nav/header and the theme toggle — becomes the global app
shell rendered on every route; **Realtime Conversations** stays as the
**FullStack** sub-page reached from that nav. To put the single-identity
direction structurally in place now, `AuthProvider` moves to the app root
(removed from the FullStack page) so the global nav avatar reflects the
Conversations login; in the interim the avatar blends the login `username()`
with the Jedi mock **profile** avatar, and the back-end merge (#17) will unify
them into one authenticated identity.

This refines [ADR-0001](0001-frontend-modular-monolith.md): the front-end stays
one modular-monolith package, but the shared shell is now Jedi's rather than a
neutral one, and the Conversations/Jedi divide narrows toward a shared identity.

## Consequences

- The Jedi-styled dark header now sits above the light `.demo` About/Readme
  bodies (accepted for now).
- `.jedi-header`/`.navitems` become `.site-header`/`.site-nav`; the product names
  "Jedi" and "FullStack" are retained pending #17.
- No session restore yet: a reload starts logged-out, so the avatar shows the
  mock profile until a FullStack login.
