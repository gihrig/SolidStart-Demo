# SolidStart Demo

SolidJS + SolidStart app with TailwindCSS v4, MDX, TypeScript, and Playwright e2e tests. Runtime: Bun.

**Target Project** `/Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo/`

---

## Execution Notes (for Claude AI)

Read this section before starting any phase.

When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision.

### Workflow

- Use `karpathy-guidelines` skills
- Use `superpowers` (systematic-debugging, TDD, verification-before-completion)
- Use `solidjs-solidstart-expert` skills
- Use `tailwind-design-system` when creating styles
- Use `concise` to communicate
- Phases labeled **(Claude)** are executed by Claude AI.
- Skip completed phases: `[√] Phase...`.
- Execute first incomplete phase: `[ ] Phase...`.
- The **final phase is labeled (User)** this is manual validation after all Claude phases are complete.
- Within each Claude phase:
  1. Execute each step in order.
  2. Run the step's verification (tests/checks) — **tests/checks must pass before the step is complete**.

### Code Output Rules

- Output complete code for each file (no truncation).
- If tests fail, analyze the root cause and fix before proceeding (no skipping).
- Static data arrays belong **outside** the component function.
- Signal naming follows `[value, setValue]`.
- Props interfaces named `<Component>Props`.
- Component names PascalCase.
- Imports ordered: external → internal → components.
- Style dark/light mode using theme variables.
- Do not use Tailwind `dark` class.
- Use Tailwind custom property syntax: `text-(--css-variable)`.
- Do not use Tailwind arbitrary value syntax: `text-[var(--css-variable)]`.

---

## Project Commands

All project-specific scripts must use `vpr <script>` (not `vp <script>`) to avoid invoking Vite+ built-ins.

### Development

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `vpr dev`        | Start dev server (port 3000)                |
| `vpr build`      | Production build                            |
| `vpr start`      | Start production server                     |
| `vpr check`      | Format, lint, and type-check with auto-fix  |
| `vpr check:type` | TypeScript type-check only (`tsc --noEmit`) |

### Testing

| Command                    | Description                                 |
| -------------------------- | ------------------------------------------- |
| `vpr test:all`             | Run all unit + component tests              |
| `vpr test:unit`            | Run `src/lib` unit tests only               |
| `vpr test:unit -t "regex"` | Run `src/lib` unit tests matching regex     |
| `vpr test:comp`            | Run `src/components` tests only             |
| `vpr test:comp -t "regex"` | Run `src/components` tests matching regex   |
| `vpr test:cover`           | Run tests with V8 coverage report           |
| `vpr test:e2e`             | Run Playwright e2e tests (see gotcha below) |
| `vpr test:show`            | Open last Playwright HTML report            |
| `vpr test:all:watch`       | Watch mode for all tests                    |
| `vpr test:unit:watch`      | Watch mode for unit tests                   |
| `vpr test:comp:watch`      | Watch mode for component tests              |

### Other

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `vpr audit`         | Security audit                |
| `vpr lighthouse`    | Lighthouse report             |
| `vpr update`        | Update dependencies           |
| `vpr update:latest` | Update dependencies to latest |
| `vp i <pkg>`        | Install a package via Vite+   |

## Tech Stack

- **Framework**: SolidStart (SSR) + SolidJS/Router
- **Server**: Vinxi
- **Styles**: Tailwind CSS v4 (Vite plugin, no config file needed)
- **Linting**: vp check (with --fix) — replaces ESLint + Prettier corrects errors
- **Build**: Vinxi (Vite plus) + vite-tsconfig-paths for `~` aliases
- **MDX**: `@vinxi/plugin-mdx` configured in `app.config.ts`; example route at `src/routes/readme.mdx`

Key config files: `app.config.ts` (SolidStart/Vinxi), `vite.config.ts`, `vitest.config.ts`, `vitest-setup.ts` (global test setup), `playwright.config.ts`.

Test location: Tests are co-located with file under test

Test naming: lib utilities use `.unit.test.ts`, components use `.test.tsx`, End to End use `.spec.ts`.

## Gotchas

- **App depends on an external backend at `:8080` (NOT in this repo)**: `src/lib/backend-rpc.ts` posts JSON-RPC to `http://localhost:8080/api/rpc` (`credentials: "include"` cookie auth); `src/lib/websocket.ts` connects to `ws://localhost:8080/ws`. Auth state lives in `src/components/AuthContext.tsx` (`AuthProvider`/`useAuth`). The backend must be running for auth, conversations, and the `jedi` route to work — same backend the e2e probe checks.
- **e2e tests require a running back-end (NOT auto-started)**: `vpr test:e2e` runs `./src/lib/test-e2e.sh`, which probes `http://localhost:8080/api/rpc` (expects HTTP 401 + `NO_AUTH`) and **exits with FAIL if the back-end is not already up**. The script DOES start the front-end (`bun run dev` on port 3000) and stops it on exit.
- **`update`/`update:latest` scripts call `bun` directly**: Bypassing `vp` invoking `bun update` directly for dependency management. It's an exception to the "don't use bun directly" rule.
- **`check` script adds `--fix`**: `vpr check` runs `vp check --fix` (auto-fixes formatting/lint). Use `vp check` directly to avoid mutations.
- **`vpr lighthouse` requires Brave Browser**: The script hardcodes `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser` as `CHROME_PATH`. Will fail silently on machines without Brave installed at that path.

<!--VITE PLUS START-->

## Vite+ Toolchain

This project uses Vite+ (`vp`). Run `vp help` for all commands.

- Use `vp install`, `vp check`, `vp test`, `vp build`, `vp lint`, `vp fmt`
- Use `vpr <script>` for any `package.json` script that conflicts with a built-in
- Use `vpx <bin>` to invoke a tool binary directly through Vite+ (e.g. `vpx tsc --noEmit`, `vpx playwright test`) — used inside `package.json` and `src/lib/test-e2e.sh`
- Never use pnpm/npm/yarn directly; never install vitest/oxlint/oxfmt directly
- Import from `vite-plus` not `vite`/`vitest`: `import { defineConfig } from 'vite-plus'`
- `vp lint --type-aware` works out of the box; no extra packages needed
- Run `vp install` after pulling remote changes; run `vp check` and `vp test` to validate changes

<!--VITE PLUS END-->

---

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `gihrig/SolidStart-Demo`, managed via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to a like-named GitHub label. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
