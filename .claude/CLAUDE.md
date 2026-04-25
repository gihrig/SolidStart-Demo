# SolidStart Demo

SolidJS + SolidStart app with TailwindCSS v4, MDX, TypeScript, and Playwright e2e tests. Runtime: Bun.

## Project Commands

All project-specific scripts must use `vpr <script>` (not `vp <script>`) to avoid invoking Vite+ built-ins.

### Development

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `vpr dev`        | Start dev server (port 3000)                |
| `vpr start`      | Start production server                     |
| `vpr check`      | Format, lint, and type-check with auto-fix  |
| `vpr check:type` | TypeScript type-check only (`tsc --noEmit`) |

### Testing

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `vpr test:all`        | Run all unit + component tests              |
| `vpr test:unit`       | Run `src/lib` unit tests only               |
| `vpr test:comp`       | Run `src/components` tests only             |
| `vpr test:cover`      | Run tests with V8 coverage report           |
| `vpr test:e2e`        | Run Playwright e2e tests (see gotcha below) |
| `vpr test:show`       | Open last Playwright HTML report            |
| `vpr test:all:watch`  | Watch mode for all tests                    |
| `vpr test:unit:watch` | Watch mode for unit tests                   |
| `vpr test:comp:watch` | Watch mode for component tests              |

### Other

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `vpr audit`         | Security audit                |
| `vpr lighthouse`    | Lighthouse report             |
| `vpr update`        | Update dependencies           |
| `vpr update:latest` | Update dependencies to latest |

## Architecture

```
src/
  routes/       # SolidStart file-based routes
  components/   # UI components (co-located .test.tsx)
  lib/          # Shared utilities (co-located .unit.test.ts)
  app.tsx       # Root app component
e2e/            # Playwright test specs
```

## Tech Stack

- **Framework**: SolidStart (SSR) + SolidJS/Router
- **Server**: Vinxi
- **Styles**: Tailwind CSS v4 (Vite plugin, no config file needed)
- **Linting**: vp check (with --fix) — replaces ESLint + Prettier corrects errors
- **Build**: Vinxi (Vite plus) + vite-tsconfig-paths for `~` aliases

Key config files: `app.config.ts` (SolidStart/Vinxi), `vite.config.ts`, `vitest.config.ts`, `vitest-setup.ts` (global test setup), `playwright.config.ts`.

Test location: Tests are co-located with file under test

Test naming: lib utilities use `.unit.test.ts`, components use `.test.tsx`, End to End use `.spec.ts`.

## Gotchas

- **e2e tests require a running back-end**: `vpr test:e2e` calls `./src/lib/test-e2e.sh`, Starts back-end server if needed. Checks `http://localhost:8080/api/rpc` (expects HTTP 401 with `NO_AUTH`).
- **`update`/`update:latest` scripts call `bun` directly**: Bypassing `vp` invoking `bun update` directly for dependency management. It's an exception to the "don't use bun directly" rule.
- **`check` script adds `--fix`**: `vpr check` runs `vp check --fix` (auto-fixes formatting/lint). Use `vp check` directly to avoid mutations.

<!--VITE PLUS START-->

## Vite+ Toolchain

This project uses Vite+ (`vp`). Run `vp help` for all commands.

- Use `vp install`, `vp check`, `vp test`, `vp build`, `vp lint`, `vp fmt`
- Use `vpr <script>` for any `package.json` script that conflicts with a built-in
- Never use pnpm/npm/yarn directly; never install vitest/oxlint/oxfmt directly
- Import from `vite-plus` not `vite`/`vitest`: `import { defineConfig } from 'vite-plus'`
- `vp lint --type-aware` works out of the box; no extra packages needed
- Run `vp install` after pulling remote changes; run `vp check` and `vp test` to validate changes
<!--VITE PLUS END-->

<!--BEHAVIORAL GUIDELINES-->

## Behavioral guidelines

These reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

<!--BEHAVIORAL GUIDELINES END-->
