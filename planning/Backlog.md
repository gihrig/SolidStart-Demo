## 1. Convert .png icons to svg image sprite

### HIGH — Icons invisible in dark mode

- Detail `planning/plan_steps_ignored.md` @line 4041

- Create a comparable svg icon sprite
  ```
  <svg width="24" height="24" aria-hidden="true">
    <use href="/icons.svg#icon-home"></use>
  </svg>
  ```
- Update instances of icon usage `https://img.icons8.com...` with sprite access:
  ```
  <svg width="24" height="24" aria-hidden="true">
    <use href="/icons.svg#icon-home"></use>
  </svg>
  ```
- `components/JediNav.tsx`
  - "https://img.icons8.com/small/64/ffffff/fire-heart.png"
  - "https://img.icons8.com/small/64/ffffff/delete-sign.png"
  - "https://img.icons8.com/small/64/ffffff/menu.png"
  - "https://img.icons8.com/doodle/96/null/bart-simpson.png"
  - "https://img.icons8.com/small/32/777777/expand-arrow.png"
- `src/routes/jedi.tsx`
  - "https://img.icons8.com/small/96/null/landscape.png"
  - "https://img.icons8.com/small/96/null/portrait.png"
  - "https://img.icons8.com/small/96/null/dog.png"
  - "https://img.icons8.com/small/96/null/collage.png"
  - "https://img.icons8.com/small/96/null/180-degrees.png"
  - "https://img.icons8.com/small/96/A9A9A9/happy.png"

## 2. Download `https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg` read from /pubic

## 3. MODERATE — Card class concatenation has no conflict resolution

- Detail `planning/plan_steps_ignored.md` @line 4066
