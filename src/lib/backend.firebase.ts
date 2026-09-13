import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type {
  LatLng,
  NewReport,
  Report,
  ReportStatus,
  Zone,
  ZoneStatus,
} from '../types'
import type { Backend } from './backend'
import { firestore, storage } from './firebase'

/**
 * Production backend: Cloud Firestore for zones/reports, Cloud Storage for
 * report photos. No Firebase Auth — see `firestore.rules` for what that costs.
 */

const ZONES_COLLECTION = 'zones'
const REPORTS_COLLECTION = 'reports'
const PHOTO_FOLDER = 'reports'

const ZONE_STATUSES: readonly ZoneStatus[] = ['safe', 'unconfirmed', 'advisory']
const REPORT_STATUSES: readonly ReportStatus[] = [
  'pending',
  'confirmed',
  'rejected',
]

function normalizeZoneStatus(value: unknown): ZoneStatus {
  return ZONE_STATUSES.includes(value as ZoneStatus)
    ? (value as ZoneStatus)
    : 'safe'
}

function normalizeReportStatus(value: unknown): ReportStatus {
  return REPORT_STATUSES.includes(value as ReportStatus)
    ? (value as ReportStatus)
    : 'pending'
}

/** Firestore Timestamp, GeoPoint, ISO string or plain number → epoch ms. */
function toMillis(value: unknown): number {
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
  // A locally-pending serverTimestamp() has not resolved yet.
  return Date.now()
}

/** Accepts [[lat, lng], ...] or [{latitude, longitude}, ...] (GeoPoint). */
function normalizePolygon(value: unknown): LatLng[] {
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

function mapZone(id: string, data: Record<string, unknown>): Zone {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Unnamed zone',
    description: typeof data.description === 'string' ? data.description : '',
    polygon: normalizePolygon(data.polygon),
    status: normalizeZoneStatus(data.status),
    lastUpdated: toMillis(data.lastUpdated),
  }
}

function mapReport(id: string, data: Record<string, unknown>): Report {
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

/** `my photo (1).jpg` → `my-photo-1.jpg`; keeps the object path boring. */
function safeFileName(name: string): string {
  const base = name
    .replace(/\\/g, '/')
    .split('/')
    .pop() ?? 'photo.jpg'
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)
  return cleaned.length > 0 ? cleaned : 'photo.jpg'
}

export function createFirebaseBackend(): Backend {
  return {
    kind: 'firebase',

    subscribeToZones(onChange, onError) {
      // No orderBy here on purpose: a doc that is missing the ordered field is
      // dropped from the snapshot, which would hide freshly-seeded zones.
      // Sorting happens in the store instead.
      return onSnapshot(
        collection(firestore(), ZONES_COLLECTION),
        (snapshot) => {
          onChange(snapshot.docs.map((d) => mapZone(d.id, d.data())))
        },
        (error) => onError?.(error),
      )
    },

    subscribeToReports(onChange, onError) {
      return onSnapshot(
        collection(firestore(), REPORTS_COLLECTION),
        (snapshot) => {
          onChange(snapshot.docs.map((d) => mapReport(d.id, d.data())))
        },
        (error) => onError?.(error),
      )
    },

    async addReport(input: NewReport): Promise<Report> {
      const reference = await addDoc(
        collection(firestore(), REPORTS_COLLECTION),
        {
          zoneId: input.zoneId,
          description: input.description,
          photoUrl: input.photoUrl,
          status: 'pending',
          submittedAt: serverTimestamp(),
        },
      )
      return {
        id: reference.id,
        zoneId: input.zoneId,
        description: input.description,
        photoUrl: input.photoUrl,
        status: 'pending',
        submittedAt: Date.now(),
      }
    },

    async uploadReportPhoto(file: File, key: string): Promise<string> {
      const path = `${PHOTO_FOLDER}/${key}/${Date.now()}-${safeFileName(file.name)}`
      const reference = ref(storage(), path)
      await uploadBytes(reference, file, { contentType: file.type })
      return getDownloadURL(reference)
    },

    async setReportStatus(reportId: string, status: ReportStatus) {
      await updateDoc(doc(firestore(), REPORTS_COLLECTION, reportId), {
        status,
        reviewedAt: serverTimestamp(),
      })
    },

    async setZoneStatus(zoneId: string, status: ZoneStatus) {
      await updateDoc(doc(firestore(), ZONES_COLLECTION, zoneId), {
        status,
        lastUpdated: serverTimestamp(),
      })
    },
  }
}
