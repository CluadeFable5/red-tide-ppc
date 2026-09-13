import { useEffect, useRef } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'

/**
 * The status dot, and the one piece of motion that *means* something.
 *
 * WHY IT MOVES
 * ------------
 * Status here is not decoration: it is the difference between "the shellfish are
 * fine" and "do not eat shellfish". A dot that silently changes colour asks the
 * user to notice a hue change they were not looking at. A dot that pops — up to
 * 1.3× and back — pulls the eye to the row that changed, which is the entire
 * job of a status pip on a monitoring surface.
 *
 * The pulse is triggered by a change to `trigger` (a status string, or a count
 * in the legend), not on mount: a page-load animation on six rows says nothing
 * about what changed, and it makes the legend look alive when it is not.
 *
 * The ongoing advisory ring is separate, and stays CSS
 * (`.animate-status-pulse`) — a continuous loop belongs on the compositor, and
 * this component has no business re-rendering 60 times a second.
 */

export type PipSize = 'xs' | 'sm' | 'md'

const SIZE_CLASS: Record<PipSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
}

export function StatusPip({
  hex,
  pulses = false,
  trigger,
  size = 'sm',
  glowClass = '',
  className = '',
}: {
  /** Raw hex — the same value handed to Leaflet for the polygons. */
  hex: string
  /** Carry the slow advisory ring (advisory status only). */
  pulses?: boolean
  /**
   * Pulse whenever this changes. Pass the status for a zone row, the count for
   * a legend chip. Omit to render a still dot.
   */
  trigger?: string | number
  size?: PipSize
  glowClass?: string
  className?: string
}) {
  const controls = useAnimationControls()
  const reduceMotion = useReducedMotion()
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (reduceMotion) return
    void controls.start({
      scale: [1, 1.3, 1],
      transition: { duration: 0.55, times: [0, 0.35, 1], ease: 'easeOut' },
    })
  }, [trigger, reduceMotion, controls])

  return (
    <span
      className={`relative grid shrink-0 place-items-center ${SIZE_CLASS[size]} ${className}`}
      aria-hidden="true"
    >
      <motion.span
        className={`absolute inset-0 rounded-full ${glowClass}`}
        style={{ backgroundColor: hex }}
        animate={controls}
      />
      {pulses && (
        <span
          className="animate-status-pulse absolute inset-0 rounded-full"
          style={{ backgroundColor: hex }}
        />
      )}
    </span>
  )
}
