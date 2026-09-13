import type { LatLng, Report, ReportStatus, Zone, ZoneStatus } from '../types'

/**
 * Pure mapping between raw Firestore documents and the app's domain types.
 *
 * Kept in its own module (and free of any `firebase/*` import) because it is
 * the code that has to absorb whatever shape the data actually arrives in:
 *
 *   - polygons entered in the console as GeoPoints instead of arrays;
 *   - `serverTimestamp()` values that are still null on the first snapshot;
 *   - statuses typed by hand into a document that are not in the union;
 *   - documents created before a field existed.
 *
 * Nothing here throws: a malformed field degrades to a safe default rather
 * than taking the whole map down.
 */

const ZONE_STATUSES: readonly ZoneStatus[] = ['safe', 'unconfirmed', 'advisory']
const REPORT_STATUSES: readonly ReportStatus[] = [
  'pending',
  'confirmed',
  'rejected',
]

/** Anything unrecognised is treated as `safe` — the least alarming default. */
export function normalizeZoneStatus(value: unknown): ZoneStatus {
  return ZONE_STATUSES.includes(value as ZoneStatus)
    ? (value as ZoneStatus)
    : 'safe'
}

export function normalizeReportStatus(value: unknown): ReportStatus {
  return REPORT_STATUSES.includes(value as ReportStatus)
    ? (value as ReportStatus)
    : 'pending'
}

/**
 * Firestore Timestamp, GeoPoint-ish object, ISO string, epoch number or
 * `null` (a locally-pending `serverTimestamp()`) → epoch milliseconds.
 */
export function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.toMillis === 'function') {
      return (record.toMillis as () => number)()
    }
    if (typeof record.seconds === 'number') return record.seconds * 1000
  }
  return Date.now()
}

/** Accepts `[[lat, lng], ...]` or `[{latitude, longitude}, ...]` (GeoPoint). */
export function normalizePolygon(value: unknown): LatLng[] {
  if (!Array.isArray(value)) return []
  const points: LatLng[] = []

  for (const item of value) {
    if (Array.isArray(item) && item.length >= 2) {
      const lat = Number(item[0])
      const lng = Number(item[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat, lng])
      continue
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>
      const lat = Number(record.latitude ?? record.lat)
      const lng = Number(record.longitude ?? record.lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat, lng])
    }
  }

  return points
}

/** A polygon vertex as Firestore stores it: an object, never a tuple. */
export interface FirestoreLatLng {
  lat: number
  lng: number
}

/**
 * The write-side counterpart of {@link normalizePolygon}.
 *
 * Firestore rejects nested arrays outright (`setDoc() called with invalid
 * data. Nested arrays are not supported`), so the domain `[lat, lng]` tuples
 * must never be written directly — that bug shipped once and killed
 * `npm run seed` against a live project. Each vertex becomes a `{lat, lng}`
 * object, which `normalizePolygon` reads back into a tuple for Leaflet.
 */
export function toFirestorePolygon(
  points: readonly LatLng[],
): FirestoreLatLng[] {
  return points.map(([lat, lng]) => ({ lat, lng }))
}

/**
 * True when an array appears directly inside another array anywhere in
 * `value` — the exact class of shape Firestore refuses on write. Not a full
 * reimplementation of the SDK's validator; just the one invariant that
 * matters here, for small acyclic documents like a seed payload. Arrays of
 * objects (including Firestore's `GeoPoint`/sentinel values) are fine.
 */
export function containsNestedArrays(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(
      (item) => Array.isArray(item) || containsNestedArrays(item),
    )
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsNestedArrays)
  }
  return false
}

export function mapZone(id: string, data: Record<string, unknown>): Zone {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Unnamed zone',
    description: typeof data.description === 'string' ? data.description : '',
    polygon: normalizePolygon(data.polygon),
    status: normalizeZoneStatus(data.status),
    lastUpdated: toMillis(data.lastUpdated),
  }
}

export function mapReport(id: string, data: Record<string, unknown>): Report {
  return {
    id,
    zoneId: typeof data.zoneId === 'string' ? data.zoneId : '',
    description: typeof data.description === 'string' ? data.description : '',
    photoUrl:
      typeof data.photoUrl === 'string' && data.photoUrl.length > 0
        ? data.photoUrl
        : null,
    submittedAt: toMillis(data.submittedAt),
    status: normalizeReportStatus(data.status),
  }
}

/**
 * Makes a user's filename safe for a Storage object path: drops directories,
 * keeps only `[A-Za-z0-9._-]`, caps the length, and never returns empty.
 *
 * `my photo (1).jpg` → `my-photo-1-.jpg` (runs of punctuation collapse to one
 * dash, so a trailing dash before the extension is expected and harmless).
 */
export function safeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'photo.jpg'
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)
  return cleaned.length > 0 ? cleaned : 'photo.jpg'
}
