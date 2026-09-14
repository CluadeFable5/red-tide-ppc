import { Fragment, useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import { motion, useReducedMotion, type Transition } from 'motion/react'

/**
 * "Blur into focus" text reveal (reactbits.dev `BlurText`, MIT + Commons
 * Clause — see `docs/design-references.md` §14 and §15).
 *
 * Each word (or letter) starts blurred, transparent and offset, then resolves
 * to sharp. The reveal is triggered by the block's *own* `IntersectionObserver`,
 * so the landing page's sections do not all fire at page load — text comes into
 * focus as you scroll past it.
 *
 * SAFETY: THE TEXT MUST ALWAYS ARRIVE
 * -----------------------------------
 * This is a public-health surface. An animation that starts at `opacity: 0`
 * is a way for copy to silently never appear, so every failure path here ends
 * with the plain string on screen:
 *
 *  - `prefers-reduced-motion` → rendered as static text, no motion nodes.
 *  - no `IntersectionObserver` (old browser, jsdom, bots) → treated as
 *    immediately in view, so the reveal runs at once rather than never.
 *  - `FAILSAFE_MS` → even if the observer is installed but never fires (an
 *    ancestor with `content-visibility`, a mis-measured root margin, a
 *    scroll container we did not anticipate), the block reveals itself after
 *    a few seconds regardless.
 *
 * The disclaimer, the CTAs and the PSP primer are deliberately NOT routed
 * through this component — see `Landing.tsx`.
 *
 * ACCESSIBILITY
 * -------------
 * The animation splits the string into per-segment `inline-block` spans,
 * which makes assistive tech read it in fragments. So the wrapper carries the
 * whole string as its `aria-label` and the segments are `aria-hidden` — the
 * same pattern `DecryptedText` uses for the hero.
 */

/** Reveal anyway if the observer has not fired by now (ms). */
const FAILSAFE_MS = 4000

type BlurTextProps = {
  text: string
  /** ms between each word/letter starting. */
  delay?: number
  className?: string
  animateBy?: 'words' | 'letters'
  direction?: 'top' | 'bottom'
  /** Intersection ratio that counts as "in view". */
  threshold?: number
  /** Observer root margin — negative values delay the trigger until the block is properly on screen. */
  rootMargin?: string
  /** Seconds each segment spends animating. */
  stepDuration?: number
  /** Element to render as. Defaults to `<span>` so it is valid inside headings and list items. */
  as?: ElementType
}

function hasIntersectionObserver(): boolean {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function'
}

export function BlurText({
  text,
  delay = 80,
  className = '',
  animateBy = 'words',
  direction = 'top',
  threshold = 0.2,
  rootMargin = '0px 0px -10% 0px',
  stepDuration = 0.32,
  as: Tag = 'span',
}: BlurTextProps) {
  const reduceMotion = useReducedMotion()

  // No observer available → start revealed rather than start hidden. A missing
  // browser API must never be the reason safety copy stays invisible.
  const [inView, setInView] = useState(() => !hasIntersectionObserver())
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (reduceMotion || inView) return

    // Failsafe first, so it is armed even if the observer construction throws.
    const failsafe = window.setTimeout(() => setInView(true), FAILSAFE_MS)

    if (!hasIntersectionObserver() || !ref.current) {
      setInView(true)
      return () => window.clearTimeout(failsafe)
    }

    const element = ref.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(element)

    return () => {
      window.clearTimeout(failsafe)
      observer.disconnect()
    }
    // `inView` is read to bail out once revealed; re-running after it flips is
    // harmless (the effect returns immediately) and keeps the deps honest.
  }, [reduceMotion, inView, threshold, rootMargin])

  const segments = useMemo(
    () => (animateBy === 'words' ? text.split(' ') : Array.from(text)),
    [text, animateBy],
  )

  const from = useMemo(
    () => ({ filter: 'blur(8px)', opacity: 0, y: direction === 'top' ? -18 : 18 }),
    [direction],
  )

  // Two-step resolve: most of the blur lifts early, the last of it settles with
  // the offset, so the word reads as coming into focus rather than sliding in.
  const to = useMemo(
    () => ({
      filter: ['blur(8px)', 'blur(4px)', 'blur(0px)'],
      opacity: [0, 0.6, 1],
      y: [direction === 'top' ? -18 : 18, direction === 'top' ? 3 : -3, 0],
    }),
    [direction],
  )

  // Under reduced motion the component is a plain text node: no motion
  // elements mounted at all, nothing that can strand the copy at opacity 0.
  if (reduceMotion) {
    return <Tag className={className}>{text}</Tag>
  }

  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {segments.map((segment, index) => {
        const transition: Transition = {
          duration: stepDuration * 2,
          times: [0, 0.5, 1],
          delay: (index * delay) / 1000,
          ease: 'easeOut',
        }

        return (
          <Fragment key={`${segment}-${index}`}>
            <motion.span
              aria-hidden="true"
              initial={from}
              animate={inView ? to : from}
              transition={transition}
              style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
            >
              {/* In letters mode a literal space would collapse inside an
                  inline-block, so it has to be a non-breaking one. */}
              {segment === ' ' ? '\u00A0' : segment}
            </motion.span>
            {/*
              A REAL space text node between the word spans, not a U+00A0
              inside them. Upstream appends a non-breaking space to each word,
              which turns the whole paragraph into a single unbreakable run —
              it only wraps there because the root is `flex flex-wrap`. This
              component renders into ordinary headings and list items, so it
              relies on normal inline layout instead, and that needs a genuine
              break opportunity between words.
            */}
            {animateBy === 'words' && index < segments.length - 1 ? ' ' : null}
          </Fragment>
        )
      })}
    </Tag>
  )
}
