import { describe, expect, it } from 'vitest'
import {
  SHIPPING_DISCLAIMER,
  SHIPPING_FEATURES,
  SHIPPING_LAYER_LABEL,
  SHIPPING_LAYER_NOTE,
  SHIPPING_SOURCE,
  dms,
  type ShippingFeature,
} from './shipping'
import type { LatLng } from '../types'

/**
 * Checks on the shipping-lane overlay data (`shipping.ts`).
 *
 * The coordinates are a transcription of the Philippine Coast Guard's Puerto
 * Princesa Traffic Separation Scheme circular — so the tests assert exactly
 * what a transcription must: the published numbers come through verbatim, and
 * the published *stated* geometry (a 60 m separation zone, 400 m lanes, the
 * recommended courses) is actually consistent with the transcribed points.
 * A typo in any coordinate fails here instead of silently drawing a wrong
 * hazard line.
 */

/** Small-area planar distance in metres (accurate to well under a metre at
 * this scale and latitude — same model the zone tests use). */
function metersBetween([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const latM = (lat1 - lat2) * 111_000
  const lngM =
    (lng1 - lng2) * 111_000 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  return Math.hypot(latM, lngM)
}

/** Initial (true-course) bearing a→b, in degrees 0–360. */
function bearingDeg([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const φ1 = lat1 * (Math.PI / 180)
  const φ2 = lat2 * (Math.PI / 180)
  const Δλ = (lng2 - lng1) * (Math.PI / 180)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

/** Distance from p to the segment a–b, in metres. */
function distToSegment(p: LatLng, a: LatLng, b: LatLng): number {
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

function feature(id: string): ShippingFeature {
  const f = SHIPPING_FEATURES.find((f) => f.id === id)
  expect(f, `feature ${id} exists`).toBeDefined()
  return f!
}

/** Min distance from point p to any segment of a feature's polyline. */
function distanceToFeature(p: LatLng, f: ShippingFeature): number {
  let min = Infinity
  const pts = f.points
  const closed = f.kind !== 'lane-boundary' && f.kind !== 'hazard'
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const d = distToSegment(p, pts[i], pts[(i + 1) % pts.length])
    if (d < min) min = d
  }
  return min
}

describe('dms', () => {
  it('converts degrees-minutes-seconds the obvious way', () => {
    expect(dms(9, 42, 40)).toBeCloseTo(9.711111, 5)
    expect(dms(118, 46, 0)).toBe(118.76666666666667)
    expect(dms(9, 45, 1.2)).toBeCloseTo(9.750333, 5)
  })
})

describe('SHIPPING_FEATURES', () => {
  it('covers exactly the published features of the PPTSS circular', () => {
    expect(SHIPPING_FEATURES.map((f) => f.id).sort()).toEqual(
      [
        'fairway-buoy',
        'gideon-shoal-buoy',
        'inbound-lane-boundary',
        'outbound-lane-boundary',
        'precautionary-area',
        'separation-zone',
        'submerged-wreck',
      ].sort(),
    )
  })

  it('keeps every transcribed point inside Puerto Princesa Bay', () => {
    for (const f of SHIPPING_FEATURES) {
      for (const [lat, lng] of f.points) {
        // The corridor sits just off the city's port; nothing in the circular
        // leaves this box.
        expect(lat, `${f.id} lat`).toBeGreaterThan(9.6)
        expect(lat, `${f.id} lat`).toBeLessThan(9.8)
        expect(lng, `${f.id} lng`).toBeGreaterThan(118.6)
        expect(lng, `${f.id} lng`).toBeLessThan(118.85)
      }
    }
  })

  it('round-trips every point against its source DMS values', () => {
    for (const f of SHIPPING_FEATURES) {
      expect(f.sourceDms.length, `${f.id} dms count`).toBe(f.points.length)
      f.sourceDms.forEach((d, i) => {
        expect(f.points[i][0], `${f.id} point ${i} lat`).toBeCloseTo(
          dms(d[0], d[1], d[2]),
          10,
        )
        expect(f.points[i][1], `${f.id} point ${i} lng`).toBeCloseTo(
          dms(d[3], d[4], d[5]),
          10,
        )
      })
    }
  })

  it('transcribes the published coordinates verbatim', () => {
    const inbound = feature('inbound-lane-boundary')
    expect(inbound.points[0][0]).toBeCloseTo(dms(9, 42, 40), 10)
    expect(inbound.points[0][1]).toBeCloseTo(dms(118, 46, 0), 10)
    expect(inbound.points[1][0]).toBeCloseTo(dms(9, 43, 30), 10)
    expect(inbound.points[1][1]).toBeCloseTo(dms(118, 43, 55), 10)
    expect(inbound.course).toBe('292°T')

    const outbound = feature('outbound-lane-boundary')
    expect(outbound.points[0][0]).toBeCloseTo(dms(9, 43, 2), 10)
    expect(outbound.points[1][0]).toBeCloseTo(dms(9, 42, 12), 10)
    expect(outbound.course).toBe('112°T')

    const wreck = feature('submerged-wreck')
    expect(wreck.points[0][0]).toBeCloseTo(dms(9, 45, 1.2), 10)
    expect(wreck.points[0][1]).toBeCloseTo(dms(118, 43, 16), 10)
  })

  it('draws a separation zone whose short ends match the stated 60 m width', () => {
    const zone = feature('separation-zone')
    // points 1–4 and 2–3 are the two short ends (E and W respectively)
    const east = metersBetween(zone.points[0], zone.points[3])
    const west = metersBetween(zone.points[1], zone.points[2])
    expect(east, 'separation zone E end').toBeGreaterThan(55)
    expect(east, 'separation zone E end').toBeLessThan(70)
    expect(west, 'separation zone W end').toBeGreaterThan(55)
    expect(west, 'separation zone W end').toBeLessThan(70)
  })

  it('draws lane boundaries 400 m (±30 m) off the separation zone', () => {
    const zone = feature('separation-zone')
    for (const id of ['inbound-lane-boundary', 'outbound-lane-boundary']) {
      const lane = feature(id)
      // sample each boundary line and measure to the nearest zone edge
      const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const a = lane.points[0]
        const b = lane.points[1]
        const p: LatLng = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        return distanceToFeature(p, zone)
      })
      for (const d of samples) {
        expect(d, `${id} offset from the zone`).toBeGreaterThan(370)
        expect(d, `${id} offset from the zone`).toBeLessThan(430)
      }
    }
  })

  it('matches the published recommended courses (292°T in, 112°T out)', () => {
    const inbound = feature('inbound-lane-boundary')
    const inBearing = bearingDeg(inbound.points[0], inbound.points[1])
    expect(inBearing, 'inbound lane bearing').toBeGreaterThan(290)
    expect(inBearing, 'inbound lane bearing').toBeLessThan(294)

    const outbound = feature('outbound-lane-boundary')
    const outBearing = bearingDeg(outbound.points[0], outbound.points[1])
    expect(outBearing, 'outbound lane bearing').toBeGreaterThan(110)
    expect(outBearing, 'outbound lane bearing').toBeLessThan(114)
  })

  it('carries a fisher-facing note on every feature, without fake precision', () => {
    for (const f of SHIPPING_FEATURES) {
      expect(f.label.length, `${f.id} label`).toBeGreaterThan(5)
      expect(f.note, `${f.id} note`).toMatch(
        /\b(ship|ships|vessel|vessels|craft|boat|boats|shoal|water|anchor|fish|channel)s?\b/i,
      )
    }
    expect(SHIPPING_LAYER_LABEL).toBe('Shipping channel — do not cross')
    expect(SHIPPING_LAYER_NOTE).toMatch(/under 20 m/)
  })
})

describe('SHIPPING_SOURCE', () => {
  it('cites the Philippine Coast Guard circular, not OSM', () => {
    expect(SHIPPING_SOURCE.authority).toBe('Philippine Coast Guard')
    expect(SHIPPING_SOURCE.title).toMatch(/Puerto Princesa Traffic Separation Scheme/)
    expect(SHIPPING_SOURCE.chart).toMatch(/NAMRIA Chart Nr\. 4333/)
    expect(SHIPPING_SOURCE.url).toMatch(/^https:\/\/www\.coastguard\.gov\.ph\//)
    expect(SHIPPING_SOURCE.archivedUrl).toMatch(/^https:\/\/web\.archive\.org\//)
  })

  it('states plainly that the rendering is an unofficial transcription', () => {
    expect(SHIPPING_DISCLAIMER).toMatch(/[Uu]nofficial transcription/)
    expect(SHIPPING_DISCLAIMER).toMatch(/NAMRIA Chart Nr\. 4333/)
  })
})
