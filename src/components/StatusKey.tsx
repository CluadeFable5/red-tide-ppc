import { useRef } from 'react'
import { motion, motionValue, useReducedMotion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { ZONE_STATUS_ORDER } from '../lib/status'
import { APP_SPRING } from '../motion/mapMotion'
import { resolveActiveStatus } from '../motion/statusKey'
import { zoneLabel, zoneTheme } from '../styles/statusTheme'
import type { ZoneStatus } from '../types'
import { CountUp } from './CountUp'
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
 * Chrome fade (optional):
 *   The row can fade with a progress value (invisible chrome also drops its
 *   pointer events, so it can never swallow a map gesture). The map page no
 *   longer fades it — the bottom sheet that drove the fade is gone — so the
 *   prop is optional and defaults to a constant, always-visible 1. The
 *   wrapper itself is `pointer-events-none` so the map stays interactive
 *   everywhere except on the chips.
 */

export interface StatusKeyProps {
  counts: Record<ZoneStatus, number>
  /** Optional fade driver; defaults to always visible. */
  chromeOpacity?: MotionValue<number>
  /**
   * Status the shared indicator rests on. Defaults to the worst status with
   * a count — MapPage passes the selected zone's status to override it.
   */
  activeStatus?: ZoneStatus | null
}

export function StatusKey({ counts, chromeOpacity, activeStatus }: StatusKeyProps) {
  const reduceMotion = useReducedMotion()

  // Constant visibility when no fade driver is supplied — created once.
  const fallbackOpacity = useRef<MotionValue<number> | null>(null)
  if (fallbackOpacity.current === null) {
    fallbackOpacity.current = motionValue(1)
  }
  const opacity = chromeOpacity ?? fallbackOpacity.current

  // Chips re-enable pointer events only while the chrome is actually
  // visible — invisible chrome must never eat map gestures.
  const chipsPointerEvents = useTransform(opacity, (value): string =>
    value < 0.1 ? 'none' : 'auto',
  )

  const active = activeStatus ?? resolveActiveStatus(null, counts)

  return (
    <motion.div
      style={{ opacity }}
      initial={reduceMotion || chromeOpacity ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
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
          <StatusChip
            key={status}
            status={status}
            count={counts[status] ?? 0}
            active={status === active}
          />
        ))}
      </motion.div>
    </motion.div>
  )
}

/**
 * One status count pill. The same chip as the original floating legend, plus
 * two live details:
 *
 *  - the SHARED INDICATOR: exactly one chip hosts a `layoutId` layer; when the
 *    active status changes (selection or counts), motion moves that single
 *    element from the old chip's bounds to the new one — the highlight slides
 *    between pills while the pills themselves never move;
 *  - the count ticks through `<CountUp/>` instead of cutting to the new
 *    number.
 *
 * The indicator is a static-tinted layer (no looping animation, no shadow
 * animation — a transform-only layout move), so the row stays as cheap as
 * before.
 */
function StatusChip({
  status,
  count,
  active,
}: {
  status: ZoneStatus
  count: number
  active: boolean
}) {
  const theme = zoneTheme(status)
  const label = zoneLabel(status)
  const reduceMotion = useReducedMotion()

  return (
    <span
      data-status={status}
      className="relative inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-2/88 py-1 pl-2 pr-2 backdrop-blur-md"
    >
      {active && (
        <motion.span
          layoutId="status-key-active-indicator"
          data-testid="status-key-indicator"
          className="absolute inset-0 -z-10 rounded-full"
          style={{ backgroundColor: theme.hex, opacity: 0.16 }}
          transition={reduceMotion ? { duration: 0 } : APP_SPRING}
        />
      )}
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
      <span className="font-mono text-[10px] leading-none" style={{ color: theme.hex }}>
        <CountUp to={count} duration={0.9} />
      </span>
    </span>
  )
}
