# SolidStart Demo

SolidJS + SolidStart app with TailwindCSS v4, MDX, TypeScript, and Playwright e2e tests. Runtime: Bun.

## Project Commands

All project-specific scripts must use `vp run <script>` (not `vp <script>`) to avoid invoking Vite+ built-ins.

### Development

| Command             | Description                                 |
| ------------------- | ------------------------------------------- |
| `vp run dev`        | Start dev server (port 3000)                |
| `vp run start`      | Start production server                     |
| `vp run check`      | Format, lint, and type-check with auto-fix  |
| `vp run check:type` | TypeScript type-check only (`tsc --noEmit`) |

### Testing

| Command                  | Description                                 |
| ------------------------ | ------------------------------------------- |
| `vp run test:all`        | Run all unit + component tests              |
| `vp run test:unit`       | Run `src/lib` unit tests only               |
| `vp run test:comp`       | Run `src/components` tests only             |
| `vp run test:cover`      | Run tests with V8 coverage report           |
| `vp run test:e2e`        | Run Playwright e2e tests (see gotcha below) |
| `vp run test:show`       | Open last Playwright HTML report            |
| `vp run test:all:watch`  | Watch mode for all tests                    |
| `vp run test:unit:watch` | Watch mode for unit tests                   |
| `vp run test:comp:watch` | Watch mode for component tests              |

### Other

| Command                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| `vp run audit`         | Security audit                                                   |
| `vp run lighthouse`    | Lighthouse report (requires dev server on port 3000, uses Brave) |
| `vp run update`        | Update dependencies                                              |
| `vp run update:latest` | Update dependencies to latest versions                           |

## Architecture

```
src/
  routes/       # SolidStart file-based routes
  components/   # UI components (each has co-located .test.tsx)
  lib/          # Shared utilities (each has co-located .unit.test.ts)
  app.tsx       # Root app component
e2e/            # Playwright test specs
```

Key config files: `app.config.ts` (SolidStart/Vinxi), `vite.config.ts`, `vitest.config.ts`, `vitest-setup.ts` (global test setup), `playwright.config.ts`.

Test naming: components use `.test.tsx`, lib utilities use `.unit.test.ts`.

## Gotchas

- **e2e tests require a running back-end**: `vp run test:e2e` calls `./src/lib/test-e2e.sh`, which first checks that a back-end server is running on `http://localhost:8080/api/rpc` (expects HTTP 401 with `NO_AUTH`). Start the back-end before running e2e tests.
- **`update`/`update:latest` scripts call `bun` directly**: These scripts bypass `vp` and invoke `bun update` directly. This is intentional for dependency management but is an exception to the "don't use bun directly" rule.
- **`check` script adds `--fix`**: `vp run check` runs `vp check --fix` (auto-fixes formatting/lint). Use `vp check` directly if you want check-only without mutations.

<!--VITE PLUS START-->

## Vite+ Toolchain

This project uses Vite+ (`vp`). Run `vp help` for all commands.

- Use `vp install`, `vp check`, `vp test`, `vp build`, `vp lint`, `vp fmt`
- Use `vp run <script>` for any `package.json` script that conflicts with a built-in
- Never use pnpm/npm/yarn directly; never install vitest/oxlint/oxfmt directly
- Import from `vite-plus` not `vite`/`vitest`: `import { defineConfig } from 'vite-plus'`
- `vp lint --type-aware` works out of the box; no extra packages needed
- Run `vp install` after pulling remote changes; run `vp check` and `vp test` to validate changes
<!--VITE PLUS END-->
