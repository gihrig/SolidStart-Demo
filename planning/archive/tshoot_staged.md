# Goal

Resolve failing `vp staged` command and propose solution allowing git commit to succeed

# Context

- `vp check --fix` run from a terminal shows all files pass lint:

```
▷ vp check --fix
VITE+ - The Unified Toolchain for the Web

pass: All 82 files are correctly formatted (380ms, 10 threads)
pass: Found no warnings, lint errors, or type errors in 56 files (269ms, 10 threads)
```

- `vp staged` command fails:

```
✖ vp check --fix:
error: Lint or type issues found
× typescript(TS2591): Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
    ╭─[playwright.config.ts:19:17]
 18 │   /* Fail the build on CI if you accidentally left test.only in the source code. */
 19 │   forbidOnly: !!process.env.CI,
    ·                 ───────
 20 │   /* Retry on CI only */
    ╰────
```

- `vp staged` passed on the previous commit.

# Task

Determine the root cause for `vp staged` failure. Is installing `@types/node` the correct solution? Why has this issue not come up before now?

⏺ The root cause is clear. Here's the diagnosis:

Root cause: playwright.config.ts sits at the project root, but tsconfig.json only includes src/\*_/_. When vp staged does type-aware lint on this file, TypeScript processes it as a standalone file outside the project scope — so it doesn't inherit the
types array (including @types/bun which provides process). The full vp check --fix passes because it runs with the full project context, not file-scoped.

Why it passed before: playwright.config.ts wasn't staged in prior commits, so vp staged never checked it. Now that it's staged (reporter config change), it's checked for the first time.

Why @types/node is the wrong fix: @types/bun is intentionally used instead of @types/node — they conflict. Installing @types/node adds a redundant package and risks type conflicts.

Correct fix: Add playwright.config.ts and e2e/\*_/_ to tsconfig.json's include:

"include": ["src/**/*", "src/types/**/*", "playwright.config.ts", "e2e/**/*"]

This brings them into project scope so they get the full tsconfig context (including @types/bun, strict, etc.) during both full checks and staged-file checks. It also ensures e2e test files get proper type coverage.
