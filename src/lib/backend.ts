import type {
  NewReport,
  Report,
  ReportStatus,
  Zone,
  ZoneStatus,
} from '../types'
import { createDemoBackend } from './backend.demo'
import { createFirebaseBackend } from './backend.firebase'
import { hasFirebaseConfig } from './firebase'

/**
 * Everything the app knows how to do with a datastore.
 *
 * Components never touch Firestore or Cloudinary directly — they call store
 * actions, and the store talks to a `Backend`. There are two implementations:
 *
 *   - `backend.firebase.ts` — Firestore + Cloudinary (production)
 *   - `backend.demo.ts`     — in-memory + localStorage (no backend needed)
 *
 * Keeping the seam here means the store, the UI and the tests are all
 * datastore-agnostic.
 */
export interface Backend {
  /** Which implementation is active — surfaced in the UI as a banner. */
  readonly kind: 'firebase' | 'demo'

  /** Live zone feed. Returns an unsubscribe function. */
  subscribeToZones(
    onChange: (zones: Zone[]) => void,
    onError?: (error: unknown) => void,
  ): () => void

  /** Live report feed. Returns an unsubscribe function. */
  subscribeToReports(
    onChange: (reports: Report[]) => void,
    onError?: (error: unknown) => void,
  ): () => void

  /** Create a report with status `pending`. */
  addReport(input: NewReport): Promise<Report>

  /** Upload a report photo and return a URL that can be stored on the report. */
  uploadReportPhoto(file: File, key: string): Promise<string>

  /** Admin: confirm or reject a report. */
  setReportStatus(reportId: string, status: ReportStatus): Promise<void>

  /** Admin: change a zone's advisory status (and bump `lastUpdated`). */
  setZoneStatus(zoneId: string, status: ZoneStatus): Promise<void>
}

// ---------------------------------------------------------------------------
// Composition root: pick the active backend once, at startup.
//
//   Firebase keys present  → Firestore + Cloudinary
//   keys missing / forced  → in-memory demo backend
// ---------------------------------------------------------------------------

let instance: Backend | null = null

export function getBackend(): Backend {
  if (!instance) {
    instance = hasFirebaseConfig ? createFirebaseBackend() : createDemoBackend()
  }
  return instance
}

/** Test hook: inject a stub backend (pass null to reset). */
export function setBackendForTesting(backend: Backend | null): void {
  instance = backend
}

export function isDemoBackend(): boolean {
  return getBackend().kind === 'demo'
}
