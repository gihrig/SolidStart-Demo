❯ Solutions to previously listed issues:

- Continue session 574da5f3-6783-4b97-b650-ad1a0756bf8c
- Apply the following Fixes to `planning/jedi-conversion.md`

# Critical Issues (will cause bugs or broken UI)

## 1. Duplicate Nav rendering

### Problem:

- src/app.tsx already renders <Nav /> globally in the Router root:

### Fix:

- Reference ### 3 below

## 2. Global CSS will override Jedi styles

### Problem

- src/app.css lines 22-34 have global @apply rules that will break the Jedi page

### Fix:

- Create route specific CSS files that will inherit from and override global styles
- Place Jedi styles for the following in a `/jedi` route specific CSS file `jedi.css`
  - Hero <h1> Jedi needs
    - font-bold
    - text-white
    - Lobster font
    - font-size: 4rem
  - <main> Jedi needs left-aligned article layout
  - Card <h2> Jedi inherits from `<section>`
  - Article <p> Jedi uses utility classes `text-5xl mb-10 px-4 font1`

## 3. Missing Jedi header conversion

### Problem:

- The Jedi source index.html has a complex header (lines 37-120)
- Step 3.1 requirement #2 says "Keep the Jedi Project index.html <header> element" — but the component outline just imports the existing <Nav />

### Fix:

- Convert the **Jedi Project** <Nav /> element to a component `jedi_nav`
- Include `jedi_nav` in `jedi.jsx`
- The Jedi page should show two nav bars. One for the root route `/jedi` and a second in `jedi.jsx`

## 4. style attribute contradiction

### Problem:

- Step 3.1 requirement #4 says: "Avoid using the <style=...> element."
- But the Hero component in Step 2.1 uses style four times

### Fix:

- Convert these to Tailwind utilities (e.g., bg-[url(...)], font-(--font-lobster), bg-(--primary))

# Accuracy Errors

## 5. Hero h1 font-size is wrong

### Problem:

- Plan says text-6xl in the Hero component.
- The Jedi source style.css defines:

```CSS
h1 {
  font-size: 4rem;
}
```

### Fix:

- Corrected in ## 2 above

## 6. E2E test count is wrong

### Problem:

- Test count does not accurately reflect the actual number of tests

### Fix:

- Consider new tests created in various steps
- Update plan to reflect the correct numbers

## 7. Card dark mode not addressed

### Problem:

- The Jedi source style.css .card class sets background-color: white
- The Card component in Step 2.4 has no background color

### Fix:

- Use `--theme-background` and `--theme-foreground` from app.css

# Efficiency Improvements

## 8. Font loaded globally but used on one page

### Problem:

- Step 1.2 adds import "@fontsource/lobster" to app.tsx, loading the Lobster font on every page.

### Fix:

- Move the import to jedi.tsx

## 9. ThemeToggle placement is page-specific but effect is global

- Step 3.2.5 places <ThemeToggle /> inside the Jedi page header only.

### Fix:

- Move <ThemeToggle /> to the global <Nav /> component.

## 10. Footer e2e assertions dropped silently

### Problem:

- The plan replaces all tests without mentioning Footer tests

### Fix:

- Existing tests must be maintained
- New tests for the Jedi page must be created following established patterns

## 11. plan_steps_ignored.md lessons not fully applied

### Problem:

- The plan still has the structural issue of requirements that contradict the code (issues #3 and #4 above)

### Fix:

- The updates above should correct this issue.
- Apply the Fixes listed above
- Review the updated plan for accuracy and efficiency report any recommended improvements
