import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { ZONE_STATUS_ORDER } from '../lib/status'
import { zoneLabel, zoneTheme } from '../styles/statusTheme'
import type { ZoneStatus } from '../types'
import { StatusPip } from './StatusPip'

/**
 * The status key: the ADVISORY / UNCONFIRMED / SAFE count pills, fixed
 * top-left over the map.
 *
 * WHAT IT IS — AND WHAT IT IS NOT
 * --------------------------------
 * This is the small pills row from the original top-left chrome, restored as
 * a plain, fixed, always-visible element. It is deliberately NOT part of the
 * advisory drawer (`AdvisoryDrawer.tsx`): it never moves, never clips, and
 * has no drag surfaces, no transform, and no toggle. A previous pass merged
 * the pills and the gauge card into one swipeable panel; that merge shipped a
 * rendering bug (content bleeding outside the panel mid-drag) and was split
 * back apart — this file is the pills half of that split.
 *
 * The row keeps its translucent blurred chips (`bg-ink-2/88 backdrop-blur`):
 * that styling is safe here because this subtree is never transformed — the
 * only motion value applied is `opacity` on the wrapper, and an opacity-only
 * ancestor does not disturb backdrop-filter compositing the way a translated
 * one does on mobile GPUs. (The drawer, whose card track translates, uses a
 * solid background for exactly that reason — see `AdvisoryDrawer.tsx`.)
 *
 * Chrome fade:
 *   Like the rest of the floating chrome, the row fades out as the sheet
 *   rises — at mid/full the sheet is the readout. While faded, the pills also
 *   drop their pointer events, so invisible chrome can never swallow a map
 *   gesture. The wrapper itself is `pointer-events-none` so the map stays
 *   interactive everywhere except on the chips.
 */

export interface StatusKeyProps {
  counts: Record<ZoneStatus, number>
  /** Driven by the sheet's progress; the row fades, it does not move. */
  chromeOpacity: MotionValue<number>
}

export function StatusKey({ counts, chromeOpacity }: StatusKeyProps) {
  // Chips re-enable pointer events only while the chrome is actually
  // visible — invisible chrome must never eat map gestures.
  const chipsPointerEvents = useTransform(chromeOpacity, (value): string =>
    value < 0.1 ? 'none' : 'auto',
  )

  return (
    <motion.div
      style={{ opacity: chromeOpacity }}
      className="pointer-events-none absolute left-3 top-[4.5rem] z-[1010] mt-[env(safe-area-inset-top)]"
      data-testid="status-key"
    >
      <motion.div
        role="group"
        aria-label="Zone status key"
        style={{ pointerEvents: chipsPointerEvents as unknown as 'auto' }}
        className="flex select-none flex-wrap items-center gap-1.5"
      >
        {ZONE_STATUS_ORDER.map((status) => (
          <StatusChip key={status} status={status} count={counts[status] ?? 0} />
        ))}
      </motion.div>
    </motion.div>
  )
}

/**
 * One status count pill. The same chip as the original floating legend —
 * unchanged, so the visual language is identical.
 */
function StatusChip({ status, count }: { status: ZoneStatus; count: number }) {
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
