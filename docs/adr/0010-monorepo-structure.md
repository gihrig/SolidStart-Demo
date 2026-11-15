# Merge the front-end and back-end into one mono-repo (`frontend/` + `backend/`)

Origin: #17

The SolidStart front-end and the rust10x back-end were two repos. They now
share one repo, `gihrig/SolidStart-Demo`.

## Decisions

- **Layout: `frontend/` and `backend/`.** Each subtree keeps its own toolchain.
  The front-end is one Bun package, not a JS workspace.
- **The front-end repo is the host; the back-end keeps its history.** The
  back-end came in through `git filter-repo --to-subdirectory-filter backend/`
  and a merge with `--allow-unrelated-histories`. So `git blame backend/…` works
  through the old history.
- **Shared docs stay at the root.** The domain is one bounded context with two
  surfaces. So `GLOSSARY.md`, `docs/adr/`, the architecture reviews (`docs/ar/`)
  and the research notes (`docs/research/`) are at the root. Only code and tool
  config go into the subtrees.
- **One runner, `cgs` (`cargo-run`), everywhere.** The root `Scripts.toml` holds
  the cross-cutting recipes, and each recipe calls `cgs` in a subtree.
  `cargo-run` needs no `Cargo.toml`, so it runs at the root. The front-end
  `Scripts.toml` is a thin alias for each `package.json` script, through `vpr`.
  `package.json` stays the source of truth for the front-end scripts.
- **One copy of the ts-rs bindings.** The back-end writes them to
  `backend/crates/services/web-server/bindings/`, and git tracks them. The
  front-end reads them through a tsconfig `paths` alias. A CI drift guard runs
  `cgs bindings` and `git diff --exit-code`.
- **Nested `.gitignore`.** The back-end `.gitignore` starts with `.*`. At the
  root, it would hide `.github`, `.vscode` and `.claude`.
- **Split `CLAUDE.md`.** The root file holds the cross-cutting rules. Each
  subtree file holds the rules for its tools.
- **CI runs every job on every PR, with no path filter.** The tsconfig alias
  couples the two sides. A back-end type change regenerates the bindings, so the
  front-end type check must run again.

## Considered and rejected

- **`apps/{web,server}` and `packages/`.** This JS-workspace layout signals
  tooling that the repo does not use. Rename to it when a second app exists.
- **Cargo `crates/` at the root, front-end under `frontend/`.** It hides the
  front-end.
- **A fresh repo, or a snapshot import of the back-end.** It discards the
  back-end history.
- **`just`, or a root `package.json` with `concurrently`.** `just` is one more
  install. A root `package.json` puts a JS file at the polyglot root and invites
  Bun-workspace creep.
- **All scripts in `Scripts.toml`, with no `package.json` scripts.** Tools read
  front-end scripts from `package.json`.
- **ts-rs export into `frontend/src`, or a copy step.** An export into `src`
  makes `cargo test` change the front-end tree, and oxfmt then fights the ts-rs
  format. A copy step keeps two copies and still needs a drift guard.

## Consequences

- The front-end tsconfig reads files in `backend/`. This front-end to back-end
  source dependency is intended.
- One issue tracker and one ADR sequence serve TypeScript and Rust decisions.
