# SolidStart

Everything you need to build a Solid project, powered by [`solid-start`](https://start.solidjs.com);

## Creating a project

```bash

# create a new project in my-app
vp create solid@latest my-app

cd my-app

git init && git add . && git commit -m "initial(project): vp create test"

vp i

vpx vinxi dev

# At this point app will start but can not be served
# Copy this project's custom configuration
```

## Runtime versions

This project needs both Node.js and bun:

- **Node.js** — the version in [`.node-version`](.node-version) (`24.21.0`). The `vp` CLI runs on Node, and so does `bun install` (its `prepare` script runs `vp config`). vite-plus 1.0 needs Node `^22.18.0 || ^24.11.0 || >=26.0.0`. The `vp staged` pre-commit hook needs `^22.22.1 || ^24.11.0 || >=26.0.0`. If you use the Vite+ Node manager, it reads `.node-version` and installs that version for you. fnm also reads `.node-version`. nvm does not: it reads only `.nvmrc`, so run `nvm install 24.21.0 && nvm use 24.21.0` yourself. mise reads `.node-version` only after you run `mise settings add idiomatic_version_file_enable_tools node`. CI reads the same file.
- **bun** — `1.4.2`, the version in `package.json` `packageManager`. bun 1.4 writes `bun.lock` in a format that bun 1.3 cannot read.

# Claude Code Skills and Plugins

- SolidJS & SolidStart Expert Development Skill
  Senior/Lead engineer-level guidance for building production-ready applications with fine-grained reactivity.
  Project-owned copy at `.claude/skills/solidjs-solidstart-expert/` (locally edited; no longer tracked by `skills-lock.json` — do not re-install).
  Originally from https://skills.sh/modra40/claude-codex-skills-directory/solidjs-solidstart-expert
  References: https://github.com/mOdrA40/claude-codex-skills-directory/tree/main/frontend-skills/solidjs-solidstart-mastery-skill

- TanStack for SolidJS Skill
  TanStack Query, Table, Form, and Virtual examples, split out of `solidjs-solidstart-expert`.
  Project-owned at `.claude/skills/tanstack-solid/`. Not in use yet; verify examples against current TanStack docs before adoption.

# JSON-RPC Client Example with SolidStart

RPC communication services are provided by the json-client-rpc library
See [json-client-rpc](https://github.com/pkoretic/json_rpc)

## Key Points:

1. Type Safety: The RpcMethods interface maps method names to their signatures, providing full type checking
2. Centralized Client: Single client instance with configuration
3. Wrapper Functions: Optional organized API surface that's easier to discover and use
4. Error Handling: RPC calls can throw; handle with try-catch or Solid's error boundaries
5. SolidStart Integration: Use createResource for reactive data fetching

## Security scanning

The root [`README.md`](../README.md#security-scanning) documents the full
security posture: the SBOM, every scan, its `cgs` command, and the four
run-surfaces (local, pre-push, PR, daily schedule). The front-end dependencies
appear in the shared SBOM (`/sbom.cdx.json`) that `cgs scan` gates.

## Developing

Once you've created a project, etc. as in `Creating a project` above:

Start a development server:

```bash
vpr dev
```

### Developing without the back-end

The app reads all its data from the back-end. Every `jediApi` call in
`src/lib/jedi/jedi-api.ts` is a back-end RPC. There is no mock switch yet;
[#209](https://github.com/gihrig/SolidStart-Demo/issues/209) tracks a read-only
one (`VITE_JEDI_MOCK`).

The mock data still exists. `src/lib/jedi/data.json` mirrors the dev seed
(`backend/sql/dev_initial/02-dev-seed.sql`), and the unit tests use it as a
fixture. To read from it now, inject a stand-in through the existing seams:

1. Write an object that satisfies the `JediApi` type and serves its reads from
   `data.json`. The type-checker shows any call it misses. The last read-only
   mock is a starting point: `git show 16462c9^:frontend/src/lib/jedi/jedi-api.ts`.
   `data.json` has no comment counts, no Caption Comments, and its Comments
   have `body`, not `contentHtml`, and no times, so the stand-in must fill these.
2. Pass it to the view-model in `src/routes/index.tsx`:
   `createJediFeed({ api: mockJediApi, guard: useDraftGuard() })`.
3. `CreatePostDialog` and `AddCaptionForm` do not use the view-model's `api`.
   Each takes its own `api` prop: `CreatePostDialog` reads the Categories and
   creates a Post through it, and `AddCaptionForm` adds a Caption.

Some parts still need the back-end:

- Login and logoff: `AuthContext` calls `backendRpc.auth` directly, and loads
  the profile through the `jediApi` singleton, not the injected stand-in.
- The live feed: it connects to `ws://localhost:8080/ws`.
- Likes and Comment writes, unless the stand-in implements them.

## Building

Solid apps are built with _presets_, which optimize your project for deployment to different environments.

By default, `vpr build` will generate an app that you can run with `vpr start`. To use a different preset, add it to `devDependencies` in `package.json` and specify in your `app.config.js`. Search e.g. Grok for "where can I find a list of Solid JS presets"

## Testing

## Unit tests

Unit tests for /lib/\*\* are run using vp test.

```sh
vpr test:unit
or
vpr test:unit:watch
```

Run a single unit test with:

```
vpr test:unit -t "rpc" // Run backend-rpc.unit.test.ts
```

## Component tests

Tests for src/components/\*\* are written with `vitest`, `@solidjs/testing-library` and `@testing-library/jest-dom` to extend `expect` with some helpful custom matchers.

Run component tests with:

```sh
vpr test:comp
or
vpr test:comp:watch
```

Run a single component test with:

```sh
vpr test:comp -t "Nav" // Run Nav.test.tsx
```

## End to End tests

End to end tests are run with Playwright

`vpr test:e2e` boots **both** servers — the back-end (release) and the front-end —
runs Playwright, then stops the ones it started. **Postgres must already be
running** (`cgs db` from `backend/`). If anything already listens on `:8080`,
the script exits with an error and leaves it running: stop it first. Each run
starts its own back-end, which rebuilds the DB from the seed. Back-end logs
default to `warn` (quiet); raise them for a run with
`E2E_RUST_LOG=debug vpr test:e2e`. Back-end build/stderr goes to
`reports/e2e-backend.stderr.log`.

Run end-to-end test with:

```sh
vpr test:e2e
then
# Open browser for detailed test results
vpr test:show

# Run a single test file
vpr test:e2e ./e2e/home.spec.ts

# Run a single test
vpr test:e2e ./e2e/home.spec.ts -g 'should display main heading'

# Run Playwright in UI mode
vpr test:e2e --ui ./e2e/home.spec.ts

# Other Playwright arguments
e.g. vpr test:e2e --project={ firefox | Chromium | webkit }

Specific test files: ./e2e/home.spec.ts
Folders: tests/e2e/
Grep/filter: --grep "@smoke" or -g "login"
Projects: --project=firefox
UI mode: --ui
Headed mode: --headed
Workers: --workers=1
Config: --config=playwright.config.ts

# Snapshot testing

# Screen shots can be used in testing. E.g. Add this code to test file:
await expect(page).toHaveScreenshot('home.png');

# Update snapshots
vpr test:e2e --update-snapshots

# See https://playwright.dev/docs/test-snapshots
```

### e2e test files with full coverage:

- home.spec.ts - Home page functionality
- about.spec.ts - About page functionality
- readme.spec.ts - Readme page functionality
- jedi.spec.ts - Jedi page functionality
- not-found.spec.ts - 404 handling
- navigation.spec.ts - Cross-page navigation flows

### Test coverage includes:

- Page loading and title verification
- Content rendering and visibility
- Link functionality (internal and external)
- Navigation flows and browser history
- Page state management
- URL validation
- 404 error handling
- Cross-browser compatibility

### Key patterns used:

- Scoped locators (page.locator('main')) to avoid duplicate element issues
- Descriptive test names with test.describe() blocks
- Multiple assertion types for thorough validation
- Integration (e2e) tests for user workflows

The test suite provides solid regression protection and documentation of expected behavior across all routes. Specific subsets can be run with vpr test:e2e e2e/home.spec.ts, etc. or use --ui mode for debugging when needed.

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
