/**
 * Pure motion constants and helpers for the /map animations.
 *
 * No DOM, no Leaflet, no `motion` imports here — everything is unit-testable
 * arithmetic (same policy as `sidePanelAnchors.ts`). Anything that touches
 * the map instance lives in `Map.tsx`; anything that touches CSS lives in
 * `styles/map-motion.css`.
 *
 * HARD CONSTRAINTS HONOURED EVERYWHERE IN THIS PASS
 * -------------------------------------------------
 *  - only `transform`, `opacity` and cheap SVG paint properties
 *    (stroke-opacity, stroke-dashoffset) are animated — never filter,
 *    box-shadow or backdrop-filter;
 *  - `prefers-reduced-motion` means instant state changes: every duration
 *    here has a reduced-motion counterpart that jumps instead of animates;
 *  - every looping animation is paused while the camera moves
 *    (`MapLoopGate` toggles `.map-motion-paused` on the Leaflet container).
 */

/**
 * The one app spring (stiffness 420, damping 34, mass 0.85) — the same physics
 * the drawers snap with (`useSidePanel`), shared so the pill indicator, the
 * chevron morph and the drawer feel like one system. Declared here (not
 * imported from `useSidePanel`) because that module is frozen by convention;
 * the numbers deliberately match.
 */
export const APP_SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.85,
} as const

/** Zone load-in: one fade per polygon, ease-out. */
export const ZONE_LOAD_DURATION_MS = 500

/**
 * Per-zone stagger for the load-in. The brief allows 60-80ms; 70ms keeps the
 * whole 7-zone cascade under half a second after the last zone starts.
 */
export const ZONE_LOAD_STAGGER_MS = 70

/** Camera flight to a focused zone (seconds). Brief: 0.8-1.0s. */
export const FOCUS_FLIGHT_SECONDS = 0.9

/**
 * Advisory stroke pulse loop, seconds. Brief: 3-4s. Kept at the slow end —
 * this runs forever on safety-critical polygons and must never nag.
 */
export const ADVISORY_PULSE_SECONDS = 3.5

/**
 * Delay before zone `index` starts its load-in fade (ms).
 * Defensive about its input: jsdom and malformed renders can hand through
 * NaN/undefined indices, and a NaN delay would freeze the animation at
 * opacity 0 forever.
 */
export function zoneLoadDelayMs(index: number): number {
  if (!Number.isFinite(index) || index < 0) return 0
  return Math.floor(index) * ZONE_LOAD_STAGGER_MS
}

/** Padding (px) applied around a focused zone's flyToBounds. */
export interface FocusPadding {
  paddingTopLeft: [number, number]
  paddingBottomRight: [number, number]
}

/**
 * Right-hand reserve (px) for the open zone drawer on desktop: panel
 * (`min(100vw - 5rem, 23.75rem)` → 380px) + tab (44px) + column margins.
 */
export const DRAWER_RESERVE_OPEN = 420

/** Right-hand reserve when the drawer is collapsed: tab + margins only. */
export const DRAWER_RESERVE_COLLAPSED = 64

/** The drawer breakpoint, mirrored from `MapPage.initialZoneDrawerState`. */
export const DRAWER_BREAKPOINT_PX = 768

/**
 * Padding so a focused zone clears the floating chrome.
 *
 * There is no bottom sheet anymore — the drawers own the right edge instead —
 * so the reservation is horizontal at ≥768px (the drawer panel) and only the
 * header/pills strip on top plus the attribution pill at the bottom on every
 * width. The reservation is passed in (MapPage knows the drawer state); this
 * function just turns it into Leaflet's padding shape.
 */
export function focusPaddingFor(
  mapWidthPx: number,
  reserveRightPx: number,
): FocusPadding {
  const width = Number.isFinite(mapWidthPx) && mapWidthPx > 0 ? mapWidthPx : 0
  const reserve =
    Number.isFinite(reserveRightPx) && reserveRightPx > 0 ? reserveRightPx : 0

  // Top: header (~56px) + the fixed pills row; bottom: the OSM credit pill.
  const TOP_CLEARANCE = 72
  const BOTTOM_CLEARANCE = 56

  if (width < DRAWER_BREAKPOINT_PX) {
    // Phone: the drawer tucks itself when a zone is focused (see MapPage),
    // so nothing overlaps the map — small symmetric gutters only.
    return {
      paddingTopLeft: [16, TOP_CLEARANCE],
      paddingBottomRight: [16, BOTTOM_CLEARANCE],
    }
  }

  return {
    paddingTopLeft: [24, TOP_CLEARANCE],
    paddingBottomRight: [24 + reserve, BOTTOM_CLEARANCE],
  }
}
