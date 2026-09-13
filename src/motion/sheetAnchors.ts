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
 * These are the numbers briefed for the Google Maps pattern: a ~1/8 strip that
 * is only a handle plus one line of summary, a ~45% "detail" stop, and an ~85%
 * full list that leaves a strip of map visible so the recede is still legible.
 */
export const SHEET_VISIBLE_RATIO: Record<SheetAnchor, number> = {
  peek: 0.14,
  mid: 0.45,
  full: 0.85,
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
 */
export const SHEET_PROJECTION_SECONDS = 0.18

/**
 * Above this release speed (px/s) the gesture is a deliberate flick rather than
 * a slow drag, and the snap is not allowed to ignore its direction.
 *
 * Without this, a hard flick from peek can project to a position that is still
 * nearest to peek — the sheet visibly "sticks" under a fast gesture, which is
 * the single most common way a hand-rolled bottom sheet feels broken.
 */
export const SHEET_FLICK_VELOCITY = 480

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

/** How far the map shrinks at full. Deliberately small — this is depth, not a zoom. */
export const UNDERLAY_SCALE_AT_FULL = 0.96
/** Corner radius (px) the map gains at full. */
export const UNDERLAY_RADIUS_AT_FULL = 18
/** Darkness laid over the map at full, so it reads as pushed back, not just smaller. */
export const UNDERLAY_VEIL_AT_FULL = 0.34
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
