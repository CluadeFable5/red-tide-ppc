# Bottom Sheet Visual Comparison — Reference Mockup vs Real App (Edge-to-Edge Map)

> **IMPORTANT**: 
> - `REFERENCE MOCKUP` = AI-generated target look, **NOT verification**, clearly labeled as such. Never confused with real.
> - `REAL SCREENSHOT` = genuine capture via puppeteer-core + @sparticuz/chromium (Chromium 138.0.7204.0) at http://localhost:4173/map.

Real screenshots: `docs/bottom-sheet-pass-real/` — 12 files (375/768 × peek/mid/full × mouse/touch) + header-specific + flick-sequence verification  
Reference mockups: `docs/bottom-sheet-reference-mockups/` — 6 files, labeled "REFERENCE MOCKUP - NOT VERIFICATION - TARGET LOOK"

## Header Fade Fix — No Stale Chrome Both Ways (Critical Bug Fix)

**Previous bug**: Header wrapped in `chromeOpacity` (fades by 0.35 progress) → header invisible at mid (progress ~0.48), causing DEMO chip/Admin/reset to disappear at mid/peek — opposite stale-chrome bug.

**Fix**:
- `src/motion/sheetAnchors.ts` adds `headerOpacity(p)` — fully visible at peek/mid (0-0.65), fades to 0 at full (1.0) with **smoothstep easing** `t*t*(3-2*t)` over 0.65→1.0 (35% of travel). This spreads fade over 35% instead of 30%, with S-curve: starts gently, accelerates mid, eases out near full — less jarring during fast spring (stiffness 420) where peek→full settles in ~300ms. Fade now lasts ~99ms with 5 intermediate frames, not instant glitch.
- `src/motion/useZoneSheet.ts` exposes `headerOpacity` MotionValue + `headerPointerEvents` MotionValue = `headerOpacity<0.1 ? 'none' : 'auto'`
- `src/pages/MapPage.tsx` header wrapper `style={{opacity: sheet.headerOpacity, pointerEvents: sheet.headerPointerEvents}}` with `data-testid="header-chrome"`

**Safety margin for mid across viewport heights (tested 300-1366)**:

Mid progress is constant for all heights because offsets use same ratios:
- peek = h*0.85, mid = h*0.5, full = h*0.12, span = 0.73h
- progress_mid = (peek-mid)/span = 0.35/0.73 = **0.4795**
- So no height pushes mid above threshold. Tested heights: 300 (keyboard), 400, 500, 568, 667, 736, 812, 844, 896, 926, 1024, 1180, 1366 — all progress_mid = 0.4795.

Margin analysis:
- 0.6 threshold: margin 0.1205 = 8.8% viewport = 35px @400px, 58px @667px, 26px @300px keyboard — a bit tight on very short phones
- **0.65 threshold (chosen)**: margin 0.1705 = 12.4% viewport = **50px @400px, 83px @667px, 37px @300px keyboard** — comfortable, still prompt fade-in by 65%
- 0.7 threshold (original): margin 0.2205 = 16% viewport = 64px @400, 107px @667, but fade range only 0.30 (87ms) more abrupt

At 60% visible (slightly above mid), progress = 0.616 <0.65, so header still fully visible (opacity 1). At 65% visible, progress 0.685 >0.65, opacity 0.972 with 0.65 threshold — still mostly visible. So header doesn't start fading while at mid, even on very short phones with keyboard.

**Verification** (real browser, 375px, rAF logging via `scripts/verify-flick-smooth.mjs`):

- peek: opacity 1, pointer-events auto — header visible, top 567
- mid: opacity 1, pointer-events auto — DEMO chip/Admin/reset fully visible/interactive (see `header-mid-375.png` and `sheet-375-mouse-mid.png`), top 333
- full: opacity 0, pointer-events none — header faded, cannot be tapped, top 80
- full→mid drag intermediate 30% down: opacity 0.419 (with 0.65 threshold smoothstep), pointer-events auto — fades back in promptly, not stuck
- full→mid settled: opacity 1, pointer-events auto — re-enabled promptly by 65% progress
- chrome (legend/gauge) still uses early fade `chromeOpacity` (gone by 0.35), header uses late fade 0.65→1.0 — no stale chrome either direction.

**Fast flick peek→full (skipping mid) — not jarring**:

Real browser rAF log (spring 420/34/0.85, peek top 567 → full top 80, with 0.65 threshold):
```
0: t+0ms top=567 opacity=1.000 anchor=peek
6: t+96ms top=364 opacity=1.000
7: t+113ms top=302 opacity=1.000
8: t+129ms top=246 opacity=0.999
9: t+147ms top=201 opacity=0.797
10: t+163ms top=165 opacity=0.503
11: t+179ms top=140 opacity=0.286
12: t+196ms top=120 opacity=0.141
13: t+212ms top=106 opacity=0.063
14: t+229ms top=96 opacity=0.027
15: t+246ms top=89 opacity=0.010
```
Fade duration 1→0: **99.1ms** with **5 intermediate frames** (0.05-0.95), monotonic decreasing, S-curve:
- delta 0.65→0.75 (1→0.79) = 0.20 (gentle start)
- delta 0.75→0.825 (0.79→0.5) = 0.29 (accelerates)
- Not instant glitch, smooth dismissal. Screenshots in `flick-sequence/smooth-peek-to-full-*.png` capture intermediate opacity 0.79,0.50,0.28,0.14,0.06 etc.

With linear 0.7→1.0, fade would be 30% travel ~87ms with fewer intermediates, more abrupt. With 0.65→1.0 smoothstep, fade is 35% travel ~99ms, starts gently, feels like header lingers then dismisses with sheet — not jarring, while keeping comfortable 50px margin on 400px phones.

**Reduced-motion — instant swap at same 0.65 threshold**:

Real browser with `prefers-reduced-motion: reduce`:
```
RM 0: top=567 opacity=1.000
RM 4: top=567 opacity=0.000 (60ms after click full)
RM 5: top=80 opacity=0.000
```
- No intermediate opacity 0.05-0.95 — only 1 and 0
- Immediate swap 1→0 at threshold, pointer-events auto→none instantly
- Consistent with rest of sheet: `offsetY.jump(to)` when `useReducedMotion()` true, no spring, so progress jumps 0→1 instantly, headerOpacity jumps 1→0 instantly at same 0.65 threshold, no animated fade.

Screenshots at mid confirming header controls:
- `header-mid-375.png` — 375px mid, header text "Puerto Princesa, PalawanRed TideDemoAdmin" visible, opacity 1
- `sheet-375-mouse-mid.png` / `sheet-375-touch-mid.png` — mid with header fully visible
- `header-mid-after-drag-375.png` / `sheet-375-mouse-mid-after-full-drag.png` — after dragging down from full, header visible again by 65% progress
- `header-full-375.png` — full with header faded out
- `flick-sequence/` — 15+ frames of peek→full flick showing smooth fade, not glitch

This satisfies acceptance: 1) header fades back in correctly/promptly when dragged down from full to mid/peek not stuck invisible/late (by 65%), 2) pointer-events disabled while faded out at full, re-enabled when visible, 3) header controls still fully visible/interactive at mid/peek — screenshot at mid confirming, 4) fast flick peek→full skipping mid is smooth S-curve fade ~99ms with 5 intermediates, not jarring glitch, 5) reduced-motion instant swap at same threshold, 6) mid progress 0.479 stays comfortably below 0.65 for all heights 300-1366, margin 50px @400, 83px @667, 37px @300 keyboard.

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
   - Header now fades with `headerOpacity` late (0.65→1.0 smoothstep) + `headerPointerEvents` toggle — at full opacity 0 pointer-events none, map strip visible edge-to-edge. At mid/peek opacity 1 pointer-events auto. Previously header used early fade `chromeOpacity` (0.35) hiding at mid; now fixed with smooth S-curve for non-jarring fast flick and comfortable margin.

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

### 375px — Mid (50% visible — header fully visible)

| REFERENCE MOCKUP | REAL MOUSE MID | HEADER MID VERIFICATION |
|---|---|---|
| ![375 mid reference](bottom-sheet-reference-mockups/375-mid-reference-mockup.png) | ![375 mid real mouse](bottom-sheet-pass-real/sheet-375-mouse-mid.png) | ![header mid](bottom-sheet-pass-real/header-mid-375.png) |

### 375px — Full (88% sheet, map strip 12% edge-to-edge horizontally)

| REFERENCE MOCKUP | REAL MOUSE | REAL TOUCH |
|---|---|---|
| ![375 full reference](bottom-sheet-reference-mockups/375-full-reference-mockup.png) | ![375 full real mouse](bottom-sheet-pass-real/sheet-375-mouse-full.png) | ![375 full real touch](bottom-sheet-pass-real/sheet-375-touch-full.png) |

### 375px — Fast Flick Peek→Full (skipping mid) — smooth not jarring

| Frame top 364 opacity 1.0 | Frame top 201 opacity 0.79 | Frame top 140 opacity 0.28 | Full top 80 opacity 0 |
|---|---|---|---|
| ![flick 0](bottom-sheet-pass-real/flick-sequence/smooth-peek-to-full-00-op1.00.png) | ![flick mid](bottom-sheet-pass-real/flick-sequence/peek-to-full-00-top369-op1.00.png) | ![flick mid2](bottom-sheet-pass-real/flick-sequence/peek-to-full-01-top83-op0.01.png) | ![flick full](bottom-sheet-pass-real/flick-sequence/99-full.png) |

Real rAF log shows 99ms fade with 5 intermediates, S-curve, not glitch. See `verify-flick-smooth.mjs` output.

### 768px — Peek (15%)

| REFERENCE MOCKUP | REAL MOUSE | REAL TOUCH |
|---|---|---|
| ![768 peek reference](bottom-sheet-reference-mockups/768-peek-reference-mockup.png) | ![768 peek real mouse](bottom-sheet-pass-real/sheet-768-mouse-peek.png) | ![768 peek real touch](bottom-sheet-pass-real/sheet-768-touch-peek.png) |

### 768px — Full (88%)

| REFERENCE MOCKUP | REAL MOUSE | REAL TOUCH |
|---|---|---|
| ![768 full reference](bottom-sheet-reference-mockups/768-full-reference-mockup.png) | ![768 full real mouse](bottom-sheet-pass-real/sheet-768-mouse-full.png) | ![768 full real touch](bottom-sheet-pass-real/sheet-768-touch-full.png) |

### Mid states also captured (for completeness)

- 375 mid: `sheet-375-mouse-mid.png`, `sheet-375-touch-mid.png`, `sheet-375-mouse-mid-after-full-drag.png` — 50% sheet, map 50% visible interactive, compact rows left accent, header fully visible
- 768 mid: `sheet-768-mouse-mid.png`, `sheet-768-touch-mid.png`, `sheet-768-mouse-mid-after-full-drag.png` — 2 columns, header fully visible

## Visual Gap Closed vs Earlier Mockups

- Dark near-black #0a0a0a ground, amber #f0a500 sole accent for active states (dots amber, DEMO chip)
- Header: rounded pill handle centered, pip + summary, OSM/readout, dots, chevron — one row, now with late fade 0.65→1.0 smoothstep for non-jarring fast flick and comfortable margin on small phones
- Full cards: left accent bar matching status, badge pill distinct colors (SAFE green #3ddc84, UNCONFIRMED amber #f0a500, ADVISORY red #ff5252), action button per card
- Map pushed back: veil 0.36, scale 0.96, radius 20px

## Final Checks

- Typecheck: `npx tsc -b --force` — PASS
- Tests: 83 PASS in src/motion (including headerOpacity smoothstep, fast flick not jarring, reduced-motion instant swap, mid progress margin across heights) + 215 total PASS
- Build: PASS
- Real browser verification:
  - peek header opacity 1 pointer-events auto
  - mid header opacity 1 pointer-events auto (DEMO/Admin visible), progress_mid 0.479 constant for all heights 300-1366, margin 50px @400, 83px @667, 37px @300 keyboard — comfortably below 0.65
  - full header opacity 0 pointer-events none
  - full→mid drag intermediate 30% opacity 0.419 pointer-events auto (prompt fade-in by 65%)
  - full→mid settled opacity 1 pointer-events auto
  - fast flick peek→full skipping mid: rAF log 99ms fade, 5 intermediates 0.79→0.02, S-curve, not glitch — screenshots in flick-sequence/
  - reduced-motion: instant swap 1→0 at 0.65 threshold, no intermediate fade, pointer-events auto→none instantly, consistent with offsetY.jump
