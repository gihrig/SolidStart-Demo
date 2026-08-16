# Merge the front-end and back-end into one mono-repo (`frontend/` + `backend/`)

#17 asks to merge the SolidStart front-end and the rust10x back-end — historically
two repos — into a single mono-repo, and to work out the implications for build
scripts and configuration. This ADR records the structure; [ADR-0012](0012-postgres-turso-db-swap-seam.md)
and [ADR-0011](0011-jedi-backend-domain-contract.md) cover what the merged
back-end does.

## Decisions

**Layout — `frontend/` + `backend/`.** Two top-level directories. Framework-neutral
(the front-end is a single Bun package, not a JS workspace), matches the
front-end/back-end vocabulary already in `CONTEXT.md` and the issue, and each
subtree keeps its own toolchain untouched.

**Host & history — host = the front-end repo (`gihrig/SolidStart-Demo`); preserve
back-end history.** The front-end repo becomes the mono-repo (it owns #17, the
domain model, and the product identity); its files move into `frontend/`. The
back-end (`gihrig/rust-web-app`, the majority of whose commits are the author's
own) is imported into `backend/` **with history** —
`git filter-repo --to-subdirectory-filter backend/` then a merge with
`--allow-unrelated-histories`, so `git blame backend/…` works through history.
This matters because [ADR-0012](0012-postgres-turso-db-swap-seam.md) rewrites the
exact code whose history is being kept. The `rust-web-app` remote goes dormant.

**Shared domain docs stay at the root.** Only **code and tool-config** descend
into the subtrees; `CONTEXT.md` and `docs/adr/` remain at the mono-repo root as
the shared model. The domain is treated as **one bounded context with two
surfaces** (the unified identity of [ADR-0007](0007-consolidate-jedi-shell-unified-identity.md)),
so there is a single root `CONTEXT.md`, not a per-subtree split.

**Build orchestration — a root `Scripts.toml` run by `run-cargo-script`
(`cgs`).** Cross-cutting recipes (`cgs dev`, `cgs build`, `cgs test`, `cgs check`,
`cgs bindings`) delegate to each subtree's native commands (`vpr …` in
`frontend/`, `cgs …` in `backend/`). `run-cargo-script` reads `Scripts.toml`
from the working directory and **runs without any `Cargo.toml`** (verified), so a
master file at the polyglot root — which has no root `Cargo.toml`, since Cargo's
lives at `backend/` — is valid. Subtree runners stay for single-side work.

**ts-rs bindings — one source of truth via a tsconfig path alias.** The back-end
keeps exporting bindings to `backend/crates/services/web-server/bindings/`
(committed). The front-end's duplicated copies are deleted; its barrel
(`src/types/backend/index.ts`) imports the raw bindings through a `paths` alias
into that directory, still applying `NumericIds` and its hand-authored types. Every
consumer keeps importing `~/types/backend` unchanged. A CI **bindings-drift guard**
(`cgs bindings` + `git diff --exit-code`) keeps the committed bindings in step with
the Rust types.

**Dev workflow.** `cgs dev` runs both servers via `concurrently` (kill-both). This is
DB-independent and lands with the merge (#72), against the existing **Postgres**
back-end. The **zero-infra dev default** and the **self-booting `cgs test:e2e`** arrive
later, on the Turso track ([ADR-0012](0012-postgres-turso-db-swap-seam.md)): the
`turso` crate runs in-process against a local file, so once it lands `cgs dev` and
`cgs test:e2e` need no Docker. Until then, `cgs test:e2e` still expects a running
back-end.

**Dotfiles & tooling.** `.gitignore` is **nested, not hoisted** — the back-end's
`.gitignore` opens with `.*` (ignore all dotfiles), which at the root would swallow
`.github`/`.vscode`/`.claude`; it must stay scoped to `backend/`. `CLAUDE.md` is
**light-split**: cross-cutting rules at root (always loaded), tool-specific rules
in `frontend/` and `backend/` (loaded when Claude works there). Editor and CI are
root-level: one `.vscode/` (with a rust-analyzer `linkedProjects` pointer to
`backend/Cargo.toml`, which is not at the repo root) and one `.github/`.

**CI — full GitHub Actions workflow, run on every PR (not path-filtered).** A
back-end job (`fmt`/`clippy`/`nextest`/`build`) under a **DB matrix
`{turso, postgres}`**, a front-end job (`vp check` — not `vpr check`, which would
`--fix` in CI — plus `vp test`, `vinxi build`), the bindings-drift guard, and a
self-booting e2e job (non-blocking at first). Path-filtering is avoided because the
tsconfig alias couples the sides: a back-end entity change regenerates bindings and
must re-run the front-end type-check.

## Considered and rejected

- **`apps/{web,server}` + `packages/`** — the JS-monorepo idiom; rejected as a
  false signal (we are not adopting Bun/Turbo/Nx workspaces) and speculative
  ("future apps" don't exist yet). Rename to `apps/` the day a second front-end or
  a shared `packages/` actually lands.
- **Cargo `crates/` at the root with the front-end under `frontend/`** (the
  back-end-centric layout, and what `backend/planning/bun_vite+_monorepo.md`
  proposed) — rejected: buries the front-end, and that plan also assumed a _fresh_
  repo (`git init`, `bun create`, `cargo new`), discarding both histories.
- **Fresh repo / snapshot-import the back-end** — rejected: discards the back-end
  history that [ADR-0012](0012-postgres-turso-db-swap-seam.md) is about to rewrite.
- **`just` or a root `package.json` + `concurrently`** for orchestration —
  rejected: `just` is a new install when `cgs` already fills the role; a root
  `package.json` plants a JS artifact at the polyglot root and invites `vp`/`vpr`
  ambiguity and Bun-workspace creep.
- **Bindings: export ts-rs directly into `frontend/src`, or automate a copy** —
  rejected: exporting into `src` makes `cargo test` mutate the front-end tree,
  pits oxfmt against ts-rs formatting on every regen, and dumps the back-end Error
  types into `src`; automating a copy keeps the duplication and needs a drift
  guard anyway.

## Consequences

- This refines [ADR-0001](0001-frontend-modular-monolith.md) (the front-end stays a
  modular-monolith package, now living in the `frontend/` subtree) and
  [ADR-0003](0003-entity-identity-number-at-barrel.md): the barrel now sources
  bindings via the alias. ADR-0003 rejected a back-end `#[ts(type="number")]`
  override partly because _"the Rust back-end is not in this repo"_ — a premise the
  merge removes. `NumericIds` is kept for now (the "keep generated files pristine"
  reason still holds); revisiting id-representation is logged as a follow-on.
- The front-end tsconfig now reaches into `backend/…/bindings` — a deliberate
  front-end→back-end source dependency, which is the integration #17 wants.
- The day-to-day command surface shifts: cross-cutting work via `cgs` at the root,
  single-side work by `cd`-ing into a subtree.
- Back-end work is now tracked as issues on the single `gihrig/SolidStart-Demo`
  tracker, and `docs/adr/` now numbers TypeScript and Rust decisions in one
  sequence.
