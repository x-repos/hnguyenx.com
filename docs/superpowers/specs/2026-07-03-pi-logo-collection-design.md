# Pi logo: circular-center shift + Pi Collection

**Date:** 2026-07-03
**Status:** implemented

## Problem

The site mark is a hand-traced serif π. It is drawn centred in a **square** box.
A serif π is top-heavy: the crossbar's corners sit farther from the box centre
than the legs do. So whenever the icon is masked into a **circle** — a ring
treatment on the site, or an avatar crop by Facebook / Google / X — the π drifts
upward and looks off-centre, with the crossbar crowding the top and empty space
under the legs.

## Key insight

Even a bare square favicon gets circle-cropped by external platforms. So the
fix belongs in the mark itself, not just in ringed variants.

## Decisions

1. **Keep the bare π as the site favicon** — no ring, no disc. Only *shift* it.
2. **Shift = recentre on the glyph's true circular centre** (the centre of its
   minimum enclosing circle), so any circular crop lands it in the middle.
   - Glyph min-enclosing circle: centre **(433.1, 409.9)**, R ≈ 596.4 (glyph units).
   - Old favicon centred the square on the bbox centre (466.4, 443.5).
   - New favicon viewBox: `-141.9 -165.1 1150 1150` (same size, recentred).
   - This is a ~3 % nudge — "the previous logo, just shifted."
3. **Colours unchanged** — gold `#8a6d3b` (light) / `#e8c87a` (dark), paper
   `#fffefb` / `#16130f`. The favicon SVG stays theme-adaptive.
4. **Ring / disc treatments are kept as a downloadable "Pi Collection,"** not
   adopted site-wide. All circled variants use the corrected centre (433.1, 409.9)
   on a shared canvas `-506.9 -530.1 1880 1880`.

## Deliverables

### Favicon (regenerated, shifted)
- `assets/favicon.svg` — adaptive, viewBox recentred.
- `assets/favicon-32.png` — 32 px, gold on transparent.
- `assets/apple-touch-icon.png` — 180 px, gold on cream (opaque for iOS).
- Cache-buster bumped `?v=2` → `?v=3` in `index.html`, `blog/index.html`,
  `pro/index.html`.

### Pi Collection
- `pi/index.html` — light page matching the main site (Crimson Pro, gold, hairline
  cards). Linked from Pro Mode's outro grid ("π Collection →").
- `pi/downloads/` — 4 variants × (1 adaptive SVG + 3 PNG):
  - variants: `pi-mark` (bare, = favicon), `pi-ring-thin` (r 860, sw 48),
    `pi-ring-bold` (r 861, sw 110), `pi-disc` (r 880, π knocked out).
  - PNG treatments: `-transparent` (gold, no bg), `-light` (gold on cream),
    `-dark` (pale gold on near-black), all 1024 px.
  - Disc knockout uses a compound even-odd path (circle + π), not `<mask>` —
    cairosvg mis-renders masks.

## Generation

Assets are produced by `scratchpad/gen_assets.py`; the page by
`scratchpad/gen_page.py` (imports the same path constant so previews match the
downloads exactly). Rasteriser: cairosvg.

## Out of scope

- `og-card.png` left as-is (its π is a decorative corner watermark, never
  circle-cropped).
- Main `index.html` not linked to the collection (user asked for Pro Mode only).
