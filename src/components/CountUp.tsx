import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Counting figure (reactbits.dev "Counter" pattern, MIT + Commons Clause —
 * see `docs/design-references.md` §14).
 *
 * Counts from the currently shown value to `to` with an ease-out curve,
 * starting when the number first enters the viewport. When `to` changes after
 * the first run (the live feeds move the number), it animates from where it is
 * to the new value — a jump would read as a glitch on a "live" figure.
 *
 * `tabular-nums` keeps the width steady so the digits do not wobble the
 * surrounding layout.
 */
export function CountUp({
  to,
  duration = 1.1,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}: {
  to: number
  /** Count duration in seconds for the first run; shorter for updates. */
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const [inView, setInView] = useState(false)
  const [value, setValue] = useState(0)
  const shownRef = useRef(0)
  const startedRef = useRef(false)
  const frameRef = useRef<number | undefined>(undefined)
  const spanRef = useRef<HTMLSpanElement | null>(null)

  // Start when the figure becomes visible. jsdom has no IntersectionObserver,
  // so fall straight through there (and in any environment without it).
  useEffect(() => {
    const el = spanRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return
    if (reduceMotion) {
      shownRef.current = to
      setValue(to)
      return
    }

    const firstRun = !startedRef.current
    startedRef.current = true
    const from = shownRef.current
    const ms = (firstRun ? duration : Math.min(duration, 0.6)) * 1000
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (to - from) * eased
      shownRef.current = next
      setValue(next)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [to, inView, reduceMotion, duration])

  const formatValue = (number: number) => prefix + number.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + suffix

  return (
    <span ref={spanRef} className={`tabular-nums ${className}`}>
      {/* Assistive tech gets the source value, never a stream of tween frames.
          LiveDataStatus owns update announcements for the page. */}
      <span aria-hidden="true">{formatValue(value)}</span>
      <span className="sr-only">{formatValue(to)}</span>
    </span>
  )
}
