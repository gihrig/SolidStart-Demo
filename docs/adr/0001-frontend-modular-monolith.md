# Front-end is a modular monolith; package split deferred to the back-end merge

The two demo contexts — real-time Conversations and Jedi — already share no
domain code, only the SolidStart app shell and theme. We therefore keep them
as one SolidStart package organized as a modular monolith, rather than a
multi-package front-end monorepo, which would add workspace and build ceremony
without reducing coupling that is already near-zero.

The multi-package split is deferred to the planned merge with the Rust back-end
(issue #17). At that point this entire front-end becomes a single package (e.g.
`apps/web`) beside the back-end and shared contract types; the Realtime-vs-Jedi
divide stays a within-front-end folder boundary, never a package boundary.

## Considered and rejected

- **Front-end multi-package monorepo now** — rejected: no isolation gain over
  the existing cohesion; models premature modularization.
- **Polyrepo** — rejected: works against the back-end merge plan.
