import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { isBelowSm } from '../lib/breakpoints'

/**
 * "Decryption" headline: every character starts life as a random glyph and
 * locks into the real one, left to right, so the title reads as the data
 * being resolved.
 *
 * (Pattern after reactbits.dev, MIT + Commons Clause — see
 * `docs/design-references.md` §14 for the licence note.)
 *
 * KEPT CHEAP ON PURPOSE
 * ---------------------
 * The scramble runs on a 20 ms interval (the eye cannot read glyphs changing
 * faster) and resolves in well under half a second, then tears itself down —
 * no timers survive the intro. On small viewports (the low-end phones this
 * tool is mostly used on) and under reduced motion the effect is skipped
 * entirely and the title renders as plain text.
 */

const GLYPHS = '!<>-_\\\\/[]{}=+*^?#01·'

/** ms between scramble ticks. */
const TICK_MS = 20
/** Ticks each character spends as a random glyph before it locks. */
const PER_CHAR_TICKS = 1
/** Ticks of pure scramble before the first character locks. */
const START_TICKS = 2

/**
 * Below the `sm` breakpoint the scramble is skipped: it is decoration the
 * layout gets no value from, and setInterval churn on a low-end phone is
 * exactly the jank the landing page cannot afford.
 *
 * The boundary comes from `isBelowSm()`, which reads the same `--breakpoint-sm`
 * token the `sm:` utilities are compiled from (see `src/lib/breakpoints.ts`).
 * This used to be a hard-coded `(max-width: 640px)` — a second copy of the
 * number that agreed with the theme only by coincidence.
 */
function smallViewport(): boolean {
  return isBelowSm()
}

function scrambled(text: string): string {
  return Array.from(text)
    .map((char) =>
      char === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    )
    .join('')
}

export function DecryptedText({
  text,
  delay = 0,
  className = '',
}: {
  text: string
  /** Wait this long (ms) before the scramble starts. */
  delay?: number
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState<string>(() =>
    reduceMotion || smallViewport() ? text : scrambled(text),
  )
  const finishedRef = useRef(false)

  useEffect(() => {
    if (reduceMotion || smallViewport() || finishedRef.current) {
      setDisplay(text)
      return
    }

    const chars = Array.from(text)
    let ticks = 0
    let interval: number | undefined

    const timer = window.setTimeout(() => {
      interval = window.setInterval(() => {
        ticks += 1
        // Left to right: character i locks `START_TICKS + i * PER_CHAR_TICKS`
        // ticks in, so the title resolves across its width.
        const locked = Math.max(
          0,
          Math.floor((ticks - START_TICKS) / PER_CHAR_TICKS),
        )
        setDisplay(
          chars
            .map((char, index) => {
              if (char === ' ') return ' '
              if (index < locked) return char
              return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
            })
            .join(''),
        )
        if (locked >= chars.length) {
          if (interval !== undefined) window.clearInterval(interval)
          setDisplay(text)
          finishedRef.current = true
        }
      }, TICK_MS)
    }, delay)

    return () => {
      window.clearTimeout(timer)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [text, delay, reduceMotion])

  return (
    <span className={`relative inline-block ${className}`} aria-label={text}>
      {/* The finished string reserves the exact final width, so the scramble
          never reflows the layout around it. */}
      <span aria-hidden="true" className="invisible">
        {text}
      </span>
      <span aria-hidden="true" className="absolute inset-0">
        {display}
      </span>
    </span>
  )
}
