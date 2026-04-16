# Problem: Add FullStack and Jedi to menus and tests

# Context:

- `src/routes/fullstack.tsx` and `src/routes/jedi.tsx` exist but are not listed in menus or navigation tests
- Menu listings and tests for these routes should be similar to those of `src/routes/readme.mdx`

# Task:

- Review these files in `src/components/` for patterns involving readme
  - `Footer.tsx`
  - `Footer.test.tsx`
  - `Nav.tsx`
  - `Nav.test.tsx`
- Review these files in e2e/ for patterns involving readme
  - `navigation.spec.ts`
  - `readme.spec.ts`
- Develop a list of additions menu navigation to and testing of `about`, `index`, `fullstack` and `jedi` to the same degree as readme
- Present the list of additions for approval or change
- Once approved, generate the list of changes in a step by step form allowing Claude to work through each, with check boxes to keep track of steps as they are done.
- Write the list of changes to `planning/menu_additions.md`
