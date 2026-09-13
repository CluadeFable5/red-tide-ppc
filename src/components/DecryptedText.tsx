import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * reactbits-style "Decryption" headline: every character starts life as a
 * random glyph and locks into the real one, left to right, so the title reads
 * as the data being resolved — the register of this app's own instrument
 * chrome, not a typewriter gimmick.
 *
 * (Pattern after reactbits.dev, MIT + Commons Clause — see
 * `docs/design-references.md` §14 for the licence note.)
 *
 * The scrambling is done on a ~30 ms interval rather than per-frame: the eye
 * cannot read glyphs changing faster than this, and a 33 fps scramble costs a
 * fraction of the 60 fps one.
 */

const GLYPHS = '!<>-_\\/[]{}=+*^?#01·'

/** ms between scramble ticks. */
const TICK_MS = 30
/** Ticks each character spends as a random glyph before it locks. */
const PER_CHAR_TICKS = 2
/** Ticks of pure scramble before the first character locks. */
const START_TICKS = 4

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
    reduceMotion ? text : scrambled(text),
  )
  const finishedRef = useRef(false)

  useEffect(() => {
    if (reduceMotion || finishedRef.current) {
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
