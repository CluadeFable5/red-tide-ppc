import type { ReportStatus, ZoneStatus } from '../types'

/**
 * Single source of truth for status → colour/label mapping.
 *
 * The hex values are duplicated in `src/index.css` under `@theme` so Tailwind
 * utility classes (`bg-advisory`, `text-safe`, …) stay in sync visually. If you
 * change a colour here, change it there too.
 */

export interface StatusMeta {
  /** Short label for badges and legends. */
  label: string
  /** Filipino phrasing, shown alongside the English label. */
  labelTl: string
  /** Hex colour used by Leaflet (SVG needs raw hex, not a CSS class). */
  hex: string
  /** Tailwind classes for the solid badge. */
  badgeClass: string
  /** Tailwind classes for a soft/tinted badge. */
  softClass: string
  /** Plain-English guidance shown to the public. */
  guidance: string
}

export const ZONE_STATUS_META: Record<ZoneStatus, StatusMeta> = {
  safe: {
    label: 'Safe',
    labelTl: 'Ligtas',
    hex: '#16a34a',
    badgeClass: 'bg-green-600 text-white',
    softClass: 'bg-green-50 text-green-800 ring-green-200',
    guidance:
      'No red tide advisory recorded for this zone. Community reports are still welcome.',
  },
  unconfirmed: {
    label: 'Unconfirmed',
    labelTl: 'Hindi pa kumpirmado',
    hex: '#f59e0b',
    badgeClass: 'bg-amber-500 text-white',
    softClass: 'bg-amber-50 text-amber-900 ring-amber-200',
    guidance:
      'Reports have been received and are being checked. Avoid shellfish from this zone until it is cleared.',
  },
  advisory: {
    label: 'Advisory',
    labelTl: 'May babala',
    hex: '#dc2626',
    badgeClass: 'bg-red-600 text-white',
    softClass: 'bg-red-50 text-red-800 ring-red-200',
    guidance:
      'Advisory in effect: do not gather, sell or eat shellfish or alamang from this zone.',
  },
}

export const REPORT_STATUS_META: Record<ReportStatus, StatusMeta> = {
  pending: {
    label: 'Pending',
    labelTl: 'Nakabinbin',
    hex: '#f59e0b',
    badgeClass: 'bg-amber-500 text-white',
    softClass: 'bg-amber-50 text-amber-900 ring-amber-200',
    guidance: 'Waiting for an admin to review.',
  },
  confirmed: {
    label: 'Confirmed',
    labelTl: 'Kumpirmado',
    hex: '#dc2626',
    badgeClass: 'bg-red-600 text-white',
    softClass: 'bg-red-50 text-red-800 ring-red-200',
    guidance: 'Approved by an admin; the zone was put under advisory.',
  },
  rejected: {
    label: 'Rejected',
    labelTl: 'Tinanggihan',
    hex: '#64748b',
    badgeClass: 'bg-slate-500 text-white',
    softClass: 'bg-slate-100 text-slate-700 ring-slate-200',
    guidance: 'Dismissed by an admin; the zone status was left unchanged.',
  },
}

/** Ordered for legends: worst first. */
export const ZONE_STATUS_ORDER: ZoneStatus[] = ['advisory', 'unconfirmed', 'safe']

export function zoneStatusMeta(status: ZoneStatus): StatusMeta {
  return ZONE_STATUS_META[status] ?? ZONE_STATUS_META.safe
}

export function reportStatusMeta(status: ReportStatus): StatusMeta {
  return REPORT_STATUS_META[status] ?? REPORT_STATUS_META.pending
}
