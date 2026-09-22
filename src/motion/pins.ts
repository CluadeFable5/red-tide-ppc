import type { LatLng } from '../types'

/**
 * Phase 3 pin maths. Reports only carry a `zoneId` (no coordinates), so a
 * report pin lands on the zone polygon's centroid — computed from the
 * existing zone data at render time; the data files are never touched.
 *
 * Pure functions, unit-tested — same policy as `mapMotion.ts`.
 */

/**
 * Area-weighted polygon centroid (shoelace). The pairs are treated as plain
 * 2D points — fine at coastal-zone scale, where the equirectangular
 * distortion is far below a pin's visual size. Degenerate (zero-area)
 * polygons fall back to the vertex mean instead of dividing by ~0.
 */
export function polygonCentroid(polygon: LatLng[]): LatLng {
  if (polygon.length === 0) return [0, 0]

  let area = 0
  let x = 0
  let y = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i]
    const [x2, y2] = polygon[(i + 1) % polygon.length]
    const cross = x1 * y2 - x2 * y1
    area += cross
    x += (x1 + x2) * cross
    y += (y1 + y2) * cross
  }

  if (Math.abs(area) < 1e-12) {
    const n = polygon.length
    return [
      polygon.reduce((sum, p) => sum + p[0], 0) / n,
      polygon.reduce((sum, p) => sum + p[1], 0) / n,
    ]
  }

  area /= 2
  return [x / (6 * area), y / (6 * area)]
}

/** Once per browser session, and never under prefers-reduced-motion. */
export const INTRO_GLIDE_SESSION_KEY = 'red-tide-ppc:intro-glide:v1'

/** Wide Palawan-scale opening frame the glide starts from. */
export const INTRO_GLIDE_WIDE_ZOOM = 8

/** The glide itself — long enough to read as an establishing shot. */
export const INTRO_GLIDE_SECONDS = 2.8
