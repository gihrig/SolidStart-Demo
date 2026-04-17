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

# Claude Code Skills and Plugins

- SolidJS & SolidStart Expert Development Skill
  Senior/Lead engineer-level guidance for building production-ready applications with fine-grained reactivity.
  https://skills.sh/modra40/claude-codex-skills-directory/solidjs-solidstart-expert
  References: https://github.com/mOdrA40/claude-codex-skills-directory/tree/main/frontend-skills/solidjs-solidstart-mastery-skill

- Superpowers
  Superpowers makes Claude stop, plan, and test first.
  It auto-enforces brainstorming → planning → TDD → code review on every session.
  Competitor or companion to GSD - Grok says some use both
  /plugin marketplace add obra/superpowers-marketplace
  /plugin install superpowers@superpowers-marketplace
  - See rust-web-app/planning/skills_and_plugins.md for more

# JSON-RPC Client Example with SolidStart

RPC communication services are provided by the json-client-rpc library
See [json-client-rpc](https://github.com/pkoretic/json_rpc)

## Key Points:

1. Type Safety: The RpcMethods interface maps method names to their signatures, providing full type checking
2. Centralized Client: Single client instance with configuration
3. Wrapper Functions: Optional organized API surface that's easier to discover and use
4. Error Handling: RPC calls can throw; handle with try-catch or Solid's error boundaries
5. SolidStart Integration: Use createResource for reactive data fetching

## Developing

Once you've created a project, etc. as in `Creating a project` above:

Start a development server:

```bash
vpr dev
```

## Building

Solid apps are built with _presets_, which optimize your project for deployment to different environments.

By default, `vpr build` will generate an app that you can run with `vpr start`. To use a different preset, add it to `devDependencies` in `package.json` and specify in your `app.config.js`. Search e.g. Grok for "where can I find a list of Solid JS presets"

## Testing

## Component tests

Tests for src/components/\*\* are written with `vitest`, `@solidjs/testing-library` and `@testing-library/jest-dom` to extend `expect` with some helpful custom matchers.

Run component tests with:

```sh
vpr test:comp
or
vpr test:comp:watch
```

## Unit tests

Unit tests for /lib/\*\* are run using vp test.

```sh
vpr test:unit
or
vpr test:unit:watch
```

## End to End tests

End to end tests are run with Playwright

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
- fullstack.spec.ts - FullStack page functionality
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
