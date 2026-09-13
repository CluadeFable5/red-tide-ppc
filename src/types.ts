/**
 * Shared domain types for Red Tide PPC.
 *
 * Timestamps are normalised to epoch milliseconds (number) at the backend
 * boundary, so components never have to know whether they are looking at a
 * Firestore `Timestamp` or a plain JS date.
 *
 * Keep this file free of DOM and Firebase imports: `scripts/seed.ts` is
 * type-checked and executed in Node, and it pulls this file in.
 */

/** A [latitude, longitude] pair, in decimal degrees (WGS84). */
export type LatLng = [number, number]

/**
 * Zone status.
 *
 * - `safe`        — no advisory in effect for this zone.
 * - `unconfirmed` — reports received and flagged by an admin as needing review;
 *                   not yet confirmed as a red tide event.
 * - `advisory`    — confirmed: do not eat shellfish from this zone.
 *
 * Status only ever changes through an admin action. There is deliberately no
 * automatic decay or expiry in the MVP.
 */
export type ZoneStatus = 'safe' | 'unconfirmed' | 'advisory'

/** Lifecycle of a community report. */
export type ReportStatus = 'pending' | 'confirmed' | 'rejected'

export interface Zone {
  id: string
  name: string
  /** One-line plain-English description shown in the popup and admin list. */
  description: string
  /** Approximate coastal polygon, [lat, lng] pairs. Not a survey boundary. */
  polygon: LatLng[]
  status: ZoneStatus
  /** Epoch ms of the last status change. */
  lastUpdated: number
}

export interface Report {
  id: string
  zoneId: string
  description: string
  /** Firebase Storage download URL, or null when no photo was attached. */
  photoUrl: string | null
  /** Epoch ms. */
  submittedAt: number
  status: ReportStatus
}

/** Payload used when writing a brand-new report. */
export interface NewReport {
  zoneId: string
  description: string
  photoUrl: string | null
}
