import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type { NewReport, Report, ReportStatus, ZoneStatus } from '../types'
import type { Backend } from './backend'
import { firestore, storage } from './firebase'
import {
  mapReport,
  mapZone,
  safeFileName,
} from './firestoreMapping'

/**
 * Production backend: Cloud Firestore for zones/reports, Cloud Storage for
 * report photos. No Firebase Auth — see `firestore.rules` for what that costs.
 *
 * Document → domain mapping lives in `./firestoreMapping`, which is pure and
 * unit-tested; this file is only the Firestore/Storage plumbing.
 */

const ZONES_COLLECTION = 'zones'
const REPORTS_COLLECTION = 'reports'
const PHOTO_FOLDER = 'reports'

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
