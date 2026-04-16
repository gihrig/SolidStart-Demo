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

- [ ] Add `<li>` entry: `FullStack` → `/fullstack` (after the Readme entry)
- [ ] Add `<li>` entry: `Jedi` → `/jedi` (after the FullStack entry)

### Step 2 — `src/components/Footer.tsx`

- [ ] Add `<A>` entry: `FullStack` → `/fullstack` (after the ReadMe entry)
- [ ] Add `<A>` entry: `Jedi` → `/jedi` (after the FullStack entry)

### Step 3 — `src/components/Nav.test.tsx`

- [ ] Update `it("renders navigation…")` description to include FullStack and Jedi
- [ ] Add `fullstackLink` and `jediLink` queries + `toHaveAttribute` assertions to the render test
- [ ] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for Home" test
- [ ] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for About" test
- [ ] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for Readme" test
- [ ] Add new test: `"applies active styling to FullStack link when on /fullstack path"`
- [ ] Add new test: `"applies active styling to Jedi link when on /jedi path"`
- [ ] Add `fullstackLink` and `jediLink` assertions (inactive) to "renders all links as inactive on unknown path" test

### Step 4 — `src/components/Footer.test.tsx`

- [ ] Update `it("renders navigation…")` description to include FullStack and Jedi
- [ ] Add `fullstackLink` and `jediLink` queries + `toHaveAttribute` assertions to the render test
- [ ] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for Home" test
- [ ] Add `fullstackLink` and `jediLink` assertions (inactive) to "active styling for About" test
- [ ] Fix bug: "renders all links as inactive on unknown path" queries `readmeLink` by name `"About"` — change to `"ReadMe"`
- [ ] Add `fullstackLink` and `jediLink` assertions (inactive) to "renders all links as inactive" test
- [ ] Add new test: `"applies active styling to ReadMe link when on /readme path"` (currently missing)
- [ ] Add new test: `"applies active styling to FullStack link when on /fullstack path"`
- [ ] Add new test: `"applies active styling to Jedi link when on /jedi path"`

### Step 5 — `e2e/navigation.spec.ts`

- [ ] **Test 1** (nav bar structure): add `fullstackLink` / `jediLink` visibility + href assertions
- [ ] **Test 2** (nav bar link navigation): add navigation steps to `/fullstack` and `/jedi` with heading assertions
- [ ] **Test 3** (nav bar persistence): add `page.goto("/fullstack")` and `page.goto("/jedi")` checks
- [ ] **Test 4** (active state — direct URL): add initial inactive assertions + active assertions for `/fullstack` and `/jedi`
- [ ] **Test 5** (active state — nav click): add click-and-verify steps for fullstack and jedi links
- [ ] **Test 6** (direct URL access): add `page.goto("/fullstack")` and `page.goto("/jedi")` heading assertions
- [ ] **Test 8** (footer persistence): add `page.goto("/fullstack")` and `page.goto("/jedi")` checks
- [ ] **Test 9** (footer navigation): add footer navigation steps to `/fullstack` and `/jedi`
- [ ] **Test 10** (footer link state): add `fullstackLink` / `jediLink` assertions for each page visited
- [ ] **Test 11** (page title): add title assertions — `/Full-Stack Demo/` for fullstack, `/Jedi Kitty/` for jedi

### Step 6 — `e2e/fullstack.spec.ts`

Add footer tests to match the `about.spec.ts` / `readme.spec.ts` pattern:

- [ ] Add test: footer solidjs.com link is visible, has correct `href` and `target="_blank"`
- [ ] Add test: footer Home link exists with `href="/"`
- [ ] Add test: clicking footer Home link navigates to `/` with correct heading
- [ ] Add test: FullStack footer link has active styling (`border-sky-600`) on `/fullstack`
- [ ] Add test: page structure — `main` and `footer` both visible

### Step 7 — `e2e/jedi.spec.ts` (new file)

Create following the `readme.spec.ts` / `about.spec.ts` pattern:

- [ ] Test: loads successfully, title matches `/SolidStart Jedi Kitty/`, URL is `/jedi`
- [ ] Test: h1 heading is visible with text `"Jedi Kitty"`
- [ ] Test: exactly 2 `<h2>` headings present
- [ ] Test: footer solidjs.com link is visible, correct `href` and `target="_blank"`
- [ ] Test: footer Home link exists with `href="/"`
- [ ] Test: clicking footer Home link navigates to `/` with correct heading
- [ ] Test: Jedi footer link has active styling (`border-sky-600`) on `/jedi`
- [ ] Test: page structure — `main` and `footer` both visible, `main` contains `h1`, footer has 2 `<p>` elements

---

## Notes

- Nav display names: `"FullStack"` (path `/fullstack`) and `"Jedi"` (path `/jedi`)
- Footer display names: `"FullStack"` and `"Jedi"` (matching Nav for consistency)
- FullStack page title for test matching: `/Full-Stack Demo/`
- Jedi page title for test matching: `/Jedi Kitty/` (from `<Title>SolidStart Jedi Kitty</Title>`)
- Nav uses `border-b-4` active class; Footer uses `border-b-2` active class
- Active color for both: `border-sky-600`; inactive: `border-transparent`
