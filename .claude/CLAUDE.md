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

Key config files: `app.config.ts` (SolidStart/Vinxi), `vite.config.ts`, `vitest.config.ts`, `vitest-setup.ts` (global test setup), `playwright.config.ts`.

Test naming: components use `.test.tsx`, lib utilities use `.unit.test.ts`.

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
