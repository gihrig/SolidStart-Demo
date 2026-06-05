## 0. Adjust light mode page contrast.

- Compare to original planning/awesome.png

## 1. Jedi Nav links change bg on hover to match **Jedi Project**

bg Changes but dark bg is too bright

## 2. Tab navigation reaches active links and buttons

focus ring has poor contrast and inconsistent shape

## 3. Theme toggle position (right end of global nav) all screen sizes.

Smooth then jerky, stuck too far from right margin?

## 4. Use meaningful avatars

- "https://img.icons8.com/doodle/96/null/bart-simpson.png"
- "https://img.icons8.com/doodle/96/null/lisa-simpson.png"
- "https://img.icons8.com/doodle/96/null/homer-simpson.png"

## 5. Add image dimensions

`<img>` elements in Image, Author, JediNav, Jedi and sidebar lists lack explicit width/height. Browsers can't reserve space before images load → cumulative layout shift.

## 6. Screen-reader basic navigation works?

See Brave browser Dev tools (inspect) > Lighthouse

## 7. Like button `aria-pressed` dynamic signal

Action dialog not working

## 8. Check on mobile browsers

- Mobile Safari and mobile Chrome/brave/firefox
- Layout
- Lobster font rendering
- Animation smoothness
- touch controls
- image loading
- theme toggle

## 9. Convert .png icons to svg image sprite

"### HIGH — Icons invisible in dark mode"

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

## 10. Card class concatenation has no conflict resolution

- Detail `planning/plan_steps_ignored.md` @line 4097

## 11. Standardize data structures

- Refactor Jedi component data into external blocks for Posts, Categories, Top Photos and Top Captions
  - Include comments (#) and likes (#) in data blocks
  - Replace all hard coded data with variables from external data blocks
  - Consider data will be pulled from DB
- Sanitize all external urls

## 12. Extract profile dropdown into a reusable `useMenu` hook (deferred)

- Full executable plan: `planning/useMenu-plan.md`
- From the 30th-cycle design discussion in `planning/plan_steps_ignored.md` (Issue 2 follow-up)
- **Deferred (YAGNI)**: a single two-item menu doesn't justify the abstraction. Build when a **second** menu appears, or when full menu semantics are wanted for consistency with `useListbox`.
- Resolves 30th-cycle review Issues 1 (`aria-controls` with no matching panel `id`) and 2 (`aria-haspopup="true"` without `role="menu"`) by making the panel a real WAI-ARIA menu.
- New: `src/lib/useMenu.ts` + `src/lib/useMenu.unit.test.ts`. Modify: `src/components/JediNav.tsx` + `JediNav.test.tsx`.
- Mirrors `useListbox` (aria-activedescendant, prop-getter style) and composes `useDismiss` for click-away.
- Until then, the cheap alternative is the disclosure fix: add the panel `id`, drop `aria-haspopup`.
