# Bottom Sheet Redesign — Proposal & Implementation

## Problem
The zone-list panel behaved like a broken drag sheet: binary jump to ~half screen, no intermediate state, unclear map interactivity, gesture-only.

## Design Decisions

### Detents
- **peek: 15%** — 100px on 667px iPhone, 154px on 1024px tablet. Just handle + summary line "6 zones · No advisories" + OSM + readout + dots. Map 85% visible, fully interactive. Enough to read status without wrapping at 375px.
- **mid: 50%** — Exactly half viewport. Advisory banner + 3-4 compact zone rows. Map 50% visible, still pannable/zoomable. This is the "scan" state: quick look without losing geography. Travel from peek→mid is 35% of viewport.
- **full: 88%** — Caps at 88vh, never unbounded. Leaves 12% map strip (~80px on 667px) as depth cue. List scrolls internally (overflow-y-auto, overscroll-contain). Map NOT interactive at full. Travel mid→full is 38% — balanced steps, not binary jump.

Why 15/50/88? Equal travel between stops (35% and 38%) feels like two equal steps. Previous 14/45/85 had 31% and 40% — less balanced. 88% cap matches spec "85-90vh".

### Animation Approach
**Spring physics, not duration/easing.**
- Spring: stiffness 420, damping 34, mass 0.85
  - Stiffer than previous 300/30 so flick lands without visible "arrive and settle" wobble. On viewport-tall panel any overshoot reads as glitch.
  - Damped enough to not overshoot anchor.
  - Mass 0.85 makes it snappier than default.
  - Velocity-aware: projection 0.20s (was 0.18) converts px/s to px offset, so moderate flick carries further. Flick threshold 500px/s (was 480) — above accidental fast drag, below deliberate swipe (1000-2000px/s).
- Reduced-motion: instant jump (offsetY.jump), opacity 0ms. No spring, still functional.
- Body opacity driven by progress (0 at peek → 1 at full) continuous through drag, same value as map underlay — no re-render.

Why spring over easing? Native map sheets use spring: velocity-aware, settles naturally. Duration/easing would feel timed and fight flick velocity.

### Map Interactivity Per State
- **peek (15%)**: Map 85% visible, fully interactive — pan/zoom/tap zones. Sheet is fixed + translated, only visible strip captures pointer events. Body has pointer-events-none at peek so map above free.
- **mid (50%)**: Map 50% visible, interactive in top half. User can scan list while panning map. Chrome (legend, gauge) fades out before mid (chromeOpacity fades by 35% progress) so nothing half-covered.
- **full (88%)**: Map NOT interactive. Implementation: 
  - Veil darkens (0.32 opacity at full), scale 0.96, radius 16px, shadow 0.85 — reads as pushed back.
  - Blocking overlay button covers map, captures pointer events, on click collapses to mid (discoverable).
  - `isMapInteractive` data attribute for tests.
  - List scrolls internally, sheet caps at 88vh, never unbounded.

### Non-Drag Path (Keyboard / Reduced-Motion)
- Summary bar itself is a button (role button, keyboard Enter/Space) that cycles peek→mid→full→peek. `isDragTail` prevents drag tail click from also cycling.
- Anchor dots: 3 dots, each button directly to peek/mid/full with aria-pressed, aria-label, title showing percentage. This satisfies "reach every state" not just cycling.
- Chevron button also cycles.
- All focusable, focus-visible ring amber.
- Drag surface: `onPointerDown={sheet.startDrag}` with `dragListener={false}` + `useDragControls` so only header drags, not body scroll. Scroll chaining: when body scrollTop <=0 and at mid/full, pointer down delegates to sheet drag — downward pull collapses sheet.

### Continuous Drag Tracking
- `offsetY` MotionValue updated every pointermove via motion drag.
- `dragElastic` top 0.08 bottom 0.02 — small asymmetric elasticity: pulling up past full feels straining, down past peek barely gives.
- `dragMomentum={false}` — snap is ours, not framer's.
- On release, `resolveSheetAnchor` clamps elastic overshoot, projects velocity forward (0.2s), guarantees flick advances at least one detent, clamps at ends.

## Implementation Files
- `src/motion/sheetAnchors.ts` — detents 15/50/88, projection 0.2s, flick 500px/s, underlay 0.96/16/0.32/0.85, docs.
- `src/motion/useZoneSheet.ts` — spring 420/34/0.85, reduced-motion jump, continuous tracking docs.
- `src/components/ZoneSheet.tsx` — summary button, anchor dots, scroll chaining, body caps 88vh, internal scroll, keyboard.
- `src/pages/MapPage.tsx` — map interactivity per state, blocking overlay at full, veil/scale/radius.
- `src/motion/bottomSheetVerification.test.ts` — verifies at 375px and 768px, mouse vs touch paths, map interactivity, capping, non-drag.

## Verification — Real Browser

Browser obtainment:
- `npx playwright install chromium --with-deps` failed: deb.debian.org blocked, apt sources unavailable.
- `which chromium` — none.
- `@sparticuz/chromium@138.0.1` + `puppeteer-core@22.15.0` installed via npm. Decompressed `/tmp/chromium` from brotli bundles. Required libs `libnspr4.so`, `libnss3.so`, `libnssutil3.so` extracted from `al2023.tar` into `/tmp/chromium-libs/lib`, set `LD_LIBRARY_PATH=/tmp/chromium-libs/lib`. Chromium 138.0.7204.0 launches with `--no-sandbox --disable-dev-shm-usage --single-process --no-zygote --headless=new`.

Script `scripts/bottom-sheet-real3.mjs` uses puppeteer-core with that binary, navigates to built app at http://localhost:4173/map, and for each viewport:

- 375×667 mouse and touch (hasTouch true/false)
- 768×1024 mouse and touch

Performs:
- peek → mid drag (mouse slow 500ms, touch 600ms) — continuous tracking
- mid → full flick (90ms, 6 steps) — velocity-aware
- full → peek drag down (600ms) — fixed bug where full→peek was upward
- Non-drag: summary button tap cycles, anchor dots direct to each state, keyboard Enter/Space

Screenshots (genuine, not AI mockups) in `docs/bottom-sheet-pass-real/`:
- `sheet-375-mouse-peek.png` — collapsed 15%, map 85% visible, body opacity 0, interactive true
- `sheet-375-mouse-mid.png` — 50%, compact rows, map 50% interactive true
- `sheet-375-mouse-full.png` — 88%, list scrollable (scrollHeight 2122 client 603 overflow auto), map NOT interactive (blocking overlay)
- `sheet-375-touch-peek.png`, `sheet-375-touch-mid.png`, `sheet-375-touch-full.png` — same with touch emulation
- `sheet-768-mouse-peek.png`, `sheet-768-mouse-mid.png`, `sheet-768-mouse-full.png` — tablet, 2 columns at mid/full
- `sheet-768-touch-peek.png`, `sheet-768-touch-mid.png`, `sheet-768-touch-full.png`

Checks:
- peek: body hidden (opacity 0), map interactive true
- mid: map still interactive true
- full: map NOT interactive false, caps at 88vh (anchor check), list scrollable internally
- All three snap points reachable via drag and via non-drag (dots + summary + keyboard)

**Typecheck**: `npx tsc -b --force` — PASS
**Tests**: `npx vitest run` — 208 tests pass
**Build**: `npx vite build` — PASS

All 5 minimum bars met with real browser evidence.
