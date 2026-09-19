/**
 * Data-derived readouts for the sheet and the ambient instrument rail.
 *
 * Everything here is pure and string/number-only so the exact wording and the
 * pluralisation rules are unit-tested rather than buried in JSX. The copy is
 * *derived from counts*, never hand-written per state, which is the difference
 * between a dossier-style readout and a marketing line.
 *
 * Nothing in here invents data. The schematic wave is a *visualisation of the
 * advisory count this app actually holds* — it is explicitly not a tide
 * prediction, and it is labelled as such on screen.
 */

import type { ZoneStatus } from '../types'
import type { SidePanelState } from './sidePanelAnchors'

/**
 * The one line the sheet shows at peek: `"6 zones · No advisories"`.
 *
 * Kept short on purpose — it has to survive a 375px-wide phone next to the
 * anchor readout without wrapping, because a wrapping peek line defeats the
 * point of the anchor.
 */
export function zoneSummaryLine(zoneCount: number, advisoryCount: number): string {
  const zones = `${zoneCount} ${zoneCount === 1 ? 'zone' : 'zones'}`
  if (advisoryCount <= 0) return `${zones} · No advisories`
  return `${zones} · ${advisoryCount} under advisory`
}

/**
 * `01 / 02` style position readout for a two-state side drawer — the same
 * instrument language as the sheet's `01 / 03` strip, adapted to the two
 * detents a drawer has. `collapsed` is the first position, `open` the
 * second, mirroring how `peek` was the sheet's first.
 */
export function sidePanelReadout(state: SidePanelState): string {
  return state === 'collapsed' ? '01 / 02' : '02 / 02'
}

/**
 * Most severe status currently present, for the closed drawer's single pip.
 *
 * Severity order is advisory > unconfirmed > safe, matching the domain: a
 * confirmed bloom outranks a report that still needs review, and both outrank
 * "nothing flagged". Resolved here rather than inline so the sheet can never
 * disagree with the map about what matters most.
 */
export function dominantZoneStatus(counts: Partial<Record<ZoneStatus, number>>): ZoneStatus {
  if ((counts.advisory ?? 0) > 0) return 'advisory'
  if ((counts.unconfirmed ?? 0) > 0) return 'unconfirmed'
  return 'safe'
}

/**
 * Zone id as a machine tag: `honda-inner` → `HONDA-INNER`.
 *
 * The same string the Firestore document uses, shown in the UI's own register,
 * so an admin reading a report alongside the map is looking at one identifier,
 * not two.
 */
export function zoneTag(zoneId: string): string {
  return zoneId.toUpperCase()
}

/** Fraction of zones under advisory, 0..1. Zero zones reads as 0, never NaN. */
export function advisoryShare(advisoryCount: number, zoneCount: number): number {
  if (!(zoneCount > 0) || !(advisoryCount > 0)) return 0
  return Math.min(advisoryCount / zoneCount, 1)
}

/** `14%` style readout. Rounds to whole percent, clamps to 0..100. */
export function formatPercent(value: number): string {
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1)
  return `${Math.round(clamped * 100)}%`
}

export interface TideWaveOptions {
  /** SVG user units, not px — the path is scaled by the viewBox. */
  width?: number
  height?: number
  /** Peak amplitude in user units at `scale` 1. */
  amplitude?: number
  /** Number of crests across one tile. */
  lobes?: number
  /** 0..1 — drives amplitude, so the shape is a readout, not decoration. */
  scale?: number
}

/**
 * One period of a tiling sine, as an SVG path.
 *
 * Returned as a path (not a `<path d>` string written in JSX) so the amplitude
 * response to the advisory share is testable: at `scale` 0 the wave must
 * collapse to a flat line, and it must never exceed the box.
 *
 * `tiles` copies are placed side by side and drifted with a `-50%` CSS
 * translate, which loops seamlessly because the wave is periodic.
 */
export function tideWavePath({
  width = 120,
  height = 18,
  amplitude = 6,
  lobes = 3,
  scale = 1,
}: TideWaveOptions = {}): string {
  const safeScale = Math.min(Math.max(Number.isFinite(scale) ? scale : 0, 0), 1)
  const amp = (Math.max(amplitude, 0) * safeScale).toFixed(2)
  const mid = (height / 2).toFixed(2)
  const step = width / (lobes * 2)
  const parts: string[] = [`M 0 ${mid}`]

  for (let index = 0; index < lobes * 2; index += 1) {
    // Alternate crest/trough: each span is one half period.
    const peak = index % 2 === 0 ? `-${amp}` : amp
    parts.push(
      `q ${(step / 2).toFixed(2)} ${peak} ${step.toFixed(2)} 0`,
    )
  }

  return parts.join(' ')
}

/** Flat baseline the wave is drawn against. */
export function tideBaselinePath({ width = 120, height = 18 }: TideWaveOptions = {}): string {
  const mid = (height / 2).toFixed(2)
  return `M 0 ${mid} L ${width} ${mid}`
}
