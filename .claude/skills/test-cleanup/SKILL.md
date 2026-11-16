---
name: test-cleanup
description: Clean up, validate, and simplify existing tests. Use when reviewing, refactoring, deduplicating, or improving test quality for Vitest TypeScript, Playwright e2e, or Rust unit/integration tests. Triggers include test cleanup, simplify tests, remove test duplication, interface over implementation testing, test hygiene, or when a suite has grown large and needs pruning.
---

# Test Cleanup

Refactor existing tests so they are focused, non-duplicative, and protect real behavior. Prefer testing public interfaces and contracts over internal implementation details. Every test that remains must be able to catch a meaningful regression.

This skill complements TDD-style test writing (e.g. Matt Pocock style). Use it on suites that already exist and have grown complex, duplicated, or overly coupled to implementation.

## Project Structure (Monorepo)

The codebase is a monorepo:

```
/
├── frontend/          # SolidJS + TypeScript (Vitest unit/integration + Playwright e2e)
├── backend/           # Axum + Rust (#[cfg(test)] and #[tokio::test])
└── (root)             # Cross-cutting concerns, shared tooling, workspace config
```

- Frontend and backend tests live inside their respective folders.
- Playwright e2e tests run against a live backend. Because the full stack is available in the monorepo, **prefer real services over mocks**.
- Root-level shared code should be tested close to its consumers or via thin integration tests that exercise the real boundary.

## Core Principles

1. **Interfaces over implementation**
   - Test the public API, contract, or observable behavior.
   - Avoid asserting on private helpers, internal state shape, call counts of mocks, or implementation-specific sequencing.
   - If a test breaks when you refactor internals without changing behavior, it is testing implementation.

2. **No duplication**
   - Extract shared setup into helpers, fixtures, or `beforeEach` only when it improves clarity.
   - Prefer parameterized tests (`it.each` / `test.each` in Vitest, table-driven tests in Rust) over copy-paste cases.
   - Delete tests that are strict subsets of other tests or that assert the same behavior through a different path with no additional coverage value.

3. **Every test earns its keep**
   - Ask: "What real bug or regression would this catch?"
   - Delete tests that only prove the test framework works, that restate the type system, or that assert trivial getters/setters with no logic.
   - Prefer one strong test over three weak overlapping ones.

4. **Simplicity consistent with effectiveness**
   - Shorter arrangement, clear act, focused assertions.
   - Prefer real collaborators (especially the live backend for e2e) over elaborate mock graphs.
   - Keep test names descriptive of the behavior under test, not the implementation steps.

5. **Aggressive stance on mocks**
   - Default to **no mocks**.
   - Only introduce a mock or test double when the real dependency is slow, non-deterministic, expensive, or truly external (third-party APIs, email, payment providers, etc.).
   - Because e2e tests already run against a live backend, most frontend tests should not mock network/API layers.
   - Heavy `vi.mock` graphs, mock call-order assertions, and mocks created solely to make a unit test pass are red flags — rewrite or delete.
   - In Rust, prefer in-memory implementations or real test instances of stores/DB over trait mocks unless the trait boundary is the explicit subject under test.

## Review Process

When cleaning a file or suite:

1. **Inventory** — Identify what each test claims to protect.
2. **Classify** — Mark as keep / merge / rewrite / delete.
3. **Deduplicate** — Collapse overlapping cases; extract shared setup only when it reduces noise.
4. **Re-anchor** — Move assertions onto public interfaces or observable outcomes.
5. **Remove mocks** — Replace unnecessary mocks with real collaborators or thinner seams.
6. **Simplify** — Reduce setup, tighten assertions.
7. **Validate** — Ensure remaining tests still fail for the right reasons (temporarily breaking the code).

Do not rewrite tests just for style. Only change what improves the principles above.

## Red Flags (delete or rewrite)

- Tests that break on pure refactors with no behavior change.
- Any mock of the backend or internal API when the real service is available.
- Assertions on mock call order, call counts, or exact argument objects when only the outcome matters.
- Multiple tests that differ only in incidental data.
- Tests whose only value is "it renders" or "it does not throw" with no meaningful assertion.
- Snapshot tests used as a substitute for understanding behavior (especially large or frequently churning snapshots).
- Rust tests that reach into private fields or modules just to assert internal state.
- Frontend unit tests that re-implement or heavily mock what Playwright already covers end-to-end.

## Framework Guidance

### Vitest + TypeScript (unit / integration) — `frontend/`

- Prefer testing components and modules through their exported API.
- For SolidJS, assert on rendered output, user-visible state, or emitted events rather than internal signals when possible.
- Use `it.each` / `test.each` for combinatorial cases.
- Colocate test utilities inside `frontend/`; avoid giant shared setup that hides context.
- Keep async tests honest — await the actual condition, not arbitrary timeouts.
- **Do not mock the backend API** for tests that can reasonably run against the real (or test) backend. Push integration concerns to Playwright or thin API-level tests.

### Playwright (e2e) — `frontend/`

- These tests require the backend to be running. Treat that as a feature, not a burden.
- Focus on user-visible flows and critical composition paths (auth, data loading, multi-step workflows).
- Prefer role/accessible selectors and user-facing text over brittle CSS/XPath.
- One focused scenario per test when possible; share setup via fixtures.
- Avoid testing pure styling or layout details unless they are product requirements.
- Prefer these real-stack tests over mocked unit tests for anything that crosses the frontend/backend boundary.

### Rust (`#[cfg(test)]` and `#[tokio::test]`) — `backend/`

- Test through the public API of the crate or module.
- Prefer table-driven tests for multiple cases.
- Use `#[tokio::test]` only when the code under test is actually async.
- Avoid testing private functions directly; if a private function needs heavy testing, consider whether it should be a separate unit with a clearer boundary.
- Prefer in-memory stores, test databases, or real test instances over heavy trait mocking.
- Keep test modules close to the code (`#[cfg(test)] mod tests`) unless the suite is large enough to warrant a dedicated `tests/` directory.
- For Axum handlers, prefer `oneshot` or a test server that exercises extractors and middleware.

## When to Keep a "Complex" Test

Complexity is acceptable when:

- It protects a high-value, hard-to-unit-test interaction (auth flows, multi-step workflows, concurrency).
- The alternative would be a brittle web of mocks that no longer reflect reality.
- The test documents an important invariant that is not obvious from types or code.
- It is an e2e test exercising the real frontend + backend boundary.

## Output Style When Applying This Skill

- Be decisive: recommend delete / merge / rewrite with a one-line reason.
- Show the simplified version when rewriting.
- Explicitly call out mocks that should be removed.
- Do not preserve tests out of sunk-cost attachment.
- Preserve coverage of real risk; ruthlessly remove the rest.

## References

- `references/principles.md` — expanded decision criteria and examples
- `references/framework-notes.md` — Vitest, Playwright, and Rust specifics
