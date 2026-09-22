import { motion, useReducedMotion } from 'motion/react'
import { APP_SPRING } from '../motion/mapMotion'

/**
 * The drawer chevron, as a GEOMETRY MORPH instead of a rotation or an icon
 * swap.
 *
 * One `<path>` with a fixed command structure (M/L/L), so `motion` can
 * interpolate the coordinates. Collapsed = the open-leftward chevron `‹`;
 * open = its rightward mirror `›`. The straight-across interpolation is the
 * point: halfway between the two states the arms pass through a single
 * vertical stroke, so the icon visibly *folds through* rather than spins —
 * a morph a rotate could never produce, and never two different glyphs
 * swapping.
 *
 * Reduced motion snaps between the endpoints (`duration: 0`) — no morph.
 */

/** `‹` — points the way the panel will travel when collapsed (opens left). */
const CHEVRON_COLLAPSED = 'M 15 6 L 9 12 L 15 18'

/** `›` — tucks rightward when open. */
const CHEVRON_OPEN = 'M 9 6 L 15 12 L 9 18'

export function MorphChevron({
  open,
  className,
}: {
  /** Whether the owning drawer is open (drives the target geometry). */
  open: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.path
      // `d` is animatable because both endpoints share the M/L/L structure.
      animate={{ d: open ? CHEVRON_OPEN : CHEVRON_COLLAPSED }}
      initial={false}
      transition={reduceMotion ? { duration: 0 } : APP_SPRING}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-testid="morph-chevron"
      data-state={open ? 'open' : 'collapsed'}
    />
  )
}

/**
 * The static `<svg>` shell both drawer chevrons live in. Kept separate so the
 * callers keep their own `aria-hidden`/stroke styling and only the `d`
 * attribute — the actual shape — is animated.
 */
export function MorphChevronIcon({
  open,
  className,
}: {
  open: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
      data-testid="morph-chevron-icon"
    >
      <MorphChevron open={open} />
    </svg>
  )
}
