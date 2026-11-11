# SolidStart Demo — Mono-repo

A SolidJS/SolidStart front-end (`frontend/`) and a Rust/Axum back-end (`backend/`)
in one repo. See `GLOSSARY.md` and `docs/adr/` (root) for the shared domain model;
[ADR-0010](docs/adr/0010-monorepo-structure.md) records the mono-repo structure.

**This file holds cross-cutting rules only.** Tool-specific rules live in the
subtree that owns them and load when Claude works there:

- `frontend/.claude/CLAUDE.md` — SolidStart/SolidJS/Tailwind/Vite+ rules.
- `backend/.claude/CLAUDE.md` — Rust/Axum back-end session notes & integration summary.

---

## Execution Notes (for Claude AI)

This 'demo' project sets a pattern for future production quality projects.
Robustness, security and correctness are primary concerns.

Call previously existing code "existing", not "hand written".
Use US English.

- Use "traveling" _not_ "travelling".
- Use "behavior" _not_ "behaviour".

### Workflow

- Use `karpathy-guidelines` skills
- Use `concise` to communicate

---

## Command surface (mono-repo)

Cross-cutting recipes run from the repo root via `cargo-run` (`cgs`),
reading the root `Scripts.toml`; each delegates to the subtrees via `cgs` — the
back-end natively, the front-end through a `cgs` alias surface that proxies its
package.json scripts (ADR-0010 addendum). Each recipe there has an `info`
string that says what it does and which `-e` fields it takes.

`cgs caddy` serves nothing by itself; `cgs dev` and `cgs start` run it with both
servers. Run it by hand for `cgs caddy:trust`, or beside each server in its own
terminal (`cd backend && cgs dev`, `cd frontend && cgs dev`).

Single-side work: `cd frontend` or `cd backend` and use `cgs …`; in `frontend/`,
`vpr …` also works. Each subtree lists its own recipes in its own `Scripts.toml`.

---

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `gihrig/SolidStart-Demo`, managed via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to a like-named GitHub label. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
