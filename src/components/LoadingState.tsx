import { motion, useReducedMotion } from 'motion/react'

/**
 * Branded loading states.
 *
 * The app subscribes to two live feeds (zones, reports) and either can be slow
 * on a phone connection. Before this, that window rendered either a bare
 * "Loading zones…" line or an empty list — on a demo screen that reads as
 * "broken" rather than "working".
 *
 * Two mechanisms, chosen per surface:
 *   - a branded mark where the user is waiting for the *map itself*
 *   - skeletons where the shape of the incoming content is already known, so
 *     the layout does not jump when data lands
 *
 * Both use amber, and both are aria-busy/role=status so a screen reader is told
 * something is happening rather than being left with silence.
 */

/** The app's wave mark, drawn on a loop. */
export function BrandMark({ className = 'h-10 w-10' }: { className?: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <motion.circle
        cx="12"
        cy="6"
        r="3"
        strokeWidth="1.8"
        initial={{ pathLength: reduceMotion ? 1 : 0, opacity: reduceMotion ? 1 : 0.25 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          duration: reduceMotion ? 0.01 : 0.9,
          repeat: reduceMotion ? 0 : Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
        }}
      />
      <path
        strokeLinecap="round"
        strokeWidth="1.8"
        d="M2 14c2.5-2.4 4.2 2.4 6.7 0s4.2 2.4 6.7 0 4.2 2.4 6.6 0"
        opacity="0.45"
      />
      <motion.path
        strokeLinecap="round"
        strokeWidth="1.8"
        d="M2 19c2.5-2.4 4.2 2.4 6.7 0s4.2 2.4 6.7 0 4.2 2.4 6.6 0"
        initial={{ pathLength: reduceMotion ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: reduceMotion ? 0.01 : 1.4,
          repeat: reduceMotion ? 0 : Infinity,
          repeatType: 'loop',
          ease: 'easeInOut',
        }}
      />
    </svg>
  )
}

/** Overlay shown on top of the map while the zone feed is still connecting. */
export function MapLoadingOverlay({ label = 'Loading zones' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="absolute inset-0 z-[1005] grid place-items-center bg-ink/88 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center">
        <BrandMark className="h-11 w-11 text-accent" />
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
          {label}
        </p>
        {/* A determinate-looking bar would lie about progress; this one sweeps
            to say "working" and nothing more. */}
        <span className="mt-3 block h-0.5 w-28 overflow-hidden rounded-full bg-line">
          <span className="animate-sheen block h-full w-full bg-accent text-accent" />
        </span>
      </div>
    </div>
  )
}

/** Skeleton for the public zone list. */
export function ZoneListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul
      className="mt-3 grid gap-2.5 sm:grid-cols-2"
      role="status"
      aria-busy="true"
      aria-label="Loading zones"
    >
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="overflow-hidden rounded-xl border border-line bg-ink-2"
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <Shimmer className="h-4 w-32 rounded" />
              <Shimmer className="h-4 w-20 rounded-full" />
            </div>
            <Shimmer className="mt-3 h-2.5 w-full rounded" />
            <Shimmer className="mt-1.5 h-2.5 w-3/5 rounded" />
          </div>
          <div className="border-t border-line/70 px-4 py-2.5">
            <Shimmer className="h-2.5 w-28 rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Skeleton for the admin review queue. */
export function ReportQueueSkeleton({ count = 3, className = 'space-y-3' }: { count?: number; className?: string }) {
  return (
    <ul
      className={className}
      role="status"
      aria-busy="true"
      aria-label="Loading reports"
    >
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="overflow-hidden rounded-xl border border-line bg-ink-2"
        >
          <div className="p-4 pl-5">
            <div className="flex flex-wrap items-center gap-2">
              <Shimmer className="h-6 w-40 rounded-md" />
              <Shimmer className="h-4 w-20 rounded-full" />
              <Shimmer className="ml-auto h-2.5 w-16 rounded" />
            </div>
            <Shimmer className="mt-3 h-2.5 w-full rounded" />
            <Shimmer className="mt-1.5 h-2.5 w-4/5 rounded" />
            <div className="mt-3.5 flex gap-2">
              <Shimmer className="h-10 flex-1 rounded-lg" />
              <Shimmer className="h-10 flex-1 rounded-lg" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * A single shimmering placeholder block.
 *
 * Uses the same `sheen` keyframes as the submit button, so "loading" looks the
 * same everywhere in the app.
 */
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`animate-sheen block bg-line text-muted/25 ${className}`}
    />
  )
}
