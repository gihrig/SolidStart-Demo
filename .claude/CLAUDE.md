# SolidStart Demo — Mono-repo

A SolidJS/SolidStart front-end (`frontend/`) and a Rust/Axum back-end (`backend/`)
in one repo. See `CONTEXT.md` and `docs/adr/` (root) for the shared domain model;
[ADR-0010](docs/adr/0010-monorepo-structure.md) records the mono-repo structure.

**This file holds cross-cutting rules only.** Tool-specific rules live in the
subtree that owns them and load when Claude works there:

- `frontend/.claude/CLAUDE.md` — SolidStart/SolidJS/Tailwind/Vite+ rules.
- `backend/.claude/CLAUDE.md` — Rust/Axum back-end session notes & integration summary.

---

## Execution Notes (for Claude AI)

Read this section before starting any phase.

Always use the `concise` skill unless the user asks to 'explain' or for 'more detail'.

### Workflow

- Use `karpathy-guidelines` skills
- Use `concise` to communicate
- Phases labeled **(Claude)** are executed by Claude AI.
- Skip completed phases: `[√] Phase...`.
- Execute first incomplete phase: `[ ] Phase...`.
- The **final phase is labeled (User)** this is manual validation after all Claude phases are complete.
- Within each Claude phase:
  1. Execute each step in order.
  2. Run the step's verification (tests/checks) — **tests/checks must pass before the step is complete**.

---

## Command surface (mono-repo)

Cross-cutting recipes run from the repo root via `run-cargo-script` (`cgs`),
reading the root `Scripts.toml`; each delegates to the subtrees via `cgs` — the
back-end natively, the front-end through a `cgs` alias surface that proxies its
package.json scripts (ADR-0010 addendum).

| Command        | Description                                       |
| -------------- | ------------------------------------------------- |
| `cgs dev`      | Start both dev servers                            |
| `cgs start`    | Build + run both subtrees in release mode         |
| `cgs build`    | Build both subtrees                               |
| `cgs test`     | Run both test suites                              |
| `cgs test:e2e` | Run e2e tests (boots back-end + front-end)        |
| `cgs cover`    | Run both test suites with coverage                |
| `cgs check`    | Format + lint + type-check both subtrees          |
| `cgs update`   | Update dependencies in both subtrees              |
| `cgs bindings` | Regenerate ts-rs bindings (back-end)              |

Single-side work: `cd frontend` or `cd backend` and use `cgs …` (both subtrees now
expose a `cgs` surface); `vpr …` still works in `frontend/`. See the subtree
`CLAUDE.md` for each side's command table.

---

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `gihrig/SolidStart-Demo`, managed via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to a like-named GitHub label. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
