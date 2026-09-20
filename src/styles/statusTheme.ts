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
 * ⚠️ As of the design pass, `StatusMeta.badgeClass` and `StatusMeta.softClass`
 * in `src/lib/status.ts` have NO consumers — every component now reads from
 * this file instead. They were left in place rather than deleted because that
 * module is owned by the build agent. They are dead, and they are light-theme:
 * reusing `softClass` would put a `bg-green-50` pill on a #080808 ground. Safe
 * to delete whenever `status.ts` is next touched.
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
    // Muted sage-teal, deliberately the quietest of the three. `safe` is the
    // resting state for most of the bay most of the time — it should recede
    // into the basemap, not compete with the two states that can actually tell
    // you something. Contrast is still AA on both ink surfaces (#4a8a75 =
    // 4.9:1 on #0a0a0a, 4.6:1 on #141414), which is why it stops there: a
    // deeper green like #3d7a6a drops under 4.5 and this token is also text
    // (`text-safe`), not just polygon paint. Mirrors `--color-safe` in
    // index.css — same rule as every other status hex in this file.
    hex: '#4a8a75',
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

/**
 * How a zone is painted on the Leaflet map.
 *
 * Kept here, next to the theme, so the polygon colour and the badge colour can
 * never drift apart — Leaflet needs raw numbers and hex, React needs classes,
 * and these are the only two places either appears.
 *
 * THE THREE FILL LEVELS ARE A SEQUENCE, NOT THREE STATES
 * -----------------------------------------------------
 * `fill` → `fillHover` → `fillSelected` is deliberately a ramp. A tap on a
 * polygon fires `mouseover` before `click` (browsers synthesise hover for touch
 * taps too), so the polygon is already lifting towards `fillHover` in the frames
 * before the popup opens. Leaflet writes these as SVG presentation attributes;
 * `.zone-path` in index.css puts a transition on the element, so the change is
 * interpolated by the compositor rather than cut in. The result is that the
 * popup arrives *onto a lit polygon* instead of appearing next to a static one.
 *
 * Its limitation is honest and worth stating: the popup itself is opened by
 * Leaflet's own click binding, so this ramps *into* the popup rather than
 * gating it. Delaying the open would mean un-binding the popup and reopening it
 * by hand, which risks the zone-click → popup → report-form flow for a
 * sub-200ms effect. Not worth it.
 *
 * `fillOpacity` at rest (0.34–0.42) is high enough that a zone reads as a
 * filled water area, not a traced outline. The zones are ~350–400 m coastal
 * strips; at the default fit zoom (~z10–11) a strip is only ~5–10 px wide, and
 * measured against the dark basemap the old levels (0.16–0.30) produced a fill
 * signal of ~7–18 RGB units for `safe` — weaker than the basemap's own labels
 * and land tint (~45–60), so the strips read as thin outlined lines. The
 * raised levels keep the underlying map legible (place names stay readable
 * through every status) while making the fill the dominant read — see
 * `docs/zone-fill-shots/` for the before/after evidence.
 *
 * The at-rest levels remain a prominence ladder, not three equal voices:
 * `safe` sits furthest back (0.34), `unconfirmed` in the middle (0.38),
 * `advisory` furthest forward (0.42). The steps are smaller than they used to
 * be because the ladder is carried perceptually: `safe`'s sage-teal sits only
 * ~112 RGB units from the dark water, while amber and red sit ~245 away, so
 * equal steps of opacity would leave `safe` invisible next to its neighbours.
 * `safe` quiet, `unconfirmed`/`advisory` loud is the hierarchy; hue does most
 * of that work, opacity keeps it honest. The same ladder runs through
 * `strokeOpacity` — see below.
 *
 * STROKE OPACITY IS PART OF THE LADDER
 * ------------------------------------
 * There is no glow filter on the polygons; what read as a halo around `safe`
 * outlines was the neon #3ddc84 stroke at 0.95 on a near-black ground — bright
 * saturated green simply looks like it emits light there. `safe` now paints
 * its outline at 0.7 so its border reads as a quiet boundary, while
 * `advisory`/`unconfirmed` keep 0.95 and stay the loudest lines on the map.
 * Every outline also sits on a dark casing (`ZONE_CASING`, below) so touching
 * zones keep a visible seam even when they share a status.
 * `weight` is left identical across statuses on purpose: the selected-zone
 * emphasis and the dash for `unconfirmed` are the shape signals, and the press
 * ramp in index.css assumes every status shares the same lift.
 */
export interface ZonePaint {
  /** Outline + fill colour; the same hex the badge uses. */
  hex: string
  /** Dashed outline for `unconfirmed` — a second, non-colour signal. */
  dashArray?: string
  /** At rest. */
  fill: number
  /** Pointer is over the polygon (or the tap is landing). */
  fillHover: number
  /** This zone is the current selection. */
  fillSelected: number
  weight: number
  weightSelected: number
  /**
   * Outline strength at rest. Optional; `Map.tsx` falls back to 0.95, so only
   * the status that should recede needs to declare it.
   */
  strokeOpacity?: number
}

const ZONE_PAINT: Record<ZoneStatus, ZonePaint> = {
  safe: {
    hex: '#4a8a75',
    fill: 0.34,
    fillHover: 0.46,
    fillSelected: 0.58,
    weight: 2,
    weightSelected: 4,
    // 0.55 was tuned when no two `safe` zones touched. It is enough for a
    // stroke against open water, but where two safe strips meet (pp-bay and
    // irawan share a ~300m seam at the bay mouth) a 0.55 stroke of the same
    // hex as the two fills either side of it has almost no edge contrast and
    // the pair fuses into one shape. 0.7 keeps `safe` the quietest line on
    // the map (advisory/unconfirmed are 0.95) while the casing below does
    // the real work of separating neighbours.
    strokeOpacity: 0.7,
  },
  unconfirmed: {
    hex: '#f0a500',
    dashArray: '6 5',
    fill: 0.38,
    fillHover: 0.50,
    fillSelected: 0.60,
    weight: 2,
    weightSelected: 4,
  },
  advisory: { hex: '#ff5252', fill: 0.42, fillHover: 0.54, fillSelected: 0.64, weight: 2, weightSelected: 4 },
}

/**
 * Dark casing drawn under every zone outline.
 *
 * WHY
 * ---
 * Adjacent zones can share a boundary — `pp-bay` and `irawan` meet along a
 * ~300m seam at the bay mouth, and the Honda Bay strips touch too. When both
 * are the same status the seam is a single stroke of the *same hex as both
 * fills*, and at `safe`'s low stroke opacity it all but vanishes: the two
 * zones read as one blob of water. Status colour is not the answer (both are,
 * correctly, safe), and nudging fill opacity per zone would break the meaning
 * of the prominence ladder above.
 *
 * Instead each ring is drawn twice: once here, in the ground colour, slightly
 * wider than the status stroke and in a pane *below* every zone; then the
 * status stroke on top. The result is the standard cartographic "casing": a
 * thin dark edge either side of every outline, so where two outlines meet
 * there are two dark edges with the status line between them and the boundary
 * survives regardless of what colours sit on either side. It also gives every
 * outline a little more separation from the inverted basemap, which is a
 * mild improvement everywhere, not just at seams.
 *
 * `extraWeight` is total (split half to each side), so at rest a 2px status
 * stroke gets ~1.25px of dark edge each side. Kept small: this is an edge,
 * not a border.
 */
export const ZONE_CASING = {
  /** The map ground (`.leaflet-container` background / `--color-ink`). */
  hex: '#0b0b0b',
  extraWeight: 2.5,
  opacity: 0.85,
} as const

export function zonePaint(status: ZoneStatus): ZonePaint {
  return ZONE_PAINT[status] ?? ZONE_PAINT.safe
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
