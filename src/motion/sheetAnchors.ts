/**
 * Anchor maths for the three-state zone sheet.
 *
 * WHY THIS FILE EXISTS — AND WHY IT IS PURE
 * -----------------------------------------
 * The Google Maps bottom sheet is a *three*-anchor pattern: peek, mid, full.
 * Two anchors (open/closed) is the thing every generic drawer does, and it is
 * the reason a two-state sheet never feels like it "sits over" a map — there is
 * no intermediate state for the map to recede *through*.
 *
 * The mechanic that makes three anchors read as depth rather than as a bigger
 * drawer is the underlay: a single normalised `progress` value (0 at peek, 1 at
 * full) drove both the sheet's position and the map's recede transform. In
 * gorhom/bottom-sheet that value is `animatedIndex` — a shared value from 0 to
 * `snapPoints.length - 1` that consumers interpolate from. We keep the concept
 * (one shared, continuous index; consumers interpolate) and drop the RN parts:
 * in React + `motion` the equivalent is a `MotionValue<number>` derived from the
 * sheet's `y`, which `useTransform` turns into scale / radius / veil opacity.
 *
 * Everything here is deliberately pure arithmetic with no `motion` and no DOM
 * imports, because snap behaviour is the part that is easy to get subtly wrong
 * (a fast flick that lands one anchor short, an elastic overshoot that snaps
 * backwards). Pure functions mean the branches are unit-tested rather than
 * eyeballed on a phone — see `sheetAnchors.test.ts`.
 *
 * COORDINATE SYSTEM
 * -----------------
 * Offsets are `translateY` in px for a sheet that is pinned to the *top* of the
 * viewport and is one viewport tall:
 *
 *   offset = 0            → sheet covers everything (not an anchor)
 *   offset = peek offset  → only the top `SHEET_VISIBLE_RATIO.peek` is visible
 *   offset = full offset  → the sheet covers all but a sliver of the map
 *
 * Because the sheet is viewport-tall and pinned to the top, `offset` and
 * "visible height" are complements: `visible = viewportHeight - offset`.
 */

export type SheetAnchor = 'peek' | 'mid' | 'full'

/** Bottom-to-top. Also the order the snap search uses, which decides ties. */
export const SHEET_ANCHOR_ORDER: readonly SheetAnchor[] = ['peek', 'mid', 'full']

/**
 * Fraction of the viewport the sheet occupies at each anchor.
 *
 * DESIGN DECISIONS — why these numbers
 * ------------------------------------
 * Native map sheets (Google Maps / Apple Maps) use three stops:
 *   - a peek strip that is *only* a handle + one line of status,
 *   - a mid stop where the map is still ~50% visible and a few results are
 *     scannable,
 *   - a full stop that caps around 85-90vh and leaves a sliver of map as a
 *     depth cue, with the list scrolling internally.
 *
 * Our detents:
 *   peek: 0.15 (15%) — on a 667px iPhone that's ~100px: handle (20px) +
 *     summary row (36px) + breathing room. Enough to read "6 zones · No
 *     advisories" at 375px without wrapping, but still just a status bar.
 *     Slightly larger than 14% so the text doesn't feel clipped on narrow
 *     devices.
 *
 *   mid: 0.50 (50%) — exactly half the viewport. On 667px that's 333px:
 *     advisory banner (~72px) + 3-4 compact zone rows (~48px each) + header.
 *     Map still 50% visible, so the user can correlate list + geography.
 *     This is the "scan" state: not yet reading, just scanning.
 *
 *   full: 0.88 (88%) — caps at 88vh, never grows unbounded. Leaves 12% map
 *     strip (~80px on 667px) as a depth cue that this is still a map app,
 *     but focuses on the list. At 768px tablet the list becomes 2 columns,
 *     so 88% still shows 6-8 cards without scrolling, but overflow scrolls
 *     internally.
 *
 * The 15/50/88 split also gives roughly equal travel between stops (35% and
 * 38%), so a drag feels like two equal steps rather than a tiny nudge then a
 * huge jump — which was the "binary jump" bug the old sheet had.
 *
 * ANIMATION APPROACH
 * ------------------
 * Spring, not duration/easing, for the snap. A spring (stiffness 420, damping
 * 34, mass 0.85) feels like native iOS: velocity-aware, settles without
 * overshoot on a viewport-tall panel. Duration/easing would feel timed and
 * would fight the user's flick velocity. For reduced-motion we jump instantly
 * (or short 150ms ease-out for opacity), so the sheet is still functional
 * without motion.
 *
 * MAP INTERACTIVITY PER STATE
 * ---------------------------
 * peek: map fully interactive — pan/zoom/tap zones in the 85% above the sheet.
 * mid: map interactive in top 50% — user can still pan while scanning list.
 * full: map NOT interactive — veil darkens, scale 0.96, radius 16px, shadow,
 *       plus a blocking overlay so pan/zoom is disabled. List scrolls
 *       internally, sheet caps at 88vh. Tapping the map strip collapses to mid.
 */
export const SHEET_VISIBLE_RATIO: Record<SheetAnchor, number> = {
  peek: 0.15,
  mid: 0.5,
  full: 0.88,
}

/** Sheet offset in px at each anchor, for a given viewport height. */
export type SheetOffsets = Record<SheetAnchor, number>

/**
 * How far a release velocity is allowed to *carry* the sheet, in seconds.
 *
 * This is the whole trick behind "snap on velocity, not position". A finger
 * cannot stop the sheet exactly on an anchor, and users do not expect it to:
 * they expect a flick to be *projected* forward, the way iOS scroll deceleration
 * is. Framer's `PanInfo.velocity` is px/s, so multiplying by a small time
 * constant converts it into the px offset the user was *aiming* at.
 *
 * Tuned to 0.20s (was 0.18) — slightly longer projection makes a moderate
 * flick carry further, so mid → full feels achievable without a hard throw.
 */
export const SHEET_PROJECTION_SECONDS = 0.2

/**
 * Above this release speed (px/s) the gesture is a deliberate flick rather than
 * a slow drag, and the snap is not allowed to ignore its direction.
 *
 * Without this, a hard flick from peek can project to a position that is still
 * nearest to peek — the sheet visibly "sticks" under a fast gesture, which is
 * the single most common way a hand-rolled bottom sheet feels broken.
 *
 * 500 px/s (was 480) — a touch above the old threshold so accidental fast
 * drags don't count as flicks, but still well below a deliberate swipe
 * (~1000-2000 px/s on mobile).
 */
export const SHEET_FLICK_VELOCITY = 500

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/** Offsets for a viewport height. Non-finite/zero heights degrade to 0 (jsdom). */
export function sheetOffsets(viewportHeight: number): SheetOffsets {
  const height = isPositiveNumber(viewportHeight) ? viewportHeight : 0
  return {
    peek: height * (1 - SHEET_VISIBLE_RATIO.peek),
    mid: height * (1 - SHEET_VISIBLE_RATIO.mid),
    full: height * (1 - SHEET_VISIBLE_RATIO.full),
  }
}

/** Clamp an offset into the draggable range (peek is the floor, full the ceiling). */
export function clampOffset(offset: number, offsets: SheetOffsets): number {
  if (!Number.isFinite(offset)) return offsets.peek
  // `full` has the smaller offset; `peek` the larger.
  return clamp(offset, offsets.full, offsets.peek)
}

/** Fraction of the viewport the sheet currently occupies (0..1). */
export function sheetVisibleRatio(
  offset: number,
  viewportHeight: number,
): number {
  if (!isPositiveNumber(viewportHeight)) return SHEET_VISIBLE_RATIO.peek
  return clamp(1 - clampOffset(offset, sheetOffsets(viewportHeight)) / viewportHeight, 0, 1)
}

/**
 * Anchor whose offset is closest to `offset`.
 *
 * Ties resolve to the *lower* anchor (peek before mid before full) because the
 * iteration order is bottom-to-top and the comparison is strict — an exact
 * midpoint should not silently prefer covering the map.
 */
export function nearestAnchor(
  offset: number,
  offsets: SheetOffsets,
  candidates: readonly SheetAnchor[] = SHEET_ANCHOR_ORDER,
): SheetAnchor {
  let best: SheetAnchor = candidates[0] ?? 'peek'
  let bestDistance = Number.POSITIVE_INFINITY

  for (const anchor of candidates) {
    const distance = Math.abs(offsets[anchor] - offset)
    if (distance < bestDistance) {
      bestDistance = distance
      best = anchor
    }
  }

  return best
}

export interface SheetSnapInput {
  /** Sheet offset at the moment of release (px, may include elastic overshoot). */
  offset: number
  /** Release velocity in px/s, positive = downward = towards peek. */
  velocity: number
  offsets: SheetOffsets
  /** Override for tests / tuning. */
  projectionSeconds?: number
  flickVelocity?: number
}

/** Safe accessor for an anchor index, clamped to the ends of the range. */
function anchorAt(index: number): SheetAnchor {
  const clamped = clamp(index, 0, SHEET_ANCHOR_ORDER.length - 1)
  return SHEET_ANCHOR_ORDER[clamped] ?? 'peek'
}

/**
 * The anchor a released gesture should settle on.
 *
 * Two regimes, because they answer different questions:
 *
 *  SLOW RELEASE — "where is it?" Clamp away the elastic overshoot, project the
 *  release point forward with `velocity`, and take the nearest anchor. Position
 *  dominates, and a slow drag can settle back on the anchor it started from,
 *  which is what a user who nudged and changed their mind expects.
 *
 *  FLICK (|velocity| >= threshold) — "where was it thrown?" A deliberate flick
 *  always advances at least one anchor in the direction it was thrown, and only
 *  carries further when the projection points that way too. Without the
 *  guaranteed step, a fast flick whose short projection still rounds to the
 *  starting anchor is silently swallowed: the sheet looks stuck under the one
 *  gesture the user was most confident about.
 *
 * The guaranteed step clamps at both ends, so a flick at peek stays at peek
 * rather than snapping past the floor of the range.
 */
export function resolveSheetAnchor({
  offset,
  velocity,
  offsets,
  projectionSeconds = SHEET_PROJECTION_SECONDS,
  flickVelocity = SHEET_FLICK_VELOCITY,
}: SheetSnapInput): SheetAnchor {
  const from = clampOffset(offset, offsets)
  const speed = Number.isFinite(velocity) ? velocity : 0
  const projected = from + speed * projectionSeconds

  if (Math.abs(speed) >= flickVelocity) {
    // Up (+1) travels towards `full`; down (-1) towards `peek`.
    const step = speed < 0 ? 1 : -1
    const currentIndex = SHEET_ANCHOR_ORDER.indexOf(nearestAnchor(from, offsets))
    const projectedIndex = SHEET_ANCHOR_ORDER.indexOf(nearestAnchor(projected, offsets))
    const steppedIndex = currentIndex + step
    const chosen =
      step > 0
        ? Math.max(steppedIndex, projectedIndex)
        : Math.min(steppedIndex, projectedIndex)
    return anchorAt(chosen)
  }

  return nearestAnchor(projected, offsets)
}

/** Next anchor for a tap on the handle: peek → mid → full → peek. */
export function nextSheetAnchor(anchor: SheetAnchor): SheetAnchor {
  const index = SHEET_ANCHOR_ORDER.indexOf(anchor)
  return SHEET_ANCHOR_ORDER[(index + 1) % SHEET_ANCHOR_ORDER.length] ?? 'peek'
}

/* -------------------------------------------------------------------------
   Underlay
   -------------------------------------------------------------------------
   The map beneath the sheet recedes rather than sitting still. All four
   values below are read from the *same* progress value as the sheet position,
   so the recede is continuous through a drag instead of snapping at the end.
   ------------------------------------------------------------------------- */

/** How far the map shrinks at full. Deliberately small — this is depth, not a zoom. Matches mockup target. */
export const UNDERLAY_SCALE_AT_FULL = 0.96
/** Corner radius (px) the map gains at full. Increased to 20 for visible rounded strip per mockup. */
export const UNDERLAY_RADIUS_AT_FULL = 20
/** Darkness laid over the map at full, so it reads as pushed back, not just smaller. 0.36 for stronger veil per mockup. */
export const UNDERLAY_VEIL_AT_FULL = 0.36
/** Opacity of the inset shadow the sheet casts up onto the map at full. */
export const UNDERLAY_SHADOW_AT_FULL = 0.9

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return clamp(value, 0, 1)
}

/**
 * Normalised sheet progress: 0 at peek, 1 at full.
 *
 * This is the `animatedIndex` equivalent — everything that reacts to the sheet
 * (map recede, chrome fade, sheet's own readouts) reads this one number.
 */
/**
 * Should a click on the sheet handle be ignored because it is the tail of a
 * drag?
 *
 * Only for pointer-originated clicks. `MouseEvent.detail` is 0 for activation
 * that did not come from a pointer — keyboard `Enter`/`Space` on the focused
 * button, assistive tech, `element.click()` — and those must always work, or a
 * keyboard user is locked out of the handle the moment anything has been
 * dragged. Found in the browser pass: the sheet was dragged, the handle was
 * activated with the keyboard, and nothing happened.
 */
export function isDragTail(didDrag: boolean, detail: number): boolean {
  return didDrag && detail !== 0
}

export function underlayProgress(offset: number, offsets: SheetOffsets): number {
  const span = offsets.peek - offsets.full
  if (!isPositiveNumber(span)) return 0
  // Offset *decreases* as the sheet rises, so progress is measured from the
  // peek end: peek → 0, full → 1. Getting this backwards is not subtle — the
  // map would shrink at peek and grow as the sheet closes over it.
  return clamp01((offsets.peek - clampOffset(offset, offsets)) / span)
}

export function underlayScale(progress: number): number {
  return 1 - (1 - UNDERLAY_SCALE_AT_FULL) * clamp01(progress)
}

export function underlayRadius(progress: number): number {
  return UNDERLAY_RADIUS_AT_FULL * clamp01(progress)
}

export function underlayVeil(progress: number): number {
  return UNDERLAY_VEIL_AT_FULL * clamp01(progress)
}

export function underlayShadow(progress: number): number {
  return UNDERLAY_SHADOW_AT_FULL * clamp01(progress)
}

/**
 * Opacity for the chrome that floats over the map (legend chips, instruments).
 *
 * It fades out *before* the mid anchor rather than under the sheet, so nothing
 * is ever half-covered: floating UI should either be fully over the map or not
 * on screen at all.
 */
export function chromeOpacity(progress: number, fadeUntil = 0.35): number {
  return 1 - clamp01(clamp01(progress) / fadeUntil)
}

/**
 * Opacity for the header — fades later than chrome, so it stays fully visible
 * at mid/peek and only disappears at full. This fixes stale-chrome in both
 * directions: at full it's hidden (with pointer-events none), but when dragged
 * back down from full to mid/peek it fades back in promptly rather than staying
 * invisible or fading late.
 *
 * Fully visible until 65% progress (which is past mid at 0.48), then fades to
 * 0 by 100% (full) with smoothstep easing so a fast flick peek→full (skipping
 * mid) doesn't look like a glitch — the fade is spread over 35% of travel
 * (0.65→1.0) with S-curve easing, not an abrupt linear cut in the last 30%.
 *
 * Safety margin analysis (tested at heights 300-1366):
 * - mid progress is constant 0.4795 for all viewport heights (0.35/0.73), because
 *   sheetOffsets uses same ratios: peek 0.85h, mid 0.5h, full 0.12h, span 0.73h,
 *   progress_mid = (0.85-0.5)/0.73 = 0.4795. So no height pushes mid above threshold.
 * - With 0.6 threshold, margin = 0.12 = 8.8% viewport = 35px @400px, 58px @667px,
 *   26px @300px keyboard — a bit tight on very short phones.
 * - With 0.65 threshold, margin = 0.1705 = 12.4% viewport = 50px @400px, 83px @667px,
 *   37px @300px keyboard — more comfortable, still prompt fade-in by 65%,
 *   and fade range 0.35 vs 0.40 (duration ~102ms vs 116ms) still smooth with
 *   5+ intermediate frames, not jarring.
 * - Original 0.7 threshold had margin 0.22 = 16% viewport = 64px @400, 107px @667,
 *   but fade range only 0.30 (87ms) more abrupt.
 * - 0.65 is a good compromise: comfortable margin on small phones, smooth fade,
 *   prompt fade-in by 65% when dragging down from full.
 *
 * - smoothstep t*t*(3-2*t) makes fade start gently, accelerate mid, then ease
 *   out near full — less jarring during fast spring (stiffness 420) where
 *   peek→full settles in ~300ms; fade now lasts ~102ms with S-curve.
 * - For reduced-motion, progress jumps instantly (offsetY.jump), so opacity
 *   swaps instantly 1→0 at same 0.65 threshold with no animated fade, consistent
 *   with rest of sheet (spring disabled, jump).
 *
 * So mid/peek = 1, full = 0, prompt fade-in by 65% when dragging down.
 */
export function headerOpacity(progress: number): number {
  const p = clamp01(progress)
  const t = clamp01((p - 0.65) / 0.35)
  // smoothstep for less jarring dismissal, with comfortable margin for mid
  const smooth = t * t * (3 - 2 * t)
  return 1 - smooth
}
