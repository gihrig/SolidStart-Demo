## 1. Adjust light mode page contrast.

- Compare to original planning/awesome.png

## 2. Jedi Nav links change bg on hover to match **Jedi Project**

bg Changes but dark bg is too bright

## 3. Tab navigation active links and buttons

focus ring has poor contrast for global nav
Inconsistent shape between buttons and links

## 4. Theme toggle position (right end of global nav) all screen sizes.

Smooth then jerky, stuck too far from right margin?

## 5. Use meaningful avatars

- "https://img.icons8.com/doodle/96/null/bart-simpson.png"
- "https://img.icons8.com/doodle/96/null/lisa-simpson.png"
- "https://img.icons8.com/doodle/96/null/homer-simpson.png"

## 6. Add image dimensions

`<img>` elements in Image, Author, JediNav, Jedi and sidebar lists lack explicit width/height. Browsers can't reserve space before images load → cumulative layout shift.

## 7. Screen-reader basic navigation works?

See Brave browser Dev tools (inspect) > Lighthouse

## 8. Like button `aria-pressed` dynamic signal

Action dialog not working

## 9. Update About and Readme pages

- About to describe tech stack, tooling, workflow, inspiration sources attribution, etc.
- Readme should import existing front-end and back-end README.md docs

## 10. Update workflow

- Organize `planning`
- Update Claude.md
- Enable Github Issues
- Graphify

**setup-matt-pocock-skills**

- grill-with-docs
  - Give the LLM the What and the Why
  - Work out full details - what is to be done
- to-prd
- to-issues
- tdd
- improve-codebase-architecture
- triage, hand-off

## 11. Convert .png icons to svg image sprite

Black icons are invisible in dark mode

- Consider icons for dark/light mode
- Detail `planning/plan_steps_ignored.md`
- HIGH — Icons invisible in dark mode @line 4072
- Temp - Change icon color to 777777

- Create a comparable svg icon sprite

- `components/JediNav.tsx`
  - "https://img.icons8.com/small/64/ffffff/fire-heart.png"
  - "https://img.icons8.com/small/64/ffffff/delete-sign.png"
  - "https://img.icons8.com/small/64/ffffff/menu.png"
  - "https://img.icons8.com/small/32/777777/expand-arrow.png"
- `src/routes/jedi.tsx`
  - "https://img.icons8.com/small/96/null/landscape.png"
  - "https://img.icons8.com/small/96/null/portrait.png"
  - "https://img.icons8.com/small/96/null/dog.png"
  - "https://img.icons8.com/small/96/null/collage.png"
  - "https://img.icons8.com/small/96/null/180-degrees.png"
  - "https://img.icons8.com/small/24/777777/fire-heart.png"

- Update instances of icon usage `https://img.icons8
- .com...` with sprite access:
  ```
  <svg width="24" height="24" aria-hidden="true">
    <use href="/icons.svg#icon-home"></use>
  </svg>
  ```

## 12. Card class concatenation has no conflict resolution

- Detail `planning/plan_steps_ignored.md` @line 4097

## 13. Standardize data structures

- Refactor Jedi component data into external json file for Posts, Categories, Top Photos and Top Captions
  - Include comments (#) and likes (#) in data
  - Replace all hard coded data with external data
  - Consider data will be pulled from DB, but use external data fore development w/o backend
- Sanitize all external urls

## 14. Extract profile dropdown into a reusable `useMenu` hook (deferred)

- Full executable plan: `planning/useMenu-plan.md`
- From the 30th-cycle design discussion in `planning/plan_steps_ignored.md` (Issue 2 follow-up)
- **Deferred (YAGNI)**: a single two-item menu doesn't justify the abstraction. Build when a **second** menu appears, or when full menu semantics are wanted for consistency with `useListbox`.
- Resolves 30th-cycle review Issues 1 (`aria-controls` with no matching panel `id`) and 2 (`aria-haspopup="true"` without `role="menu"`) by making the panel a real WAI-ARIA menu.
- New: `src/lib/useMenu.ts` + `src/lib/useMenu.unit.test.ts`. Modify: `src/components/JediNav.tsx` + `JediNav.test.tsx`.
- Mirrors `useListbox` (aria-activedescendant, prop-getter style) and composes `useDismiss` for click-away.
- Until then, the cheap alternative is the disclosure fix: add the panel `id`, drop `aria-haspopup`.

## 15. Back-end to provide site content

Use previously created data source file as domain model

## 16. Update back-end in full support of front-end data

- Front-end content served from db
- Support Postgresql or SQLite
- Create admin panel in front-end to manage content

## 17. Merge front-end/back-end projects into a mono-repo

Use grill-with-docs to establish plan and implementation
Include better DX in starting dev/build project

## 18. Review update code quality, security, SEO, Accessibility

Tools: See iCrumz 'Code Quality` & 'Security'

- Snyk
- Codoki
- Codacy
- Code Rabbit
- Search 'code security vulnerability checker'

## 18. Develop deployment pattern

Research

- Boxer
- Void 0
- GitHub action build

Deploy to https://demo.arkadias.net

## 19. Check on mobile browsers

- Mobile Safari and mobile Chrome/brave/firefox
- Layout
- Lobster font rendering
- Animation smoothness
- touch controls
- image loading
- theme toggle
