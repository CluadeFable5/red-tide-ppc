# Zone casing — visual verification (2026-09-20)

Headless Chromium 153 screenshots of the live dev build (`/map`, demo backend),
taken to verify commit 5cf5b7b (dark casing under every zone outline).

OSM tiles are unreachable from the CI/sandbox network, so every tile request
was answered with a flat 256×256 PNG of OSM's water colour (`#aad3df`), which
the app's `.leaflet-tile-pane` filter turns into the same `#1f353c` teal the
real basemap shows over water. Land detail is therefore absent, but polygon
strokes, fills and the casing render exactly as in production.

| file | what |
|---|---|
| `compare-seam-before-after.png` | **Main evidence.** pp-bay/irawan seam, before (`main` @770ef38) vs after, at z12/z13 and a 4× pixel crop at z14. |
| `before-water-seam-z12/13.png`, `cur-water-seam-z12/13.png` | Raw 2× frames behind the comparison. |
| `cur-dpr1-water-seam-z12.png` | Same seam on a 1× (non-retina) display at the default fit zoom. |
| `before-water-overview-z11.png`, `cur-water-overview-z11.png` | Whole map, all zones `safe`, before/after. |
| `cur-water-status-overview-z11.png` | Whole map with one advisory + one unconfirmed zone. |
| `cur-water-status-sabang-advisory-z12.png` | Advisory (red) outline on the casing. |
| `cur-water-status-honda-unconfirmed-z12.png` | Unconfirmed (dashed amber) on the casing, between two safe strips. |
| `cur-water-seam-irawan-advisory-z13.png` | The seam with one side advisory. |

Verdict: `ZONE_CASING = { extraWeight: 2.5, opacity: 0.85 }` and `safe`
strokeOpacity 0.7 left unchanged — see the PR/session notes for the reasoning.
