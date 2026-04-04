# SolidStart

Everything you need to build a Solid project, powered by [`solid-start`](https://start.solidjs.com);

## Creating a project

```bash
# create a new project in the current directory
bun init solid@latest

# create a new project in my-app
bun init solid@latest my-app
```

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

Once you've created a project and installed dependencies with `bun install`.

Then start a development server:

```bash
bun dev
```

## Building

Solid apps are built with _presets_, which optimize your project for deployment to different environments.

By default, `bun run build` will generate an app that you can run with `bun start`. To use a different preset, add it to the `devDependencies` in `package.json` and specify in your `app.config.js`. Search e.g. Grok for "where can I find a list of Solid JS presets"

## Testing

## Component tests

Tests for src/components/\*\* are written with `vitest`, `@solidjs/testing-library` and `@testing-library/jest-dom` to extend `expect` with some helpful custom matchers.

Run component tests with:

```sh
bun test:comp
or
bun test:comp:watch
```

## Unit tests

Unit tests for /lib/\*\* are run using bun test as this is the expected deployment
environment.

Run unit tests with:

```sh
bun test:unit
or
bun test:unit:watch
```

## End to End tests

End to end tests are run with Playwright

Run end-to-end test with:

```sh
# If run with bun it will hang (runs in sub-terminal)
npm run test:e2e
then
# Open browser for detailed test results
bun test:show

# Run a single test file
bun dev
then
# In a separate terminal
bunx playwright test ./e2e/home.spec.ts
or
# Run a single test
bunx playwright test ./e2e/home.spec.ts -g 'should display main heading'
or
# Run Playwright in UI mode
bunx playwright test --ui ./e2e/home.spec.ts

# Other Playwright arguments
e.g. npm run test:e2e -- --project={ firefox | Chromium | webkit }

Specific test files: tests/todo.spec.ts
Folders: tests/e2e/
Grep/filter: --grep "@smoke" or -g "login"
Projects: --project=firefox
UI mode: --ui
Headed mode: --headed
Workers: --workers=1
Config: --config=playwright.config.ts

# Snapshot testing

# Screen shots can be used in testing. E.g. Add this code to test file:
await expect(page).toHaveScreenshot('landing.png');

# Update snapshots
npx playwright test --update-snapshots

# See https://playwright.dev/docs/test-snapshots
```

### 4 test files with full coverage:

- home.spec.ts - Home page functionality
- about.spec.ts - About page functionality
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
- Integration tests for user workflows

The test suite provides solid regression protection and documentation of expected behavior across all routes. Specific subsets cna be run with bunx playwright test e2e/home.spec.ts, etc. or use --ui mode for debugging when needed.

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
