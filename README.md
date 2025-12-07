# SolidStart

Everything you need to build a Solid project, powered by [`solid-start`](https://start.solidjs.com);

## Creating a project

```bash
# create a new project in the current directory
bun init solid@latest

# create a new project in my-app
bun init solid@latest my-app
```

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

Tests for src/components/** are written with `vitest`, `@solidjs/testing-library` and `@testing-library/jest-dom` to extend expect with some helpful custom matchers.

Run them with:

```sh
bun test:comp
or
bun test:watch
```

## Unit tests

Unit tests for /utilities/** are run using bun test as this is the expected deployment
environment.

Run them with:

```sh
bun test:unit
```

## End to End tests

End to end tests are run with Playwright

Run them with:

```sh
bun dev
in a new terminal
bun test:e2e
then
bun test:show
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
