import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import type { NewReport, Report, ReportStatus, ZoneStatus } from '../types'
import type { Backend } from './backend'
import { firestore } from './firebase'
import { mapReport, mapZone } from './firestoreMapping'

/**
 * Production backend: Cloud Firestore for zones/reports and Cloudinary for
 * report photos. No Firebase Auth — see `firestore.rules` for what that costs.
 *
 * Document → domain mapping lives in `./firestoreMapping`, which is pure and
 * unit-tested; this file contains the Firestore and photo-upload plumbing.
 */

const ZONES_COLLECTION = 'zones'
const REPORTS_COLLECTION = 'reports'

interface CloudinaryUploadResponse {
  secure_url?: unknown
  error?: { message?: unknown }
}

const rawEnv = import.meta.env as Record<string, string | undefined>

/** Uploads a report photo using Cloudinary's browser-safe unsigned API. */
export async function uploadPhotoToCloudinary(file: File): Promise<string> {
  const cloudName = rawEnv.VITE_CLOUDINARY_CLOUD_NAME?.trim()
  const uploadPreset = rawEnv.VITE_CLOUDINARY_UPLOAD_PRESET?.trim()

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Photo upload is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.',
    )
  }

  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', uploadPreset)

  let response: Response
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      { method: 'POST', body },
    )
  } catch {
    throw new Error('Photo upload failed. Check your connection and try again.')
  }

  let result: CloudinaryUploadResponse
  try {
    result = (await response.json()) as CloudinaryUploadResponse
  } catch {
    throw new Error('Photo upload failed: Cloudinary returned an invalid response.')
  }

  if (!response.ok || typeof result.secure_url !== 'string') {
    const detail =
      typeof result.error?.message === 'string'
        ? `: ${result.error.message}`
        : '. Please try again.'
    throw new Error(`Photo upload failed${detail}`)
  }

  return result.secure_url
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

    async uploadReportPhoto(file: File, _key: string): Promise<string> {
      return uploadPhotoToCloudinary(file)
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
