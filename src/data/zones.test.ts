import { describe, expect, it } from 'vitest'
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

  it('keeps the two Honda Bay zones from overlapping', () => {
    const inner = SEED_ZONES.find((z) => z.id === 'honda-inner')!
    const outer = SEED_ZONES.find((z) => z.id === 'honda-outer')!
    const innerMax = Math.max(...inner.polygon.map(([lat]) => lat))
    const outerMin = Math.min(...outer.polygon.map(([lat]) => lat))
    expect(outerMin).toBeGreaterThan(innerMax)
  })
})

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
