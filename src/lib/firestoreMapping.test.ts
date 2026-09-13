import { describe, expect, it } from 'vitest'
import {
  mapReport,
  mapZone,
  normalizePolygon,
  normalizeReportStatus,
  normalizeZoneStatus,
  safeFileName,
  toMillis,
} from './firestoreMapping'

/**
 * These are the functions that absorb whatever Firestore actually hands back —
 * console-typed documents, GeoPoints, unresolved server timestamps. They run
 * only in the Firebase backend, so they get their own tests.
 */

describe('normalizeZoneStatus', () => {
  it('passes the three real statuses through', () => {
    expect(normalizeZoneStatus('safe')).toBe('safe')
    expect(normalizeZoneStatus('unconfirmed')).toBe('unconfirmed')
    expect(normalizeZoneStatus('advisory')).toBe('advisory')
  })

  it('falls back to safe for typos, casing and missing values', () => {
    expect(normalizeZoneStatus('Advisory')).toBe('safe')
    expect(normalizeZoneStatus('danger')).toBe('safe')
    expect(normalizeZoneStatus(undefined)).toBe('safe')
    expect(normalizeZoneStatus(null)).toBe('safe')
    expect(normalizeZoneStatus(1)).toBe('safe')
  })
})

describe('normalizeReportStatus', () => {
  it('passes real statuses through and defaults to pending', () => {
    expect(normalizeReportStatus('confirmed')).toBe('confirmed')
    expect(normalizeReportStatus('rejected')).toBe('rejected')
    expect(normalizeReportStatus('approved')).toBe('pending')
    expect(normalizeReportStatus(undefined)).toBe('pending')
  })
})

describe('toMillis', () => {
  it('handles every shape Firestore can produce', () => {
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(toMillis('2026-09-13T00:00:00.000Z')).toBe(
      Date.parse('2026-09-13T00:00:00.000Z'),
    )
    expect(toMillis({ seconds: 1_700_000_000, nanoseconds: 0 })).toBe(
      1_700_000_000_000,
    )
    expect(toMillis({ toMillis: () => 1_234_567_890 })).toBe(1_234_567_890)
  })

  it('uses "now" for an unresolved serverTimestamp or garbage', () => {
    const before = Date.now()
    expect(toMillis(null)).toBeGreaterThanOrEqual(before)
    expect(toMillis(undefined)).toBeGreaterThanOrEqual(before)
    expect(toMillis('not a date')).toBeGreaterThanOrEqual(before)
    expect(toMillis({})).toBeGreaterThanOrEqual(before)
  })

  it('ignores NaN and Infinity', () => {
    const before = Date.now()
    expect(toMillis(Number.NaN)).toBeGreaterThanOrEqual(before)
    expect(toMillis(Number.POSITIVE_INFINITY)).toBeGreaterThanOrEqual(before)
  })
})

describe('normalizePolygon', () => {
  it('reads plain [lat, lng] arrays', () => {
    expect(
      normalizePolygon([
        [9.7, 118.7],
        [9.8, 118.8],
      ]),
    ).toEqual([
      [9.7, 118.7],
      [9.8, 118.8],
    ])
  })

  it('reads GeoPoints and {lat, lng} objects from the console', () => {
    expect(
      normalizePolygon([
        { latitude: 9.7, longitude: 118.7 },
        { lat: 9.8, lng: 118.8 },
      ]),
    ).toEqual([
      [9.7, 118.7],
      [9.8, 118.8],
    ])
  })

  it('drops malformed entries instead of throwing', () => {
    expect(
      normalizePolygon([
        [9.7, 118.7],
        ['nope', 118.8],
        [9.9],
        null,
        'garbage',
      ]),
    ).toEqual([[9.7, 118.7]])
  })

  it('returns an empty list for anything that is not an array', () => {
    expect(normalizePolygon(undefined)).toEqual([])
    expect(normalizePolygon('9.7,118.7')).toEqual([])
    expect(normalizePolygon({ latitude: 9.7 })).toEqual([])
  })
})

describe('mapZone', () => {
  it('maps a complete document', () => {
    const zone = mapZone('honda-inner', {
      name: 'Honda Bay — Inner Islands',
      description: 'The inner cluster.',
      polygon: [[9.85, 118.77]],
      status: 'advisory',
      lastUpdated: { seconds: 1_700_000_000 },
    })

    expect(zone).toEqual({
      id: 'honda-inner',
      name: 'Honda Bay — Inner Islands',
      description: 'The inner cluster.',
      polygon: [[9.85, 118.77]],
      status: 'advisory',
      lastUpdated: 1_700_000_000_000,
    })
  })

  it('degrades a half-written document to safe defaults', () => {
    const zone = mapZone('broken', {})

    expect(zone.name).toBe('Unnamed zone')
    expect(zone.description).toBe('')
    expect(zone.polygon).toEqual([])
    expect(zone.status).toBe('safe')
    expect(zone.lastUpdated).toBeGreaterThan(0)
  })
})

describe('mapReport', () => {
  it('maps a complete document', () => {
    const report = mapReport('r1', {
      zoneId: 'pp-bay',
      description: 'Reddish water.',
      photoUrl: 'https://storage.example/x.jpg',
      submittedAt: 1_700_000_000_000,
      status: 'confirmed',
    })

    expect(report).toEqual({
      id: 'r1',
      zoneId: 'pp-bay',
      description: 'Reddish water.',
      photoUrl: 'https://storage.example/x.jpg',
      submittedAt: 1_700_000_000_000,
      status: 'confirmed',
    })
  })

  it('turns an empty photoUrl into null and defaults the status', () => {
    const report = mapReport('r2', { description: 'x' })

    expect(report.photoUrl).toBeNull()
    expect(report.zoneId).toBe('')
    expect(report.status).toBe('pending')
  })
})

describe('safeFileName', () => {
  it('keeps ordinary filenames intact', () => {
    expect(safeFileName('red-water.jpg')).toBe('red-water.jpg')
  })

  it('replaces spaces and punctuation with dashes', () => {
    // Runs of punctuation collapse to a single dash; the dash left before the
    // extension is expected and harmless.
    expect(safeFileName('my photo (1).jpg')).toBe('my-photo-1-.jpg')
    expect(safeFileName('red water!.JPG')).toBe('red-water-.JPG')
    expect(safeFileName('  spaced  out.png ')).toBe('spaced-out.png')
  })

  it('strips directory traversal from either slash style', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd')
    expect(safeFileName('..\\..\\evil.jpg')).toBe('evil.jpg')
  })

  it('never produces an empty name', () => {
    expect(safeFileName('')).toBe('photo.jpg')
    expect(safeFileName('///')).toBe('photo.jpg')
  })

  it('caps the length and stays URL-safe', () => {
    const long = `${'a'.repeat(200)}.jpg`
    const result = safeFileName(long)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result.endsWith('.jpg')).toBe(true)
    expect(result).toMatch(/^[a-zA-Z0-9._-]+$/)
  })

  it('transliterates accents and strips emoji', () => {
    const result = safeFileName('litrato 🌊 dagat.jpg')
    expect(result).toMatch(/^[a-zA-Z0-9._-]+$/)
    expect(result.includes(' ')).toBe(false)
  })
})
