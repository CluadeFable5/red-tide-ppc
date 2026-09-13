import { motion } from 'motion/react'
import type { MotionStyle } from 'motion/react'
import { ZONE_STATUS_ORDER } from '../lib/status'
import { zoneLabel, zoneTheme } from '../styles/statusTheme'
import type { ZoneStatus } from '../types'
import { StatusPip } from './StatusPip'

/**
 * Floating status key: three pills over the map, not a strip in the layout.
 *
 * It used to be a full-width bar pinned to the bottom-left. Two problems with
 * that: it consumed a band of the map at every breakpoint, and once the zone
 * sheet arrived it would have sat *under* the sheet exactly where the handle is.
 * As a pill row anchored to the top-left it costs no layout height at all, sits
 * in the dead space under the app bar, and can fade out as the sheet rises
 * (see `chromeOpacity`) instead of being covered.
 *
 * The wrapper is `pointer-events-none` and only the pills take pointer events,
 * so a drag started on the map is never swallowed by the legend's bounding box.
 */
export function Legend({
  counts,
  style,
}: {
  counts: Record<ZoneStatus, number>
  /** Opacity is driven by the sheet's progress; the legend fades, it does not shrink. */
  style?: MotionStyle
}) {
  return (
    <motion.div
      style={style}
      className="pointer-events-none absolute inset-x-3 top-[4.5rem] z-[1010] mt-[env(safe-area-inset-top)] flex flex-wrap items-center gap-1.5"
    >
      <div
        role="group"
        aria-label="Zone status key"
        className="pointer-events-auto flex flex-wrap items-center gap-1.5"
      >
        {ZONE_STATUS_ORDER.map((status) => (
          <LegendChip key={status} status={status} count={counts[status] ?? 0} />
        ))}
      </div>
    </motion.div>
  )
}

function LegendChip({ status, count }: { status: ZoneStatus; count: number }) {
  const theme = zoneTheme(status)
  const label = zoneLabel(status)

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-2/88 py-1 pl-2 pr-2 backdrop-blur-md">
      {/* The pip pops whenever the count changes — a legend that only re-colours
          is a legend nobody notices going from 0 to 1. */}
      <StatusPip
        size="xs"
        hex={theme.hex}
        pulses={theme.pulses}
        glowClass={theme.glowClass}
        trigger={count}
      />
      <span className="font-display text-[11px] leading-none tracking-[0.03em] text-paper/85">
        {label}
      </span>
      <span
        className="font-mono text-[10px] leading-none tabular-nums"
        style={{ color: theme.hex }}
      >
        {count}
      </span>
    </span>
  )
}
