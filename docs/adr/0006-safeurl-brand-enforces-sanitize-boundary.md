# A `SafeUrl` branded type enforces the single sanitize boundary

[ADR-0002](0002-jedi-mock-data-contract.md) established that the `jedi-api` seam
is the single trust boundary where every URL field passes through `sanitizeUrl`.
The code only half-honored it: the seam sanitized, yet `Author`/`Image`/`Hero`
re-sanitized their inputs while the sidebar cards bound URLs raw — two owners, so
neither was clearly responsible. We now make the seam the _sole_ owner and encode
that in the type system: `sanitizeUrl` returns a branded `SafeUrl`, the seam's
view types (`AuthorRef`, `PostView`, `HeroView`) carry `SafeUrl` on every URL
field, and URL-consuming component props require `SafeUrl`. A raw `string` can no
longer reach those props without passing a minter, so the leaves drop their
redundant re-sanitizing and bind what they are given.

There are exactly two minters. `sanitizeUrl` mints from untrusted runtime input
(it validates). `trustedUrl` mints from a developer-authored constant (a promise,
no check) — the escape hatch for literals like `href="#"` that branded props
would otherwise reject. Both are greppable, so a reviewer can spot `trustedUrl`
applied to runtime input at a glance.

## Considered and rejected

- **Comment-only convention** — document "seam output is pre-sanitized, bind raw"
  in the ADR and a seam comment, no type machinery. Rejected: with a live back-end
  arriving, real user-supplied URLs are imminent; a comment can't stop a future
  consumer from binding an unsanitized string, and leaves any post-seam string
  manipulation (`imageSrc + "?w=200"`) silently unchecked. The brand makes such a
  manipulation a compile error.
- **Brand the data model but not component props** — brand the view types, keep
  `string` on `Author`/`Image`/`Hero` props. Rejected: it proves the seam
  sanitized but still lets a caller pass any raw string into a URL-consuming
  component. Requiring `SafeUrl` at the prop boundary turns that into a build
  failure and keeps no "wrong" examples in the codebase to be copied. The cost is
  the `trustedUrl` escape hatch for literal URLs, accepted as small and localized.

## Consequences

- DOM intrinsic attributes (`<img src>`, `<a href>`) are typed `string`, so the
  brand cannot narrow them. The raw-bind sites in the sidebar cards, `JediNav`,
  and `FeaturedPost`'s `photographerUrl` remain raw binds — now provably fed
  `SafeUrl` values, but a future direct `<a href={rawString}>` still typechecks.
  The guarantee lives in the _data_, not at the DOM sink.
- A URL that `sanitizeUrl` rejects collapses to the empty `SafeUrl` (`""`), so a
  blocked URL binds `src=""`/`href=""`. Rendering behavior for empty URLs is left
  unchanged and tracked separately.
