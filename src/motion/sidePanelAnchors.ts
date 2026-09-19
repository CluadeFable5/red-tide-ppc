/**
 * Anchor maths for the two-state status side panel.
 *
 * WHY THIS FILE EXISTS — AND WHY IT IS A MIRROR, NOT A REUSE
 * -----------------------------------------------------------
 * The status panel (count pills + advisory-signal gauge, top-left of the map)
 * collapses horizontally like a native drawer: `open` ↔ `collapsed`. The feel
 * target is the zone sheet's snap — velocity-aware, with a guaranteed flick
 * step — but the sheet's controller (`sheetAnchors.ts` / `useZoneSheet.ts`)
 * cannot be reused directly:
 *
 *   - its offsets are derived from *viewport-height complements* for a
 *     viewport-tall panel pinned to the top; the drawer is a fixed-width card
 *     whose collapsed offset derives from its own measured width;
 *   - its sign convention is Y (`positive = downward = towards peek`) with
 *     three anchors and underlay progress; the drawer is X (`positive =
 *     rightward = towards open`) with two anchors and no underlay;
 *   - forcing the drawer through the sheet's types would mean sign-flipping
 *     adapters around every call, which is exactly how a snap direction gets
 *     quietly inverted. The sheet files are also frozen — this interaction
 *     must not risk them.
 *
 * So this module re-implements the *pattern* (project-then-snap, flick
 * guarantee, clamp-before-project) with X semantics, keeps the same tuning
 * constants so the two gestures feel like one app, and reuses `isDragTail`
 * from `sheetAnchors.ts` directly — that helper is axis-agnostic.
 *
 * Like the sheet maths, everything here is pure arithmetic with no `motion`
 * and no DOM imports, for the same reason: snap branches are unit-tested
 * rather than eyeballed on a phone — see `sidePanelAnchors.test.ts`.
 *
 * COORDINATE SYSTEM
 * -----------------
 * Offsets are `translateX` in px for a panel pinned to the *left* of the
 * viewport:
 *
 *   offset = 0          → fully visible (the `open` rest position)
 *   offset = collapsed  → tucked off-screen left, leaving only the grab tab
 *                         (`SIDE_PANEL_TAB_VISIBLE` px) reachable at the edge
 *
 * `collapsed` is always negative; `open` is always 0.
 */

export type SidePanelState = 'open' | 'collapsed'

/** Left-to-right. Also the order the snap search uses, which decides ties. */
export const SIDE_PANEL_STATE_ORDER: readonly SidePanelState[] = [
  'collapsed',
  'open',
]

/**
 * How much of the panel stays on screen when collapsed (px).
 *
 * This is the grab tab and nothing else. It MUST match the tab's rendered
 * width (`w-8` = 32px in `StatusPanel.tsx`): smaller and the tab clips,
 * larger and a sliver of dead card edge hangs on screen.
 */
export const SIDE_PANEL_TAB_VISIBLE = 32

/**
 * Panel width assumed when layout is unavailable (jsdom, SSR).
 *
 * Only the collapsed offset derives from it, and only until the first real
 * measurement lands — `useSidePanel` re-pins to the measured offset on mount.
 * Roughly: 172px gauge + pills overhang + 32px tab + gaps.
 */
export const SIDE_PANEL_FALLBACK_WIDTH = 264

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
 * Offsets for a measured panel width. Degenerate widths (unmounted, jsdom,
 * SSR) fall back to `SIDE_PANEL_FALLBACK_WIDTH` so the collapsed offset is
 * always a sane negative number, never NaN or 0 (0 would make both anchors
 * coincide and the panel unsnappable).
 */
export function sidePanelOffsets(panelWidth: number): SidePanelOffsets {
  const width =
    Number.isFinite(panelWidth) && panelWidth > SIDE_PANEL_TAB_VISIBLE
      ? panelWidth
      : SIDE_PANEL_FALLBACK_WIDTH
  return {
    open: 0,
    collapsed: -(width - SIDE_PANEL_TAB_VISIBLE),
  }
}

/** Clamp an offset into the draggable range (collapsed is the floor, open the ceiling). */
export function clampSideOffset(
  offset: number,
  offsets: SidePanelOffsets,
): number {
  if (!Number.isFinite(offset)) return offsets.open
  // `collapsed` has the smaller (negative) offset; `open` is 0.
  return clamp(offset, offsets.collapsed, offsets.open)
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
 * Two regimes, mirroring `resolveSheetAnchor`:
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
    // Right (+1) travels towards `open`; left (-1) towards `collapsed`.
    const step = speed > 0 ? 1 : -1
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
