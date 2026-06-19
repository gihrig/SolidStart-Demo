❯ /grill-with-docs I'm working on issue #11 "Convert .png icons to svg image sprite". I want to be sure we have a
complete understanding of what is to be done before formulating a plan of execution.

⏺ No icon library installed; everything hot-links to the icons8 CDN. Scope contains 9 distinct line-icon glyphs (fire-heart, expand-arrow, delete-sign, menu, 180-degrees, collage, dog, landscape, portrait) plus 3 avatar images (bart-simpson, lisa-simpson, happy).

Here's the decision tree I'll walk you down, in dependency order:

1. Icon source / licensing ← root, everything hangs off this
2. Scope — avatars in or out?
3. Delivery — external public/icons.svg (issue's pick) vs. inline-bundled
4. Generation — hand-authored vs. build-tool pipeline
5. Consumption — raw <svg><use> vs. an <Icon> component
6. Theming — currentColor + dropping the 777777 temp hack
7. Sizing API
8. Accessibility — aria-hidden
9. Test fixes — the 3 broken img-src assertions

Starting at the root.

Q1 — Where do the SVG glyphs come from? This is hard to reverse and has licensing weight, so it goes first.

❯ Can you locate close open licensed matches to these icons for my review?

⏺ Excellent — nearly every candidate exists in both sets. Only lucide/circle-half-2 404s, and contrast is the better Black-&-White match anyway. The one genuinely missing glyph is a combined fire-heart (neither set has heart-on-fire) — so that slot needs a decision (flame, or plain heart, or split: flame=brand / heart=likes).

⏺ Open review page in your browser (planning/icon-review.html) — originals vs. candidates, with a dark/light toggle so you can confirm each candidate stays visible in both modes (the originals won't — that's the bug).

Key finding: Lucide alone covers all 9 slots, so you don't need to mix sets — one license (ISC), one stroke weight,
one grid. Tabler is shown only as alternates on the judgment-call rows.

My recommended Lucide picks:

```pre
  ┌─────┬───────────────┬────────────────┬────────────────────────┬───────────────────────────────────────────────┐
  │  #  │    icons8     │     usage      │      Recommended       │                     Note                      │
  │     │   original    │                │                        │                                               │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 1   │ fire-heart    │ brand logo +   │ flame (logo) + heart   │ only true gap — no heart-on-fire exists;      │
  │     │               │ likes          │ (likes)                │ splitting reads best                          │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 2   │ expand-arrow  │ chevron        │ chevron-down           │ exact                                         │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 3   │ delete-sign   │ close X        │ x                      │ exact                                         │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 4   │ menu          │ hamburger      │ menu                   │ exact                                         │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 5   │ 180-degrees   │ cat: B&W       │ contrast               │ better than original — 180° was a weird glyph │
  │     │               │                │                        │  for "B&W"                                    │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 6   │ collage       │ cat: Abstract  │ shapes                 │ alt: images/layout-grid if you want the       │
  │     │               │                │                        │ photo-grid feel                               │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 7   │ dog           │ cat: Animals   │ dog                    │ exact                                         │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 8   │ landscape     │ cat: Landscape │ mountain-snow          │ alt: mountain                                 │
  ├─────┼───────────────┼────────────────┼────────────────────────┼───────────────────────────────────────────────┤
  │ 9   │ portrait      │ cat: People    │ user-round             │ alt: user — round matches the circular        │
  │     │               │                │                        │ avatars                                       │
  └─────┴───────────────┴────────────────┴────────────────────────┴───────────────────────────────────────────────┘
```

❯ can claude ai convert a png line drawn image to an svg?

⏺ Short answer: mechanically yes, but it's the wrong tool for this job — and it doesn't actually solve the problem that made us consider switching.

Two senses of "convert":

1. Auto-trace (raster→vector tools like potrace, vtracer, Inkscape CLI — I can install and run these via Bash). They work, but on 64–96px icon PNGs the output is poor: lumpy multi-node paths, doubled outlines (each stroke traced as an inner+outer edge rather than one clean stroke), and large file size. It's also a lossy round-trip — icons8's art is originally vector, and the PNG is a downsampled render of it, so tracing the render is strictly worse than the source.
2. Hand-author by looking (I can read/see a PNG). Clean only for trivially geometric glyphs — menu is 3 lines, x is 2, chevron is a polyline. For organic curves (dog, fire-heart, landscape, portrait) I'd be eyeballing béziers —
   unreliable, and I won't pretend otherwise. And Lucide already nails the geometric ones perfectly, so there's no
   upside.

The catch that matters: tracing icons8's PNGs produces a derivative of icons8 artwork → the same license obligation that made substitution attractive in the first place. So conversion doesn't dodge it.

So the real fork stays clean:

- Want the exact icons8 look → use icons8's own SVG export (Q1 Option B), not a trace — and handle their license.
- Want clean + license-free → Lucide (Option A), accept the fire-heart substitution.
- Tracing PNGs → satisfies neither well.

The only glyph where this even tempts you is fire-heart. If exact-fire-heart matters, better routes than tracing exist (e.g. a purpose-built "burning heart" from another open set — game-icons.net has them under CC-BY).

Want me to trace fire-heart.png right now so you can see the quality firsthand before deciding? Costs nothing and
settles it.

❯ Ok

⏺ brew + sips available. Installing potrace and tracing the 512px source (sips handles PNG→BMP). This needs
network/install, so sandbox off:

⏺ The trace came out near-empty (603 bytes, no real path data) — sips flattened the transparent PNG onto a solid
background, so potrace had no clean bilevel edge to follow. That's a prep artifact, not a fair test. Let me confirm what happened and switch to vtracer, which reads PNG alpha directly and is the tool someone would actually use (fairer, best-case quality).

See: https://grok.com/c/cf5e9970-1164-4f2c-91fb-aad5bc810fb5?rid=fa7a0275-4ac2-40a2-92f0-40aa49e362f1

claude --resume 1cdf965c-b5d7-407c-8999-5324e92b5943

## >>>>> Restart <<<<<<

Claude seems to be unable to evaluate images for exact match vs similarity.

### Manual process:

1. Down load image icon (.png)
2. Convert to .svg (https://www.freeconvert.com/png-to-svg)
3. Edit properties using `180-degrees` and `collage` as examples
4. Generate image sprite (https://codeshack.io/svg-sprite-generator/)
5. Place `icon-sprite.svg` in site root/public

Usage:

```html
<svg class="icon">
  <use xlink:href="#icon-180-degrees" href="#icon-180-degrees"></use>
</svg>
```
