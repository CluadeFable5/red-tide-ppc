import type { LatLng } from '../types'

/**
 * Shipping-lane / navigation-hazard reference overlay — the Puerto Princesa
 * Traffic Separation Scheme (PPTSS).
 *
 * WHERE THIS DATA COMES FROM (honest sourcing)
 * --------------------------------------------
 * OpenStreetMap has NO shipping-lane data for this area (verified 2026-09-19
 * with a dedicated Overpass sweep: only 5 seamark-tagged objects exist in the
 * whole Puerto Princesa Bay / Honda Bay region — three lighthouses, a pier and
 * a Coast Guard station; the nearest mapped traffic-route features in
 * Philippine waters are 500+ km away). Nothing here is traced from OSM.
 *
 * Every coordinate below is transcribed verbatim from the Philippine Coast
 * Guard's official scheme for the port approach:
 *
 *   Philippine Coast Guard, Memorandum Circular — "Puerto Princesa Traffic
 *   Separation Scheme (PPTSS)", 06 June 2017 (rescinds HPCG/MSSC MC No. 02-15
 *   of 22 May 2015); boundary coordinates per NAMRIA Chart Nr. 4333.
 *   https://www.coastguard.gov.ph/images/2023_Files/MC/0217_Puerto_Princesa_TSS.pdf
 *   (retrieved via the Internet Archive, 2026-09-19.)
 *
 * The circular's rules (Part VII) direct vessels under 20 m, sailing vessels
 * and vessels engaged in fishing to use the inshore traffic zone and to cross
 * the lanes at (or near) right angles only when unavoidable — that is exactly
 * the audience of this app, which is why the boundaries are worth showing.
 *
 * THIS IS AN UNOFFICIAL TRANSCRIPTION of an official document, made from the
 * published text rather than a chart digitisation. It is a visual aid next to
 * the red-tide advisory zones, not a navigational product: verify against
 * NAMRIA Chart Nr. 4333 (or the current PCG/PPA publication) before relying on
 * it on the water.
 *
 * Not seeded into Firestore — static reference data in the app, rendered as a
 * toggleable line layer (off by default) in `src/components/ShippingLayer.tsx`.
 * This file, like `zones.ts`, must stay free of DOM and Firebase imports.
 */

/** deg° min' sec" → decimal degrees (positive; all points are N/E here). */
export function dms(deg: number, min: number, sec: number): number {
  return deg + min / 60 + sec / 3600
}

export type ShippingFeatureKind =
  | 'lane-boundary' // edge of a 400 m one-way traffic lane
  | 'separation-zone' // the 60 m zone between opposing lanes — keep out
  | 'precautionary-area' // navigate with particular caution
  | 'hazard' // published obstruction or aid in the corridor

export interface ShippingFeature {
  id: string
  kind: ShippingFeatureKind
  /** Short chart-style name (tooltip title). */
  label: string
  /** One-line, plain-language meaning for fishers (tooltip body). */
  note: string
  /** Published points. Area features list their corners in order (implicit close). */
  points: LatLng[]
  /** Published recommended course (true), when the circular states one. */
  course?: string
  /** The DMS values behind `points`, for audit: [[latD, latM, latS, lngD, lngM, lngS], ...] */
  sourceDms: Array<[number, number, number, number, number, number]>
}

export const SHIPPING_FEATURES: ShippingFeature[] = [
  {
    id: 'inbound-lane-boundary',
    kind: 'lane-boundary',
    label: 'Inbound traffic lane boundary (400 m lane)',
    note: 'Ships approach the port on course 292°T on the seaward side of this line.',
    points: [
      [dms(9, 42, 40), dms(118, 46, 0)], // circular §VI.B point A
      [dms(9, 43, 30), dms(118, 43, 55)], // circular §VI.B point B
    ],
    course: '292°T',
    sourceDms: [
      [9, 42, 40, 118, 46, 0],
      [9, 43, 30, 118, 43, 55],
    ],
  },
  {
    id: 'outbound-lane-boundary',
    kind: 'lane-boundary',
    label: 'Outbound traffic lane boundary (400 m lane)',
    note: 'Ships leave the port on course 112°T on the shoreward side of this line.',
    points: [
      [dms(9, 43, 2), dms(118, 43, 55)], // circular §VI.C point A
      [dms(9, 42, 12), dms(118, 46, 0)], // circular §VI.C point B
    ],
    course: '112°T',
    sourceDms: [
      [9, 43, 2, 118, 43, 55],
      [9, 42, 12, 118, 46, 0],
    ],
  },
  {
    id: 'separation-zone',
    kind: 'separation-zone',
    label: 'Traffic separation zone (60 m) — keep out',
    note: 'The strip between the opposing lanes. Vessels must keep clear; never anchor or fish here.',
    points: [
      [dms(9, 43, 17), dms(118, 43, 55)], // circular §VI.A point 1
      [dms(9, 42, 27), dms(118, 46, 0)], // point 2
      [dms(9, 42, 25), dms(118, 46, 0)], // point 3
      [dms(9, 43, 15), dms(118, 43, 55)], // point 4
    ],
    sourceDms: [
      [9, 43, 17, 118, 43, 55],
      [9, 42, 27, 118, 46, 0],
      [9, 42, 25, 118, 46, 0],
      [9, 43, 15, 118, 43, 55],
    ],
  },
  {
    id: 'precautionary-area',
    kind: 'precautionary-area',
    label: 'Precautionary area',
    note: 'Ships converge here off the port. Small craft: cross well clear or not at all.',
    points: [
      [dms(9, 44, 0), dms(118, 43, 36)], // circular §VI.D.1 point A
      [dms(9, 43, 30), dms(118, 43, 55)], // point B
      [dms(9, 43, 2), dms(118, 43, 55)], // point C
      [dms(9, 43, 50), dms(118, 43, 12)], // point D
    ],
    sourceDms: [
      [9, 44, 0, 118, 43, 36],
      [9, 43, 30, 118, 43, 55],
      [9, 43, 2, 118, 43, 55],
      [9, 43, 50, 118, 43, 12],
    ],
  },
  {
    id: 'submerged-wreck',
    kind: 'hazard',
    label: 'Submerged wreck',
    note: 'Sunken vessel in the approach — ships steer around it, small craft keep well clear.',
    points: [[dms(9, 45, 1.2), dms(118, 43, 16)]],
    sourceDms: [[9, 45, 1.2, 118, 43, 16]],
  },
  {
    id: 'gideon-shoal-buoy',
    kind: 'hazard',
    label: 'Gideon Shoal buoy (Fl G 5s)',
    note: 'Marks Gideon Shoal — shallow water near the inbound lane.',
    points: [[dms(9, 44, 25.9), dms(118, 43, 7.9)]],
    sourceDms: [[9, 44, 25.9, 118, 43, 7.9]],
  },
  {
    id: 'fairway-buoy',
    kind: 'hazard',
    label: 'Fairway buoy',
    note: 'Channel entrance marker: safe water on either side, keep to port when entering.',
    points: [[dms(9, 42, 22.4), dms(118, 46, 10.52)]],
    sourceDms: [[9, 42, 22.4, 118, 46, 10.52]],
  },
]

export const SHIPPING_SOURCE = {
  authority: 'Philippine Coast Guard',
  title: 'Puerto Princesa Traffic Separation Scheme (PPTSS)',
  date: 'Memorandum Circular, 06 June 2017 (rescinds HPCG/MSSC MC No. 02-15, 22 May 2015)',
  chart: 'NAMRIA Chart Nr. 4333',
  url: 'https://www.coastguard.gov.ph/images/2023_Files/MC/0217_Puerto_Princesa_TSS.pdf',
  archivedUrl: 'https://web.archive.org/web/20250121132828/https://www.coastguard.gov.ph/images/2023_Files/MC/0217_Puerto_Princesa_TSS.pdf',
  retrieved: '2026-09-19',
} as const

/** Tooltip title for the whole overlay. */
export const SHIPPING_LAYER_LABEL = 'Shipping channel — do not cross'

/** One-line explanation under the label — honest about what this is. */
export const SHIPPING_LAYER_NOTE =
  'Official PCG traffic lanes for the port approach. Boats under 20 m and fishing boats should stay inshore of the marked lines; if you must cross, do it at right angles and never inside the hatched zone.'

export const SHIPPING_DISCLAIMER =
  'Unofficial transcription of the PCG circular — verify against NAMRIA Chart Nr. 4333 before relying on it for navigation.'
