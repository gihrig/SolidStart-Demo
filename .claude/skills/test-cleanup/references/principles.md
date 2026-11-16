# Test Cleanup Principles — Expanded

## Decision Criteria

### Keep when

- The test fails if a real user-visible or API-visible behavior changes.
- It covers an edge case or error path that is easy to regress.
- It documents a non-obvious invariant.
- It is the simplest reliable way to protect a high-value path.
- It exercises the real frontend + backend boundary (Playwright with live backend).

### Merge / Parameterize when

- Multiple tests differ only in input data or expected output.
- The arrangement is identical and only the assertion target changes.

### Rewrite when

- The test is coupled to implementation but the behavior is worth protecting.
- Setup is so heavy that the intent is obscured.
- Assertions are scattered or testing multiple unrelated behaviors.
- The test relies on mocks that can be replaced by real collaborators.

### Delete when

- It only passes because of mocks that force the desired path.
- It mocks the backend or internal API when a real service is available.
- It duplicates coverage already provided by a clearer test (especially when a Playwright test already covers the same path).
- It asserts implementation details that should be free to change.
- It does not fail for any real reason and would not catch a meaningful bug.
- It exists mainly to increase coverage metrics.

## Interface vs Implementation — Examples

**Implementation-coupled (bad)**

- Asserting that a private helper was called N times.
- Checking the exact shape of an internal cache or signal.
- Verifying call order of collaborators that are implementation choices.
- Snapshotting large internal data structures.
- Mocking the backend API in a frontend test when Playwright already hits the real backend.

**Interface-oriented (good)**

- Given these inputs / this user action, the observable result is X.
- The public function returns the documented error for invalid input.
- After the flow, the user sees the expected UI state or the API returns the expected status + body.
- A concurrent scenario does not produce data races or lost updates (observable via public API).

## Mocks — Aggressive Default

Default position: **no mocks**.

Only introduce a mock or test double when:

- The dependency is truly external (third-party API, email, payments, etc.), or
- The real dependency is slow, non-deterministic, or expensive, and
- No thinner real seam (in-memory store, test backend, test server) is practical.

In this monorepo, Playwright already runs against a live backend. That removes most justification for mocking network/API layers in Vitest tests.

## Duplication Patterns to Eliminate

1. **Identical setup, different data** → `it.each` / table-driven.
2. **Same behavior, different entry points** → keep the highest-signal entry point; drop the rest unless the extra path has unique risk.
3. **Happy path + trivial variations** → collapse into one well-named case plus true edge cases.
4. **Mocked unit test + real e2e test of the same path** → prefer the real e2e plus a thin non-mocked integration test and delete/simplify the mocked version.
5. **Unit test + e2e test of pure logic** → keep the faster unit test; narrow or drop the e2e if it adds no composition value.

## Simplicity Heuristics

- Can a reader understand the test in under 30 seconds?
- Is every line in the arrangement necessary for the assertion?
- Would a future change that preserves behavior require updating this test? If yes, it is probably too tightly coupled.
- Does the test name describe the behavior, not the steps?
- Are there mocks that could be deleted without losing confidence?
