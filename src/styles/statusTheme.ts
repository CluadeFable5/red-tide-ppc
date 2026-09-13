import {
  REPORT_STATUS_META,
  ZONE_STATUS_META,
  type StatusMeta,
} from '../lib/status'
import type { ReportStatus, ZoneStatus } from '../types'

/**
 * Dark-ground presentation for the semantic statuses in `src/lib/status.ts`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `src/lib/status.ts` is the single source of truth for status → *meaning*
 * (label, Filipino label, public guidance). It also carries light-theme colours
 * (`bg-green-50 text-green-800`), which no longer work on a #080808 ground —
 * a green-50 pill on near-black is a bright blob that destroys the hierarchy.
 *
 * Rather than edit the build agent's semantic module, the design layer derives
 * its own colours from it. Labels and guidance are still read from
 * `ZONE_STATUS_META`, so there is exactly one place to change wording, and one
 * place to change how status *looks*. If the two ever need to converge, fold
 * these tokens back into `status.ts`.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL
 * -------------------------------
 * Roughly 8% of men have red/green colour vision deficiency, and this app is
 * used outdoors in bright sun on a phone. Every status therefore pairs its
 * colour with a distinct shape affordance: `safe` is solid, `unconfirmed`
 * pulses and is drawn dashed on the map, `advisory` is solid with a glow. The
 * map polygons follow the same rule (see `dashArray` in Map.tsx).
 */

export interface StatusTheme {
  /** Raw hex for Leaflet SVG paths — Leaflet needs a value, not a class. */
  hex: string
  /** Filled pill for the status badge. */
  pillClass: string
  /** Dimmer pill for dense lists. */
  quietPillClass: string
  /** Solid fill for selected controls — used by the admin zone-status picker. */
  solidClass: string
  /** Ambient glow, used sparingly to pull the eye. */
  glowClass: string
  /** Whether this status should carry the attention pulse. */
  pulses: boolean
}

const ZONE_THEME: Record<ZoneStatus, StatusTheme> = {
  safe: {
    hex: '#3ddc84',
    pillClass: 'bg-safe/12 text-safe ring-1 ring-inset ring-safe/30',
    quietPillClass: 'bg-safe/8 text-safe/90 ring-1 ring-inset ring-safe/20',
    solidClass: 'bg-safe text-ink',
    glowClass: '',
    pulses: false,
  },
  unconfirmed: {
    hex: '#f0a500',
    pillClass: 'bg-accent/14 text-accent ring-1 ring-inset ring-accent/35',
    quietPillClass: 'bg-accent/10 text-accent/90 ring-1 ring-inset ring-accent/25',
    solidClass: 'bg-accent text-ink',
    glowClass: '',
    pulses: false,
  },
  // Only ONE status pulses. `advisory` is the safety-critical one — it is the
  // "do not eat shellfish" state — so it owns the animation. Giving two states
  // a pulse would mean neither reads as urgent. `unconfirmed` is instead
  // distinguished by amber and by a dashed outline on the map.
  advisory: {
    hex: '#ff5252',
    pillClass: 'bg-advisory/14 text-advisory ring-1 ring-inset ring-advisory/35',
    quietPillClass: 'bg-advisory/10 text-advisory/90 ring-1 ring-inset ring-advisory/25',
    solidClass: 'bg-advisory text-ink',
    glowClass: 'shadow-[0_0_20px_-2px_#ff5252]',
    pulses: true,
  },
}

const REPORT_THEME: Record<ReportStatus, StatusTheme> = {
  pending: {
    hex: '#f0a500',
    pillClass: 'bg-accent/14 text-accent ring-1 ring-inset ring-accent/35',
    quietPillClass: 'bg-accent/10 text-accent/90 ring-1 ring-inset ring-accent/25',
    solidClass: 'bg-accent text-ink',
    glowClass: '',
    pulses: true,
  },
  confirmed: {
    hex: '#ff5252',
    pillClass: 'bg-advisory/14 text-advisory ring-1 ring-inset ring-advisory/35',
    quietPillClass: 'bg-advisory/10 text-advisory/90 ring-1 ring-inset ring-advisory/25',
    solidClass: 'bg-advisory text-ink',
    glowClass: '',
    pulses: false,
  },
  rejected: {
    hex: '#7a7a7a',
    pillClass: 'bg-white/6 text-muted ring-1 ring-inset ring-white/10',
    quietPillClass: 'bg-white/4 text-faint ring-1 ring-inset ring-white/8',
    solidClass: 'bg-muted text-ink',
    glowClass: '',
    pulses: false,
  },
}

export function zoneTheme(status: ZoneStatus): StatusTheme {
  return ZONE_THEME[status] ?? ZONE_THEME.safe
}

export function reportTheme(status: ReportStatus): StatusTheme {
  return REPORT_THEME[status] ?? REPORT_THEME.pending
}

/** Short label — always paired with a colour, never replaced by it. */
export function zoneLabel(status: ZoneStatus): string {
  return ZONE_STATUS_META[status]?.label ?? 'Safe'
}

export function reportLabel(status: ReportStatus): string {
  return REPORT_STATUS_META[status]?.label ?? 'Pending'
}

/** Public guidance sentence, owned by `src/lib/status.ts`. */
export function zoneGuidance(status: ZoneStatus): string {
  return ZONE_STATUS_META[status]?.guidance ?? ''
}

export function zoneMeta(status: ZoneStatus): StatusMeta {
  return ZONE_STATUS_META[status] ?? ZONE_STATUS_META.safe
}
