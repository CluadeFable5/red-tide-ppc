import { describe, expect, it } from 'vitest'
import {
  containsNestedArrays,
  normalizePolygon,
  toFirestorePolygon,
} from '../lib/firestoreMapping'
import { COASTLINE_RUNS } from './coastline'
import { MAP_CENTER, SEED_ZONES, zonesBoundingBox } from './zones'

/**
 * Sanity checks on the hand-drawn polygons. These are approximate by design,
 * but they must still be sane: enough vertices, real coordinates, inside the
 * Puerto Princesa area, and starting `safe`.
 */

describe('SEED_ZONES', () => {
  it('seeds between 4 and 6 zones, all starting safe', () => {
    expect(SEED_ZONES.length).toBeGreaterThanOrEqual(4)
    expect(SEED_ZONES.length).toBeLessThanOrEqual(6)
    for (const zone of SEED_ZONES) {
      expect(zone.status).toBe('safe')
    }
  })

  it('gives every zone a unique id, a name and a description', () => {
    const ids = SEED_ZONES.map((zone) => zone.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const zone of SEED_ZONES) {
      expect(zone.name.length).toBeGreaterThan(3)
      expect(zone.description.length).toBeGreaterThan(10)
    }
  })

  it('draws every polygon with at least 3 plausible vertices', () => {
    for (const zone of SEED_ZONES) {
      expect(zone.polygon.length, `${zone.id} needs ≥3 points`).toBeGreaterThanOrEqual(3)

      for (const [lat, lng] of zone.polygon) {
        // Puerto Princesa coastal waters sit in this box.
        expect(lat, `${zone.id} lat ${lat}`).toBeGreaterThan(9.5)
        expect(lat, `${zone.id} lat ${lat}`).toBeLessThan(10.4)
        expect(lng, `${zone.id} lng ${lng}`).toBeGreaterThan(118.5)
        expect(lng, `${zone.id} lng ${lng}`).toBeLessThan(119.1)
      }
    }
  })

  it('is not storable as-is: raw tuple polygons contain nested arrays', () => {
    // Documents why scripts/seed.ts must serialize before writing: Firestore
    // rejects arrays-of-arrays, which is exactly what [lat, lng] tuples are.
    // This is the shape that broke `npm run seed` against a live project.
    for (const zone of SEED_ZONES) {
      expect(containsNestedArrays(zone.polygon), `${zone.id} raw shape`).toBe(
        true,
      )
    }
  })

  it('becomes Firestore-storable once serialized, and reads back intact', () => {
    for (const zone of SEED_ZONES) {
      const stored = toFirestorePolygon(zone.polygon)
      expect(
        containsNestedArrays(stored),
        `${zone.id} stored shape must have no nested arrays`,
      ).toBe(false)
      expect(normalizePolygon(stored)).toEqual(zone.polygon)
    }
  })

  it('keeps every pair of zones from overlapping', () => {
    // The zones hug the coast and interlock (honda-inner / honda-outer now
    // span overlapping latitudes by design — inner sits inside the outer's
    // embayment), so a bounding-box heuristic can no longer prove they are
    // disjoint. This checks the polygons properly: no edges crossing at an
    // interior point, no vertex of one strictly inside the other. Zones that
    // merely share a boundary vertex/edge (they tile, see zones.ts) pass.
    for (let i = 0; i < SEED_ZONES.length; i++) {
      for (let j = i + 1; j < SEED_ZONES.length; j++) {
        const a = SEED_ZONES[i]
        const b = SEED_ZONES[j]
        expect(
          polygonsOverlap(a.polygon, b.polygon),
          `${a.id} and ${b.id} must not overlap`,
        ).toBe(false)
      }
    }
  })

  it('anchors every zone at the shoreline', () => {
    // Regression guard for the original bug: zones floating in open water,
    // disconnected from the coast they monitor. Each value is a real
    // OpenStreetMap coastline node on that zone's shore (retrieved 2026-09
    // via Overpass; see the header of zones.ts for the way ids). Each polygon
    // must have at least one vertex within ~250 m of its shore node.
    const shoreNodes: Record<string, [number, number]> = {
      'pp-bay': [9.7444, 118.7360], // city waterfront S end (way 4247188)
      'sta-lourdes': [9.8430624, 118.7437516], // Sta. Lourdes pier tip (62049956)
      'honda-inner': [9.8510028, 118.744658], // mainland shore N of pier
      'honda-outer': [9.9303358, 118.7543035], // Honda Bay mouth, W shore (1530271755)
      binuatan: [9.9400388, 118.8206470], // NE coast S end (62049965)
      sabang: [10.2098884, 118.8676876], // Sabang shore W end (61557844)
    }
    for (const zone of SEED_ZONES) {
      const shore = shoreNodes[zone.id]
      expect(shore, `${zone.id} needs a shore fixture`).toBeDefined()
      const minM = Math.min(...zone.polygon.map((p) => metersBetween(p, shore)))
      expect(
        minM,
        `${zone.id} is ${minM.toFixed(0)} m from its shoreline node — too far, it must touch land`,
      ).toBeLessThan(250)
    }
  })

  it('draws each zone as a simple polygon (no self-intersections)', () => {
    // A band that doubles back over itself renders as a jagged blade and
    // breaks area/containment reasoning. Adjacent-edge sharing and shared
    // boundary vertices are fine; proper crossings are not.
    for (const zone of SEED_ZONES) {
      const ring = zone.polygon
      const n = ring.length
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (j === i + 1 || (i === 0 && j === n - 1)) continue
          const crosses = segmentsCross(
            ring[i],
            ring[(i + 1) % n],
            ring[j],
            ring[(j + 1) % n],
          )
          expect(
            crosses,
            `${zone.id} edge ${i} crosses edge ${j} — polygon is not simple`,
          ).toBe(false)
        }
      }
    }
  })

  it('keeps every landward edge within 20 m of the real OSM coastline', () => {
    // THE regression test for the recurring "polygons don't hug the shoreline"
    // bug. Both failure modes — sparse vertices whose chords cut across land,
    // and edges floating in a gap offshore — show up the same way: points on
    // the landward edge far from the real coastline. So measure exactly that:
    // densely sample the landward edge of every polygon and assert every
    // sample lies within tolerance of the zone's real OSM coastline node run
    // (src/data/coastline.ts, generated from the OSM/Overpass fetch).
    //
    //   ≤ 20 m  — the band's landward edge hugs the real coast
    //   ≥ 8 landward vertices in the run, and no vertex ambiguously between
    //           the coast and the seaward edge, so a strip that drifts
    //           offshore wholesale fails here too (its landward run vanishes).
    const TOLERANCE_M = 20
    const LANDWARD_MAX_M = 60 // vertices this close to the coast = landward
    const SEAWARD_MIN_M = 150 // vertices this far out = seaward edge
    const MIN_LANDWARD_VERTICES = 20

    // distance from p to the zone's coastline run — an OPEN polyline, so no
    // wrap-around segment (a closing chord would sit offshore and mask drift)
    const distToCoast = (p: [number, number], coast: [number, number][]) => {
      let min = Infinity
      for (let i = 0; i < coast.length - 1; i++) {
        const d = distToSegmentM(p, coast[i], coast[i + 1])
        if (d < min) min = d
      }
      return min
    }

    for (const zone of SEED_ZONES) {
      const coast = COASTLINE_RUNS[zone.id]
      expect(coast, `${zone.id} has no coastline reference run`).toBeDefined()

      const dists = zone.polygon.map((p) => distToCoast(p, coast!))
      const isLandward = dists.map((d) => d <= LANDWARD_MAX_M)

      // no ambiguous vertices: every vertex is clearly coast-side or seaward
      const ambiguous = dists.filter((d) => d > LANDWARD_MAX_M && d < SEAWARD_MIN_M)
      expect(
        ambiguous,
        `${zone.id} has ${ambiguous.length} vertices neither on the coast nor clearly offshore (${ambiguous.slice(0, 3).map((d) => d.toFixed(0)).join(', ')} m)`,
      ).toHaveLength(0)

      // the landward edge = maximal cyclic run of landward vertices
      let best = { start: -1, len: 0 }
      const n = zone.polygon.length
      for (let start = 0; start < n; start++) {
        if (isLandward[(start - 1 + n) % n]) continue // not a run start
        let len = 0
        while (len < n && isLandward[(start + len) % n]) len++
        if (len > best.len) best = { start, len }
      }
      expect(
        best.len,
        `${zone.id} landward run has only ${best.len} coast-side vertices — the landward edge must be a dense trace of the coastline`,
      ).toBeGreaterThanOrEqual(MIN_LANDWARD_VERTICES)

      // densely sample the landward run's edges (k+1 < len: the edge from the
      // run's last vertex to the first seaward vertex is the end cap, not the
      // landward edge)
      let worst = { d: -1, at: '' }
      for (let k = 0; k + 1 < best.len; k++) {
        const a = zone.polygon[(best.start + k) % n]
        const b = zone.polygon[(best.start + k + 1) % n]
        const steps = Math.max(1, Math.ceil(metersBetween(a, b) / 8))
        for (let s = 0; s <= steps; s++) {
          const p: [number, number] = [
            a[0] + ((b[0] - a[0]) * s) / steps,
            a[1] + ((b[1] - a[1]) * s) / steps,
          ]
          const d = distToCoast(p, coast!)
          if (d > worst.d) worst = { d, at: `(${p[0].toFixed(5)}, ${p[1].toFixed(5)})` }
        }
      }
      expect(
        worst.d,
        `${zone.id} landward edge strays ${worst.d.toFixed(1)} m from the real coastline near ${worst.at} — it must hug the shore (chords cutting across land or a floating offshore gap both fail this)`,
      ).toBeLessThanOrEqual(TOLERANCE_M)
    }
  })
})

// --------------------------------------------------------------------------
// Small planar geometry helpers. At ~10 km scale and ~10° N, treating
// [lat, lng] as plane coordinates is accurate to well under the tolerances
// these tests use.
// --------------------------------------------------------------------------

type Pt = [number, number]

function orient(a: Pt, b: Pt, c: Pt): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const eps = 1e-9
  return v > eps ? 1 : v < -eps ? -1 : 0
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  // b collinear with a-p and within the bounding box
  return (
    Math.min(a[0], p[0]) <= b[0] + 1e-12 &&
    b[0] <= Math.max(a[0], p[0]) + 1e-12 &&
    Math.min(a[1], p[1]) <= b[1] + 1e-12 &&
    b[1] <= Math.max(a[1], p[1]) + 1e-12
  )
}

function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const o1 = orient(p1, p2, q1)
  const o2 = orient(p1, p2, q2)
  const o3 = orient(q1, q2, p1)
  const o4 = orient(q1, q2, p2)
  return o1 * o2 < 0 && o3 * o4 < 0
}

function pointStrictlyInside(p: Pt, ring: Pt[]): boolean {
  // boundary points never count as inside
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (orient(a, p, b) === 0 && onSegment(a, p, b)) return false
  }
  let inside = false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    // standard ray cast along +lng: count lat-edge crossings of the ray
    if (a[0] > p[0] !== b[0] > p[0]) {
      const lngAt = a[1] + ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0])
      if (p[1] < lngAt) inside = !inside
    }
  }
  return inside
}

function polygonsOverlap(a: Pt[], b: Pt[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a1, a2, b[j], b[(j + 1) % b.length])) return true
    }
    if (pointStrictlyInside(a1, b)) return true
  }
  for (const p of b) {
    if (pointStrictlyInside(p, a)) return true
  }
  return false
}

function metersBetween([lat1, lng1]: Pt, [lat2, lng2]: Pt): number {
  const latM = (lat1 - lat2) * 111_000
  const lngM = (lng1 - lng2) * 111_000 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  return Math.hypot(latM, lngM)
}

/** Distance from point p to segment [a, b], in metres (small-area planar). */
function distToSegmentM(p: Pt, a: Pt, b: Pt): number {
  const k = Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180))
  const px = (p[1] - a[1]) * 111_320 * k
  const py = (p[0] - a[0]) * 110_540
  const bx = (b[1] - a[1]) * 111_320 * k
  const by = (b[0] - a[0]) * 110_540
  const len2 = bx * bx + by * by
  let t = len2 > 0 ? (px * bx + py * by) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - t * bx, py - t * by)
}

describe('zonesBoundingBox', () => {
  it('returns null for an empty list', () => {
    expect(zonesBoundingBox([])).toBeNull()
  })

  it('contains every seeded vertex', () => {
    const box = zonesBoundingBox(SEED_ZONES.map((zone) => zone.polygon))!
    const [[minLat, minLng], [maxLat, maxLng]] = box

    for (const zone of SEED_ZONES) {
      for (const [lat, lng] of zone.polygon) {
        expect(lat).toBeGreaterThanOrEqual(minLat)
        expect(lat).toBeLessThanOrEqual(maxLat)
        expect(lng).toBeGreaterThanOrEqual(minLng)
        expect(lng).toBeLessThanOrEqual(maxLng)
      }
    }

    // The default centre must sit inside the covered area.
    expect(MAP_CENTER[0]).toBeGreaterThan(minLat)
    expect(MAP_CENTER[0]).toBeLessThan(maxLat)
    expect(MAP_CENTER[1]).toBeGreaterThan(minLng)
    expect(MAP_CENTER[1]).toBeLessThan(maxLng)
  })
})
