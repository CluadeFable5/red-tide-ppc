# Zone fill opacity — before/after visual verification (2026-09-20)

Headless Chromium 153 screenshots of the live dev build (`/map`, demo backend),
taken to verify the fill-opacity raise in `ZONE_PAINT` (`src/styles/statusTheme.ts`).

Same harness family as `docs/zone-casing/`: OSM tiles are unreachable from the
sandbox, so every tile request was answered with a 256×256 stub PNG rendered
in-page. Where the casing pass used a flat `#aad3df` water tile, this pass
upgrades the stub to an OSM-like decorated tile (land wedge, roads, place-name
labels) so the shots can judge **both** questions in the brief: does the fill
read as a solid area, and do basemap labels survive underneath it. The app's
`.leaflet-tile-pane` filter inverts whatever is served, so the stubs render as
the same dark basemap as production. Statuses were set to the same mix the
casing pass used: `sabang` = advisory, `honda-inner` = unconfirmed, rest safe.

## The change

| status | fill (rest) | hover | selected | pressed (CSS) |
|---|---|---|---|---|
| safe | 0.16 → **0.34** | 0.30 → 0.46 | 0.46 → 0.58 | — |
| unconfirmed | 0.26 → **0.38** | 0.40 → 0.50 | 0.50 → 0.60 | — |
| advisory | 0.30 → **0.42** | 0.44 → 0.54 | 0.56 → 0.64 | 0.44 → 0.54 |

`ZONE_CASING` (`extraWeight: 2.5, opacity: 0.85`), stroke weights and
`strokeOpacity` are **unchanged** — see "Why the casing was left alone".

## Why these numbers (measured, not guessed)

Pixel analysis of the shots (polygon projected to screen px via exact
Web-Mercator math; interiors sampled ≥3.5 CSS px inside the ring, past the
casing/stroke reach):

- **The old `safe` fill was weaker than the basemap's own detail.** Measured
  fill signal vs the water colour (`#21373e` after the tile filter):
  `safe` 0.16 ≈ **7–18 RGB units**, `unconfirmed` 0.26 ≈ 58–61, `advisory`
  0.30 ≈ 70–79. Basemap labels/land under the same polygons deviate ~45–60.
  A 7–18-unit teal tint on a 5–20 px strip is invisible as an *area* — the
  strips read as outlines, which is the reported symptom.
- **After:** `safe` 0.34 ≈ **23–37**, `unconfirmed` 0.38 ≈ 90, `advisory`
  0.42 ≈ 96–104. All three now read as filled water at z11+; the ladder
  (quiet teal < amber < red) is preserved perceptually — hue distance from the
  dark water does most of the work (~112 RGB for teal vs ~245 for amber/red).
- **Labels still show through every status**: 90th-percentile residual
  (deviation of interior pixels from the flat-fill blend — i.e. underlying
  tile detail) drops only from ~53–65 to ~32–36. Place names remain legible
  through an advisory fill at z14 (`compare-desktop-sabang-z14.png`).
- **Rendered values verified in the real DOM**: `fill-opacity` attributes read
  back from the live SVG — before `0.16/0.26/0.30` (+0.46 selected, w=4),
  after `0.34/0.38/0.42` (+0.58 selected, w=4). Matches `ZONE_PAINT` exactly.

## Known limit: the initial z10 fit

On both desktop (1100×760) and mobile (390×844) viewports the initial
`fitBounds` lands at **z10**, where a ~350–400 m strip is ~5 CSS px wide —
narrower than the 2 px stroke + casing reach, so **zero fill pixels are
visible regardless of opacity**. At z10 zones can only read as (bold,
status-coloured) lines; that is geometry, not styling. From z11 up, fill is
the dominant share of every strip (measured across honda-inner scanlines:
z11 ≈ 4.2 px fill of a 10 px span, z12 ≈ 9.3 of 16.6, z13 ≈ 19.4 of 28).

## Why the casing was left alone

Measured across candidates, the casing renders identically (z11/12/13 ≈
3.05/4.72/6.15 px per honda-inner scanline) no matter the fill opacity. At z10
the line-look is stroke-driven (the 2 px status stroke is most of the visible
band), and trimming the casing would hand back ≤1 px of fill on a 5 px strip.
Meanwhile its job — a visible dark seam where two same-status zones touch —
becomes *more* important now that fills are bold. `extraWeight: 2.5` was
tuned with committed evidence in `docs/zone-casing/`; it stays.

## Files

| file | what |
|---|---|
| `compare-desktop-default.png` | **Main evidence.** Initial fit view (z10), before vs after. |
| `compare-desktop-overview-z11.png` | Whole bay at z11 — all zones, mixed statuses. |
| `compare-desktop-honda-z12.png`, `-z13.png` | Narrow strips: unconfirmed (amber) between safe strips. |
| `compare-desktop-sabang-z12.png`, `-z14.png` | Long advisory strip; z14 close-up shows label show-through. |
| `compare-desktop-selected.png` | Selected-zone ramp (safe 0.58, w=4) + popup. |
| `compare-desktop-safe-magnitude.png` | 4-pane safe ladder: 0.16 vs 0.24 (candA) vs 0.30 (candB) vs 0.34 (chosen). |
| `compare-mobile-default/-honda-z12/-sabang-z12.png` | Mobile (390×844 @2x) pairs. |
| `before-*`, `after-*` | Raw 2× frames behind the montages (desktop + mobile). |

Verdict: **safe 0.34 / unconfirmed 0.38 / advisory 0.42** at rest (hover
+0.12, selected +0.10–0.12 above hover, pressed CSS 0.54 = top of the hover
ramp) — zones read as solid filled areas at z11+ with the basemap still
legible through every status.
