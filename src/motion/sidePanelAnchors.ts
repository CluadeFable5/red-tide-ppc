/**
 * Anchor maths for the two-state advisory drawer.
 *
 * WHY THIS FILE EXISTS — AND WHY IT IS A MIRROR, NOT A REUSE
 * -----------------------------------------------------------
 * The advisory-signal gauge card (top-left of the map, under the fixed status
 * key) collapses horizontally like a native drawer: `open` ↔ `collapsed`.
 * The feel target is the zone sheet's snap — velocity-aware, with a
 * guaranteed flick step — but the sheet's controller (`sheetAnchors.ts` /
 * `useZoneSheet.ts`) cannot be reused directly:
 *
 *   - its offsets are derived from *viewport-height complements* for a
 *     viewport-tall panel pinned to the top; the drawer's collapsed offset
 *     derives from the gauge card's own measured width;
 *   - its sign convention is Y (`positive = downward = towards peek`) with
 *     three anchors and underlay progress; the drawer is X (`positive =
 *     rightward = towards open`) with two anchors and no underlay;
 *   - forcing the drawer through the sheet's types would mean sign-flipping
 *     adapters around every call, which is exactly how a snap direction gets
 *     quietly inverted. (The sheet files were likewise frozen at the time —
 *     this interaction could not risk them. The bottom sheet has since been
 *     removed entirely; this module is the pattern's surviving home.)
 *
 * So this module re-implements the *pattern* (project-then-snap, flick
 * guarantee, clamp-before-project) with X semantics, keeps the same tuning
 * constants so the two gestures feel like one app, and owns `isDragTail` —
 * the axis-agnostic drag-tail guard defined at the bottom of this file.
 *
 * Like the sheet maths, everything here is pure arithmetic with no `motion`
 * and no DOM imports, for the same reason: snap branches are unit-tested
 * rather than eyeballed on a phone — see `sidePanelAnchors.test.ts`.
 *
 * COORDINATE SYSTEM
 * -----------------
 * Offsets are the gauge card track's `translateX` in px. The track slides
 * inside a clip window pinned to the left edge (see `AdvisoryDrawer.tsx`):
 *
 *   offset = 0          → card fully visible (the `open` rest position)
 *   offset = collapsed  → card slid fully out of the window to the left; the
 *                         window itself has shrunk to width 0, so only the
 *                         grab tab — a static sibling of the window — shows.
 *
 * `collapsed` is always exactly `-cardWidth`; `open` is always 0. The clip
 * window's width is derived from the SAME motion value as the track's
 * position (`drawerWindowWidth`), so the card can never paint outside the
 * window bounds at any drag position — mid-drag clipping is structural, not
 * something the viewport edge has to provide.
 */

export type SidePanelState = 'open' | 'collapsed'

/**
 * Which screen edge the panel is pinned to.
 *
 * `left`  — the advisory drawer's original orientation: `open` is 0 and
 *   `collapsed` is `-width` (the track slides leftwards out of the window).
 * `right` — the top-right control column's orientation: `open` is 0 and
 *   `collapsed` is `+width` (the track slides rightwards into the edge).
 *
 * The state ORDER is unchanged — `collapsed` still sorts before `open` — so
 * every search/tie-break rule below is identical on both edges; only the
 * sign of the collapsed offset and the direction a flick must travel differ,
 * and both are derived from the offsets themselves rather than restated.
 */
export type SidePanelEdge = 'left' | 'right'

/** Left-to-right. Also the order the snap search uses, which decides ties. */
export const SIDE_PANEL_STATE_ORDER: readonly SidePanelState[] = [
  'collapsed',
  'open',
]

/**
 * Gauge card width assumed when layout is unavailable (jsdom, SSR).
 *
 * Only the collapsed offset derives from it, and only until the first real
 * measurement lands — `useSidePanel` re-pins to the measured offset on mount.
 * It MUST match the gauge card's rendered width (`w-[172px]` in
 * `AdvisoryDrawer.tsx`): the collapsed offset is exactly `-cardWidth`, and a
 * mismatch would leave a sliver of card visible (or over-tuck, harmlessly).
 */
export const SIDE_PANEL_FALLBACK_WIDTH = 172

/**
 * How far a release velocity is allowed to *carry* the panel, in seconds.
 *
 * Same value as the sheet's projection (`SHEET_PROJECTION_SECONDS`): the two
 * gestures should feel like one physics system. The drawer's travel is shorter
 * (~230px vs ~580px), so a flick carries relatively further here — which is
 * what you want from a two-state drawer: flicks are decisive, slow drags
 * settle where they are.
 */
export const SIDE_PANEL_PROJECTION_SECONDS = 0.2

/**
 * Above this release speed (px/s) the gesture is a deliberate flick rather
 * than a slow drag, and the snap is not allowed to ignore its direction.
 *
 * Same value as `SHEET_FLICK_VELOCITY`, for the same reason as above: one
 * flick threshold across the app, well below a deliberate swipe
 * (~1000-2000 px/s on mobile) but above accidental fast drags.
 */
export const SIDE_PANEL_FLICK_VELOCITY = 500

/** Panel offset in px at each state. `open` is 0, `collapsed` is negative. */
export type SidePanelOffsets = Record<SidePanelState, number>

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Offsets for a measured card width. Degenerate widths (unmounted,
 * jsdom, SSR) fall back so the collapsed offset is always a sane non-zero
 * number, never NaN or 0 (0 would make both anchors coincide and the drawer
 * unsnappable).
 *
 * On the `left` edge `collapsed` is `-width`; on the `right` edge it is
 * `+width` — the track slides into its own edge either way.
 */
export function sidePanelOffsets(
  cardWidth: number,
  edge: SidePanelEdge = 'left',
  fallbackWidth: number = SIDE_PANEL_FALLBACK_WIDTH,
): SidePanelOffsets {
  const fallback =
    Number.isFinite(fallbackWidth) && fallbackWidth > 0
      ? fallbackWidth
      : SIDE_PANEL_FALLBACK_WIDTH
  const width =
    Number.isFinite(cardWidth) && cardWidth > 0 ? cardWidth : fallback
  return {
    open: 0,
    collapsed: edge === 'left' ? -width : width,
  }
}

/**
 * Width of the drawer's clip window for a card width and track offset.
 *
 * The window shrinks in lockstep with the track: at `open` it fits the whole
 * card, at `collapsed` it is 0, and mid-drag it is exactly the visible
 * remainder — so the card is continuously clipped by the window at every
 * drag position, including elastic overshoot (clamped at both ends). The
 * drawer derives this from the same motion value that positions the track,
 * which is what makes "no content outside the visible bounds" structural.
 *
 * `left`  — track offset is 0..-width, so the remainder is `width + x`.
 * `right` — track offset is 0..+width, so the remainder is `width - x`.
 */
export function drawerWindowWidth(
  cardWidth: number,
  offset: number,
  edge: SidePanelEdge = 'left',
): number {
  const width =
    Number.isFinite(cardWidth) && cardWidth > 0
      ? cardWidth
      : SIDE_PANEL_FALLBACK_WIDTH
  const x = Number.isFinite(offset) ? offset : 0
  const remainder = edge === 'left' ? width + x : width - x
  return Math.min(Math.max(remainder, 0), width)
}

/** Clamp an offset into the draggable range (collapsed at one end, open at the other). */
export function clampSideOffset(
  offset: number,
  offsets: SidePanelOffsets,
): number {
  if (!Number.isFinite(offset)) return offsets.open
  // Sign-agnostic: `collapsed` is the smaller offset on a left-drawer and the
  // larger on a right-drawer, so the range is read off the offsets rather
  // than assumed.
  return clamp(
    offset,
    Math.min(offsets.collapsed, offsets.open),
    Math.max(offsets.collapsed, offsets.open),
  )
}

/**
 * State whose offset is closest to `offset`.
 *
 * Ties resolve to `collapsed` because the iteration order is left-to-right
 * and the comparison is strict — the same rule as the sheet, where an exact
 * midpoint must not silently prefer covering the map.
 */
export function nearestSidePanelState(
  offset: number,
  offsets: SidePanelOffsets,
  candidates: readonly SidePanelState[] = SIDE_PANEL_STATE_ORDER,
): SidePanelState {
  let best: SidePanelState = candidates[0] ?? 'open'
  let bestDistance = Number.POSITIVE_INFINITY

  for (const state of candidates) {
    const distance = Math.abs(offsets[state] - offset)
    if (distance < bestDistance) {
      bestDistance = distance
      best = state
    }
  }

  return best
}

export interface SidePanelSnapInput {
  /** Panel offset at the moment of release (px, may include elastic overshoot). */
  offset: number
  /** Release velocity in px/s, positive = rightward = towards open. */
  velocity: number
  offsets: SidePanelOffsets
  /** Override for tests / tuning. */
  projectionSeconds?: number
  flickVelocity?: number
}

/** Safe accessor for a state index, clamped to the ends of the range. */
function stateAt(index: number): SidePanelState {
  const clamped = clamp(index, 0, SIDE_PANEL_STATE_ORDER.length - 1)
  return SIDE_PANEL_STATE_ORDER[clamped] ?? 'open'
}

/**
 * The state a released gesture should settle on.
 *
 * Two regimes, mirroring the retired sheet resolver:
 *
 *  SLOW RELEASE — "where is it?" Clamp away the elastic overshoot, project the
 *  release point forward with `velocity`, and take the nearest state. A slow
 *  drag can settle back where it started, which is what a user who nudged and
 *  changed their mind expects.
 *
 *  FLICK (|velocity| >= threshold) — "where was it thrown?" A deliberate flick
 *  always advances to the state it was thrown towards. With only two states
 *  that is simply the flick's direction, clamped at the ends so a flick past
 *  an end rest stays put rather than snapping past the range.
 */
export function resolveSidePanelAnchor({
  offset,
  velocity,
  offsets,
  projectionSeconds = SIDE_PANEL_PROJECTION_SECONDS,
  flickVelocity = SIDE_PANEL_FLICK_VELOCITY,
}: SidePanelSnapInput): SidePanelState {
  const from = clampSideOffset(offset, offsets)
  const speed = Number.isFinite(velocity) ? velocity : 0
  const projected = from + speed * projectionSeconds

  if (Math.abs(speed) >= flickVelocity) {
    // Which state a positive velocity moves towards depends on the pinned
    // edge: a left-drawer rests `open` at the larger offset (0) and tucks
    // negative, a right-drawer tucks positive, so `collapsed` holds the
    // larger offset there. Derived from the offsets — never restated by the
    // caller, so a mirrored drawer cannot silently invert the flick map.
    const openIsHigh = offsets.open >= offsets.collapsed
    const step = (speed > 0 ? 1 : -1) * (openIsHigh ? 1 : -1)
    const currentIndex = SIDE_PANEL_STATE_ORDER.indexOf(
      nearestSidePanelState(from, offsets),
    )
    const projectedIndex = SIDE_PANEL_STATE_ORDER.indexOf(
      nearestSidePanelState(projected, offsets),
    )
    const steppedIndex = currentIndex + step
    const chosen =
      step > 0
        ? Math.max(steppedIndex, projectedIndex)
        : Math.min(steppedIndex, projectedIndex)
    return stateAt(chosen)
  }

  return nearestSidePanelState(projected, offsets)
}

/** The other state — what a tap on the grab tab switches to. */
export function toggleSidePanelState(state: SidePanelState): SidePanelState {
  return state === 'open' ? 'collapsed' : 'open'
}

/**
 * Should a click on a grab tab or strip button be ignored because it is the
 * tail of a drag?
 *
 * Only for pointer-originated clicks. `MouseEvent.detail` is 0 for activation
 * that did not come from a pointer — keyboard `Enter`/`Space` on the focused
 * button, assistive tech, `element.click()` — and those must always work, or
 * a keyboard user is locked out of the tab the moment anything has been
 * dragged. Found in the browser pass: a drawer was dragged, the handle was
 * activated with the keyboard, and nothing happened. Axis-agnostic — both
 * right-edge drawers share it (it arrived here from the retired bottom-sheet
 * maths, where the same guard protected vertical drags).
 */
export function isDragTail(didDrag: boolean, detail: number): boolean {
  return didDrag && detail !== 0
}
