---
name: test-cleanup
description: Clean up existing tests in this repo — Vitest component/unit tests, Playwright e2e, Rust model and HTTP tests. Use to deduplicate, simplify, de-mock, or prune a test file or suite, or to move assertions from implementation details to behavior.
---

# Test Cleanup

Make existing tests focused, non-duplicated, and anchored to behavior. Every
test that stays must catch a real regression. This skill does not write new
features test-first; use `mattpocock-skills:tdd` for that.

## Principles

1. **Behavior over implementation.** Assert on what a user or caller sees:
   rendered DOM, return values, HTTP status + body, rows in the DB. A test that
   breaks on a pure refactor tests implementation.
2. **No duplication.** Collapse cases that differ only in data into `it.each` /
   `test.each` or a Rust table. A test is a duplicate only when its setup,
   actions and protected behavior all match another test's. Shared assertions
   alone do not make it one: a test with different setup can catch a
   different bug.
3. **Every test earns its keep.** Ask "what bug would this catch?" Delete tests
   that restate the type system, prove the framework works, or assert
   "it renders" with nothing after it.
4. **Mock only at the boundary for that layer** (table below). Mocks inside the
   boundary, call-count/call-order assertions, and mocks that force the path
   under test are red flags.
5. **Keep complexity that pays.** Auth flows, multi-step workflows, concurrency,
   and real front-end ↔ back-end paths can stay long.
6. **No style-only rewrites.** Change a test only when a principle above improves.

## Mock policy per layer

| Layer                       | Runs against                      | Allowed seam                                      |
| --------------------------- | --------------------------------- | ------------------------------------------------- |
| Vitest (all of `src/`)      | jsdom, **no back-end, no server request** | Anything jsdom cannot provide (examples below) |
| Playwright `e2e/`           | real FE + BE + edge `https://localhost:3443` | none                                   |
| Rust model (`lib-core`)     | real Postgres via `_dev_utils::init_test()` | none                                    |
| Rust HTTP (`web-server/src/app.rs`) | `axum_test::TestServer` on the real `app()` router | none                         |

The Vitest seams below are examples, not a full list. A Vitest mock is valid
when it replaces something jsdom cannot provide. A mock of a module under test,
or of logic inside it, is not valid. Examples in use today:

- RPC: `vi.mock("~/lib/backend-rpc")`, `vi.mock("~/lib/jedi/jedi-api")`.
- Server functions: `vi.mock("~/lib/theme")` for `saveTheme`;
  `vi.mock("solid-js/web")` for `getRequestEvent`.
- Browser transports and APIs: `vi.stubGlobal("WebSocket", …)`,
  `vi.stubGlobal("matchMedia", …)`, and `vi.stubGlobal("fetch", …)` when the
  module under test *is* the transport (`backend-rpc.unit.test.ts`).

If a seam is not in this list, judge it by the rule, and name it in the report.

Vitest cannot reach the back-end, so a mock at the RPC seam is correct there —
never delete a Vitest test only because it mocks `backend-rpc`. Instead, check
that the mocked responses match the real wire shape (the ts-rs bindings in
`~backend-bindings`), and that assertions target the DOM, not the mock calls.

## Repo conventions a rewrite must keep

- Front-end imports come from `vite-plus/test`, never `vitest`. Component
  tests use `@solidjs/testing-library`.
- File names: `src/lib/**/*.unit.test.ts`, `src/components/**/*.test.tsx`,
  `src/routes/**/*.test.tsx`, `e2e/*.spec.ts`. Vitest tests sit next to the
  file under test. Playwright tests live in `frontend/e2e/`.
- Playwright: role/label/text selectors; await a condition, never a fixed
  timeout. `e2e/live.spec.ts` changes seeded counts and runs only in the
  `live` project.
- Rust DB tests (any test that calls `init_test()`) carry `#[serial]` and
  clean up their own rows (`_dev_utils::clean_users`, `seed_*` helpers).
  `#[serial]` locks only inside one process. Under nextest, every test is its
  own process and rebuilds the DB, so `-j1` is what keeps DB tests apart.
  Do not remove `-j1` or `#[serial]` as a "cleanup".
- `#[tokio::test]` only for async code.
- Do not reach into private fields for assertions. If a private fn needs heavy
  testing, report it as a design finding; do not widen its visibility.

## Process

1. **Baseline.** Run the affected suite (commands below). Record pass count.
   If it fails before you start, stop and report.
2. **Inventory.** For each test: what behavior it protects, and which other
   test (any layer) covers the same behavior.
3. **Classify** each test: keep / merge / rewrite / delete, with a one-line reason.
4. **Approval gate.** Show the table to the user. Do not edit or delete tests
   until the user approves it. The maintainer owns what "expected behavior" is.
5. **Apply** the approved changes. Show the simplified version of each rewrite.
6. **Prove each rewritten test bites.** Save the starting diff with
   `git diff -- <source-file> > <scratch>/before.diff`. Break the behavior it
   protects with one Edit to the source file. Run only that test and confirm
   it fails for the expected reason. Restore by reversing that same Edit.
   Never restore with `git checkout`: it deletes the user's unstaged edits,
   and it deletes approved rewrites of inline Rust `#[cfg(test)]` modules.
   Then confirm the restore is exact:
   `git diff -- <source-file> | diff - <scratch>/before.diff` must print
   nothing. If it prints anything, stop and report it.
7. **Re-run** the full affected suite. Report before/after counts and lines removed.

## Commands

| Scope                     | Run from    | Command                     |
| ------------------------- | ----------- | --------------------------- |
| Vitest `src/lib`          | `frontend/` | `vpr test:unit`             |
| Vitest `src/components`   | `frontend/` | `vpr test:comp`             |
| Vitest `src/routes`       | `frontend/` | `vp test src/routes`        |
| All Vitest                | `frontend/` | `vpr test`                  |
| One Vitest file           | `frontend/` | `vp test <path>`            |
| Playwright                | `frontend/` | `vpr test:e2e <pw args>`    |
| Rust                      | `backend/`  | `cgs test` (nextest `-j1`)  |
| One Rust test             | `backend/`  | `cargo nextest run -j1 <name>` |

Gotchas:

- Postgres must run for Rust tests and e2e (`cgs db` in `backend/`).
- Run e2e only through `vpr test:e2e`. It starts a fresh back-end, which
  rebuilds the DB from the seed, so every run starts from the seed counts.
  Never run `vpx playwright test` against the user's dev servers: it skips
  the seed and changes dev data.
- `vpr test:e2e` exits if `:8080` or `:3443` is busy. If so, do not stop the
  servers yourself. Stop and ask the user to stop them, then run it again.
- **Never run Rust tests while the dev back-end runs.** `init_test()` recreates
  the database (`DROP DATABASE IF EXISTS app_db`) that the dev server uses.
  If no back-end test changed, skip them and say so.

## Report format

Per file: a table `| Test | Verdict | Reason |`, then the diffs, then the
suite results. Call out every removed mock and every deleted test by name.
