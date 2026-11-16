# Framework-Specific Notes

## Project Context

Monorepo layout:

- `frontend/` — SolidJS + TypeScript (Vitest + Playwright)
- `backend/` — Axum + Rust
- Root — cross-cutting concerns

Playwright e2e tests run with a live backend. This makes most API/network mocks unnecessary and undesirable.

## Vitest + TypeScript / SolidJS (`frontend/`)

### Prefer

- Testing exported functions, components, and hooks through their public surface.
- Asserting on DOM output, accessibility tree, or returned values.
- `it.each` / `test.each` for data variations.
- Thin, intention-revealing test helpers colocated in `frontend/`.
- Real or test-backend responses over mocked fetch/API layers when practical.

### Avoid / Aggressively remove

- `vi.mock` of backend API modules or fetch wrappers.
- Deep mock graphs that recreate the module tree.
- Assertions on mock call counts, order, or exact argument objects.
- Asserting on internal Solid signals or stores when the rendered result is sufficient.
- Large shared `beforeEach` that obscures individual test intent.
- Snapshotting entire component trees when targeted assertions are clearer.

### SolidJS tips

- Prefer `render` + queries that match how users (or screen readers) perceive the UI.
- Test effects and reactivity by changing inputs and observing outputs.
- For stores/context, test consumer-facing behavior.

## Playwright (`frontend/`)

### Prefer

- Real backend (already required by the project setup).
- Critical user journeys and high-value composition paths.
- Role-based and text-based selectors (`getByRole`, `getByText`, `getByLabel`).
- Fixtures for repeated auth/setup.
- Explicit assertions on outcomes the user cares about.

### Avoid

- Any mocking of the backend or network for e2e tests.
- Re-testing pure logic already covered by fast Vitest or Rust tests.
- Brittle selectors tied to CSS classes or DOM structure.
- Overly long tests that perform many unrelated actions.
- Fixed timeouts when a specific condition can be awaited.

### Guidance

- Lean on these real-stack tests for anything that crosses the frontend/backend boundary.
- Push detailed business-rule coverage down to Vitest (frontend pure logic) or Rust tests (backend).

## Rust (`backend/`)

### Prefer

- Public API tests at the module or crate boundary.
- Table-driven tests for multiple inputs.
- In-memory implementations, test databases, or real test instances of stores.
- `tokio::test` only for genuinely async code paths.
- Testing Axum handlers via `oneshot` or a test server (exercises extractors + middleware).

### Avoid / Aggressively remove

- Trait mocks when an in-memory or test double implementation is straightforward.
- Reaching into private fields or `pub(crate)` items solely for assertions.
- Testing every private helper in isolation when public behavior already exercises them.
- Duplicating assertion logic across many test functions.

### Axum-specific

- Auth, validation, and error mapping are high-value targets for interface-level tests.
- Prefer exercising the full handler stack over calling internal functions that skip middleware.

## Cross-cutting Rules

- Default position: **no mocks**.
- Only mock true externals (third-party APIs, email, payments, etc.) or dependencies that are slow/non-deterministic/expensive.
- When the same behavior is covered by a real-stack Playwright test and a heavily mocked Vitest test, prefer the Playwright test with a thin non-mocked integration test and delete or drastically simplify the mocked version.
- Goal is confidence per second of runtime and maintenance cost, not maximum test count or maximum isolation.
