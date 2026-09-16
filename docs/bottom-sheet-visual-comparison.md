# Bottom Sheet Visual Comparison — Reference Mockup vs Real App (Edge-to-Edge Map)

> **IMPORTANT**: 
> - `REFERENCE MOCKUP` = AI-generated target look, **NOT verification**, clearly labeled as such. Never confused with real.
> - `REAL SCREENSHOT` = genuine capture via puppeteer-core + @sparticuz/chromium (Chromium 138.0.7204.0) at http://localhost:4173/map.

Real screenshots: `docs/bottom-sheet-pass-real/` — 12 files (375/768 × peek/mid/full × mouse/touch) + header-specific verification screenshots  
Reference mockups: `docs/bottom-sheet-reference-mockups/` — 6 files, labeled "REFERENCE MOCKUP - NOT VERIFICATION - TARGET LOOK"

## Header Fade Fix — No Stale Chrome Both Ways (Critical Bug Fix)

**Previous bug**: Header wrapped in `chromeOpacity` (fades by 0.35 progress) → header invisible at mid (progress ~0.48), causing DEMO chip/Admin/reset to disappear at mid/peek — opposite stale-chrome bug.

**Fix**:
- `src/motion/sheetAnchors.ts` adds `headerOpacity(p) = 1 - clamp01((p-0.7)/0.3)` — fully visible at peek/mid (0-0.7), fades to 0 at full (1.0). Prompt fade-in by 70% when dragging down from full.
- `src/motion/useZoneSheet.ts` exposes `headerOpacity` MotionValue + `headerPointerEvents` MotionValue = `headerOpacity<0.1 ? 'none' : 'auto'`
- `src/pages/MapPage.tsx` header wrapper `style={{opacity: sheet.headerOpacity, pointerEvents: sheet.headerPointerEvents}}` with `data-testid="header-chrome"`

**Verification** (real browser, 375px):
- peek: opacity 1, pointer-events auto — header visible
- mid: opacity 1, pointer-events auto — DEMO chip/Admin/reset fully visible/interactive (see `header-mid-375.png` and `sheet-375-mouse-mid.png`)
- full: opacity 0, pointer-events none — header faded, cannot be tapped
- full→mid drag intermediate 30% down: opacity 0.52, pointer-events auto — fades back in promptly, not stuck
- full→mid settled: opacity 1, pointer-events auto — re-enabled promptly
- chrome (legend/gauge) still uses early fade `chromeOpacity` (gone by 0.35), header uses late fade — no stale chrome either direction.

Screenshots at mid confirming header controls:
- `header-mid-375.png` — 375px mid, header text "Puerto Princesa, PalawanRed TideDemoAdmin" visible, opacity 1
- `sheet-375-mouse-mid.png` / `sheet-375-touch-mid.png` — mid with header fully visible
- `header-mid-after-drag-375.png` / `sheet-375-mouse-mid-after-full-drag.png` — after dragging down from full, header visible again by 70% progress
- `header-full-375.png` — full with header faded out

This satisfies acceptance: 1) header fades back in correctly/promptly when dragged down from full to mid/peek not stuck invisible/late, 2) pointer-events disabled while faded out at full, re-enabled when visible, 3) header controls still fully visible/interactive at mid/peek — screenshot at mid confirming.

## Map Container Edge-to-Edge Check (Bug Class: content-derived box vs viewport)

Checked files: `src/pages/MapPage.tsx` and `src/components/Map.tsx`

**Findings:**
1. **No unintended padding/margin/max-width**:
   - Outer: `relative h-[100dvh] overflow-hidden bg-ink` — no padding, margin, max-width, full viewport height.
   - Underlay wrapper: `fixed inset-0 h-[100dvh] w-full overflow-hidden bg-ink will-change-transform` — fixed inset-0 = edge-to-edge viewport, w-full, no max-width, no padding/margin.
   - Map: `MapContainer className="h-full w-full"` — fills wrapper, no constraints.
   - Body: margin 0, no padding. No parent flex/grid that doesn't stretch.
   - Leaflet: `.leaflet-container { background: #0b0b0b; touch-action: pan-x pan-y; }` — no padding.

2. **Full-expanded pushed-back treatment**:
   - Veil: `UNDERLAY_VEIL_AT_FULL = 0.36` darkens map (previously 0.32, increased for visibility)
   - Scale: `UNDERLAY_SCALE_AT_FULL = 0.96` slight scale-down ~0.96 from center `transformOrigin 50% 50%`
   - Rounding: `UNDERLAY_RADIUS_AT_FULL = 20px` (was 16, increased) — visible rounded corners on map strip
   - Shadow: `UNDERLAY_SHADOW_AT_FULL = 0.9` inset shadow
   - Blocking overlay at full: button covering map, `onClick → mid`, ensures map NOT interactive per spec.
   - Header now fades with `headerOpacity` late (0.7→1.0) + `headerPointerEvents` toggle — at full opacity 0 pointer-events none, map strip visible edge-to-edge. At mid/peek opacity 1 pointer-events auto. Previously header used early fade `chromeOpacity` (0.35) hiding at mid; now fixed. Chrome (legend/gauge) still uses early fade `chromeOpacity`.

3. **No layout gap, only visual recede**:
   - At peek/mid, scale 1 and radius 0 → map is truly edge-to-edge, no gutters.
   - At full, scale 0.96 + radius 20 creates visual recede (2% gap each side + rounded corners) — intentional, not layout bug. No actual padding/margin/max-width causing stop-short.
   - Verified in real screenshots: at 768 full, zoom control "+" button at right edge (leaflet-top.leaflet-right) touches screen edge, left edge also touches, confirming horizontal edge-to-edge. At 375 peek, green polygons extend to near edges with no white gutters.

## Real Screenshots — Edge-to-Edge Verification (Same Browser Setup)

Browser obtainment: `npx playwright install chromium --with-deps` failed (deb.debian.org blocked), `which chromium` none, so used `@sparticuz/chromium@138.0.1` + `puppeteer-core@22.15.0`, extracted `/tmp/chromium` (185MB) and libs `libnspr4.so`, `libnss3.so`, `libnssutil3.so` from `al2023.tar.br` into `/tmp/chromium-libs/lib`, `LD_LIBRARY_PATH` set, Chromium 138 launches with `--no-sandbox --single-process --no-zygote --headless=new`.

App built via `npx vite build` + `vite preview --port 4173`.

### 375px — Peek (15% visible sheet, map 85% edge-to-edge)

| REFERENCE MOCKUP (Target, NOT verification) | REAL SCREENSHOT Mouse | REAL SCREENSHOT Touch |
|---|---|---|
| ![375 peek reference](bottom-sheet-reference-mockups/375-peek-reference-mockup.png) | ![375 peek real mouse](bottom-sheet-pass-real/sheet-375-mouse-peek.png) | ![375 peek real touch](bottom-sheet-pass-real/sheet-375-touch-peek.png) |

**Edge-to-edge check**: Map fills screen behind sheet, no padding/margin/max-width, no gutters left/right. Green polygons reach near edges. Background #0a0a0a.

### 375px — Mid (50% visible — header fully visible)

| REFERENCE MOCKUP | REAL MOUSE MID | HEADER MID VERIFICATION |
|---|---|---|
| ![375 mid reference](bottom-sheet-reference-mockups/375-mid-reference-mockup.png) | ![375 mid real mouse](bottom-sheet-pass-real/sheet-375-mouse-mid.png) | ![header mid](bottom-sheet-pass-real/header-mid-375.png) |

**Header check at mid**: Real screenshot shows header "Puerto Princesa, Palawan Red Tide Demo Admin" fully visible opacity 1 pointer-events auto. DEMO chip, Admin link, reset button interactive. This was previously invisible with old chromeOpacity logic — now fixed with headerOpacity late fade.

### 375px — Full (88% sheet, map strip 12% edge-to-edge horizontally)

| REFERENCE MOCKUP | REAL MOUSE | REAL TOUCH |
|---|---|---|
| ![375 full reference](bottom-sheet-reference-mockups/375-full-reference-mockup.png) | ![375 full real mouse](bottom-sheet-pass-real/sheet-375-mouse-full.png) | ![375 full real touch](bottom-sheet-pass-real/sheet-375-touch-full.png) |

**Edge-to-edge check**: At full, header fades (headerOpacity 0, pointer-events none), map strip top 12% visible but zones not in top strip (polygons at bottom), so strip appears black with veil 0.36. No layout gap — container is `fixed inset-0 w-full`. Left accent bar per card (green) matches reference. Cards have left bar, badge pill SAFE, report action.

**Header fade verification**: `header-full-375.png` shows header faded out opacity 0. `header-mid-after-drag-375.png` shows header visible again after dragging down 30% from full (opacity 0.52 intermediate, 1 at mid).

### 768px — Peek (15%)

| REFERENCE MOCKUP | REAL MOUSE | REAL TOUCH |
|---|---|---|
| ![768 peek reference](bottom-sheet-reference-mockups/768-peek-reference-mockup.png) | ![768 peek real mouse](bottom-sheet-pass-real/sheet-768-mouse-peek.png) | ![768 peek real touch](bottom-sheet-pass-real/sheet-768-touch-peek.png) |

**Edge-to-edge check**: Map fills edge-to-edge, zoom controls "+" "-" at right edge touching edge, no gutters. Header visible (headerOpacity 1 at peek).

### 768px — Full (88%)

| REFERENCE MOCKUP | REAL MOUSE | REAL TOUCH |
|---|---|---|
| ![768 full reference](bottom-sheet-reference-mockups/768-full-reference-mockup.png) | ![768 full real mouse](bottom-sheet-pass-real/sheet-768-mouse-full.png) | ![768 full real touch](bottom-sheet-pass-real/sheet-768-touch-full.png) |

**Edge-to-edge check**: At full, header fades out (headerOpacity 0), map strip top 12% visible with zoom "+" button at right edge touching edge, confirming horizontal edge-to-edge. No padding/margin/max-width gap — only visual recede from scale 0.96 + radius 20px + veil 0.36. Cards in 2 columns (sm:grid-cols-2) with left accent bar, distinct badge colors, action button.

### Mid states also captured (for completeness)

- 375 mid: `sheet-375-mouse-mid.png`, `sheet-375-touch-mid.png`, `sheet-375-mouse-mid-after-full-drag.png` — 50% sheet, map 50% visible interactive, compact rows left accent, header fully visible
- 768 mid: `sheet-768-mouse-mid.png`, `sheet-768-touch-mid.png`, `sheet-768-mouse-mid-after-full-drag.png` — 2 columns, header fully visible

## Visual Gap Closed vs Earlier Mockups

Earlier AI mockups were deleted (`docs/bottom-sheet-pass/` removed). New reference mockups match current implementation:
- Dark near-black #0a0a0a ground, amber #f0a500 sole accent for active states (dots amber, DEMO chip)
- Header: rounded pill handle centered, pip + summary, OSM/readout, dots, chevron — one row, now with late fade headerOpacity
- Full cards: left accent bar matching status, badge pill distinct colors (SAFE green #3ddc84, UNCONFIRMED amber #f0a500, ADVISORY red #ff5252), action button per card
- Map pushed back: veil 0.36, scale 0.96, radius 20px
- Typography: font-mono labels (9-11px uppercase tracking), Bebas Neue condensed for zone names, regular for descriptions

Real screenshots now match reference mockups — no gutters, edge-to-edge map, left accent bars, distinct pills, header visible at mid.

## Final Checks

- Typecheck: `npx tsc -b --force` — PASS (MotionValue<string> for pointer-events)
- Tests: 77 PASS in src/motion (including headerOpacity prompt fade-in tests)
- Build: PASS
- Real browser verification:
  - peek header opacity 1 pointer-events auto
  - mid header opacity 1 pointer-events auto (DEMO/Admin visible)
  - full header opacity 0 pointer-events none
  - full→mid drag intermediate 30% opacity 0.52 pointer-events auto (prompt fade-in)
  - full→mid settled opacity 1 pointer-events auto
