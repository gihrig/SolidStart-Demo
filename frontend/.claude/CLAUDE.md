# Front-end — SolidStart Demo

SolidJS + SolidStart app with TailwindCSS v4, MDX, TypeScript, and Playwright e2e
tests. Runtime: Bun. Cross-cutting rules live in the root `CLAUDE.md`; this file
holds the front-end-specific rules and loads when Claude works in `frontend/`.

---

## Skills

- Use `solidjs-solidstart-expert` skills
- Use `tailwind-design-system` when creating styles

## Code Output Rules

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

- **Back-end lives in `backend/` (same repo, ADR-0010)**: `src/lib/backend-rpc.ts` posts JSON-RPC to `http://localhost:8080/api/rpc` (`credentials: "include"` cookie auth); `src/lib/websocket.ts` connects to `ws://localhost:8080/ws`. Auth state lives in `src/components/AuthContext.tsx` (`AuthProvider`/`useAuth`). The back-end must be running for auth, conversations, and the `jedi` route to work — same back-end the e2e probe checks.
- **e2e tests require a running back-end**: `vpr test:e2e` runs `./src/lib/test-e2e.sh`, which probes `http://localhost:8080/api/rpc` (expects HTTP 401 + `NO_AUTH`). The script DOES start the front-end (`bun run dev` on port 3000) and stops it on exit.
- **`update`/`update:latest` scripts call `bun` directly**: Bypassing `vp` invoking `bun update` directly for dependency management. It's an exception to the "don't use bun directly" rule.
- **`check` script adds `--fix`**: `vpr check` runs `vp check --fix` (auto-fixes formatting/lint). Use `vp check` directly to avoid mutations.
- **`vpr lighthouse` requires Brave Browser**: The script hardcodes `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser` as `CHROME_PATH`. Will fail silently on machines without Brave installed at that path.
- **Unit-test credentials live in `frontend/.env.test`**: `backend-rpc.unit.test.ts` reads demo login creds from `import.meta.env.VITE_TEST_USERNAME` / `VITE_TEST_PASSWORD` (Vite loads `.env.test` in test mode). The file is committed (not git-ignored, unlike `.env`), so unit tests pass on CI/fresh clones with **no extra env setup**; the test throws loudly if the vars are missing. Real secrets belong in `.env.test.local` (git-ignored).

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
