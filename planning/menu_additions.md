# Menu Additions Plan: FullStack & Jedi Routes

Add `/fullstack` and `/jedi` to Nav and Footer menus, then bring all related tests
up to the same coverage level as the existing `readme` route.

## Gap Analysis

| Route        | Nav entry | Footer entry | Page spec                     | Navigation tests updated |
| ------------ | --------- | ------------ | ----------------------------- | ------------------------ |
| `/`          | ✓         | ✓            | `home.spec.ts` ✓              | needs update             |
| `/about`     | ✓         | ✓            | `about.spec.ts` ✓             | needs update             |
| `/readme`    | ✓         | ✓            | `readme.spec.ts` ✓            | needs update             |
| `/fullstack` | ✗ missing | ✗ missing    | `fullstack.spec.ts` (partial) | needs update             |
| `/jedi`      | ✗ missing | ✗ missing    | ✗ missing                     | needs creation           |

---

## Step-by-Step Changes

### Step 1 — `src/components/Nav.tsx`

- [x] Add `<li>` entry: `FullStack` → `/fullstack` (after the Readme entry)
- [x] Add `<li>` entry: `Jedi` → `/jedi` (after the FullStack entry)

### Step 2 — `src/components/Footer.tsx`

- [x] Add `<A>` entry: `FullStack` → `/fullstack` (after the ReadMe entry)
- [x] Add `<A>` entry: `Jedi` → `/jedi` (after the FullStack entry)

### Step 3 — `src/components/Nav.test.tsx`

- [x] Update `it("renders navigation…")` description to include FullStack and Jedi
- [x] Add `fullstackLink` and `jediLink` queries + `toHaveAttribute` assertions to the render test
- [x] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for Home" test
- [x] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for About" test
- [x] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for Readme" test
- [x] Add new test: `"applies active styling to FullStack link when on /fullstack path"`
- [x] Add new test: `"applies active styling to Jedi link when on /jedi path"`
- [x] Add `fullstackLink` and `jediLink` assertions (inactive) to "renders all links as inactive on unknown path" test

### Step 4 — `src/components/Footer.test.tsx`

- [x] Update `it("renders navigation…")` description to include FullStack and Jedi
- [x] Add `fullstackLink` and `jediLink` queries + `toHaveAttribute` assertions to the render test
- [x] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for Home" test
- [x] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for About" test
- [x] Fix bug: "renders all links as inactive on unknown path" queries `readmeLink` by name `"About"` — change to `"ReadMe"`
- [x] Add `fullstackLink` and `jediLink` assertions (inactive) to "renders all links as inactive" test
- [x] Add new test: `"applies active styling to ReadMe link when on /readme path"` (currently missing)
- [x] Add new test: `"applies active styling to FullStack link when on /fullstack path"`
- [x] Add new test: `"applies active styling to Jedi link when on /jedi path"`

### Step 5 — `e2e/navigation.spec.ts`

- [x] **Test 1** (nav bar structure): add `fullstackLink` / `jediLink` visibility + href assertions
- [x] **Test 2** (nav bar link navigation): add navigation steps to `/fullstack` and `/jedi` with heading assertions
- [x] **Test 3** (nav bar persistence): add `page.goto("/fullstack")` and `page.goto("/jedi")` checks
- [x] **Test 4** (active state — direct URL): add initial inactive assertions + active assertions for `/fullstack` and `/jedi`
- [x] **Test 5** (active state — nav click): add click-and-verify steps for fullstack and jedi links
- [x] **Test 6** (direct URL access): add `page.goto("/fullstack")` and `page.goto("/jedi")` heading assertions
- [x] **Test 8** (footer persistence): add `page.goto("/fullstack")` and `page.goto("/jedi")` checks
- [x] **Test 9** (footer navigation): add footer navigation steps to `/fullstack` and `/jedi`
- [x] **Test 10** (footer link state): add `fullstackLink` / `jediLink` assertions for each page visited
- [x] **Test 11** (page title): add title assertions — `/Full-Stack Demo/` for fullstack, `/Jedi Kitty/` for jedi

### Step 6 — `e2e/fullstack.spec.ts`

Add footer tests to match the `about.spec.ts` / `readme.spec.ts` pattern:

- [x] Add test: footer solidjs.com link is visible, has correct `href` and `target="_blank"`
- [x] Add test: footer Home link exists with `href="/"`
- [x] Add test: clicking footer Home link navigates to `/` with correct heading
- [x] Add test: FullStack footer link has active styling (`border-sky-600`) on `/fullstack`
- [x] Add test: page structure — `main` and `footer` both visible

### Step 7 — `e2e/jedi.spec.ts` (new file)

Create following the `readme.spec.ts` / `about.spec.ts` pattern:

- [x] Test: loads successfully, title matches `/SolidStart Jedi Kitty/`, URL is `/jedi`
- [x] Test: h1 heading is visible with text `"Jedi Kitty"`
- [x] Test: exactly 2 `<h2>` headings present
- [x] Test: footer solidjs.com link is visible, correct `href` and `target="_blank"`
- [x] Test: footer Home link exists with `href="/"`
- [x] Test: clicking footer Home link navigates to `/` with correct heading
- [x] Test: Jedi footer link has active styling (`border-sky-600`) on `/jedi`
- [x] Test: page structure — `main` and `footer` both visible, `main` contains `h1`, footer has 2 `<p>` elements

---

## Notes

- Nav display names: `"FullStack"` (path `/fullstack`) and `"Jedi"` (path `/jedi`)
- Footer display names: `"FullStack"` and `"Jedi"` (matching Nav for consistency)
- FullStack page title for test matching: `/Full-Stack Demo/`
- Jedi page title for test matching: `/Jedi Kitty/` (from `<Title>SolidStart Jedi Kitty</Title>`)
- Nav uses `border-b-4` active class; Footer uses `border-b-2` active class
- Active color for both: `border-sky-600`; inactive: `border-transparent`
