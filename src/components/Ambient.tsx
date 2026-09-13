import { motion } from 'motion/react'
import type { MotionStyle } from 'motion/react'
import { advisoryShare, formatPercent, tideBaselinePath, tideWavePath } from '../motion/readouts'

/**
 * Ambient instruments for the map surface.
 *
 * WHY THESE EXIST
 * ---------------
 * The category default for a civic map is a pastel card grid with a friendly
 * illustration. The subject here is a tide that poisons shellfish — it deserves
 * the instrument register: a schematic trace, a scan, monospaced readouts. Both
 * components below are deliberately *instruments*, not decoration:
 *
 *  - `TideGauge` plots the share of zones under advisory. The waveform collapses
 *    to a flat line when nothing is flagged and rises as the share grows, so it
 *    encodes real state rather than drawing a decorative sine wave. It is
 *    explicitly NOT a tide prediction, and it is labelled "advisory signal" so
 *    nobody reads it as one.
 *  - `Scanline` is the ambient half of the motif — a slow sonar sweep across the
 *    map. One compositor-only `translateY` loop, no JS, and it stops entirely
 *    under `prefers-reduced-motion`.
 *
 * Both are pointer-events-none and sit under the sheet, so neither can intercept
 * a map gesture or outlive its usefulness at the full anchor.
 */

/** Slow sweep across the map surface. Pure CSS; see `.animate-tide-scan`. */
export function Scanline() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <span className="animate-tide-scan tide-scanline absolute inset-x-0 block h-24" />
    </div>
  )
}

/**
 * Corner registration marks.
 *
 * A schematic drawing registers its corners; this is the same idea applied to a
 * map surface, and it gives the dark map an intentional frame instead of the
 * crop you get from a full-bleed tile layer.
 */
export function RegistrationMarks() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-2 z-[1005]">
      {(
        [
          'left-0 top-0 border-l border-t',
          'right-0 top-0 border-r border-t',
          'left-0 bottom-0 border-b border-l',
          'right-0 bottom-0 border-b border-r',
        ] as const
      ).map((position) => (
        <span
          key={position}
          className={`absolute h-3 w-3 border-paper/25 ${position}`}
        />
      ))}
    </div>
  )
}

/**
 * Advisory signal gauge.
 *
 * Positioned under the legend pills, top-left, and faded out by the sheet's
 * progress before the mid anchor — at that point the sheet is the readout and
 * two competing instruments on screen would be one too many.
 */
export function TideGauge({
  advisory,
  zones,
  pending,
  style,
}: {
  advisory: number
  zones: number
  pending: number
  style?: MotionStyle
}) {
  const share = advisoryShare(advisory, zones)
  const wave = tideWavePath({ scale: share })
  const baseline = tideBaselinePath()

  return (
    <motion.div
      style={style}
      className="pointer-events-none absolute left-3 top-[7.25rem] z-[1010] mt-[env(safe-area-inset-top)] w-[172px] rounded-lg border border-line bg-ink-2/85 p-2.5 backdrop-blur-md"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
          Advisory signal
        </span>
        <span className="font-mono text-[10px] leading-none tabular-nums text-accent">
          {formatPercent(share)}
        </span>
      </div>

      <svg
        viewBox="0 0 120 18"
        preserveAspectRatio="none"
        className="mt-1.5 block h-4 w-full overflow-hidden"
        aria-hidden="true"
      >
        <path
          d={baseline}
          stroke="var(--color-line)"
          strokeWidth="1"
          strokeDasharray="2 3"
          fill="none"
        />
        {/* Two tiles, drifted -50% on a loop: seamless because the wave is
            periodic. The trace is amber until something is actually flagged. */}
        <g className="animate-tide-drift" style={{ color: share > 0 ? 'var(--color-advisory)' : 'var(--color-line)' }}>
          <path d={wave} stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path
            d={wave}
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            transform="translate(120 0)"
          />
        </g>
      </svg>

      <p className="mt-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-muted">
        {advisory}/{zones} adv · {pending} pend
      </p>
    </motion.div>
  )
}
