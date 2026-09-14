/**
 * The one place JavaScript learns about layout breakpoints.
 *
 * WHY THIS EXISTS
 * ---------------
 * `DecryptedText` gates its scramble on "is this a small screen", which has to
 * agree with the `sm:` boundary the layout uses. It used to hard-code
 * `matchMedia('(max-width: 640px)')` — a second, independent copy of the
 * number. That is a silent-drift trap: Tailwind's `sm` is `40rem`, and at the
 * browser's default 16px root font size that happens to equal 640px, so the
 * two agreed by coincidence rather than by construction. Retune the theme (or
 * ship a page where the user has bumped their browser's default font size, at
 * which point 40rem is NOT 640px) and the animation gate quietly stops
 * matching the layout.
 *
 * HOW THE SINGLE SOURCE OF TRUTH WORKS
 * ------------------------------------
 * `src/index.css` declares `--breakpoint-sm: 40rem` inside `@theme`. That token
 * is what Tailwind compiles the `sm:` variant from.
 *
 * Tailwind v4 tree-shakes `@theme` tokens, so `--breakpoint-sm` never reaches
 * the browser as a readable custom property. The stylesheet therefore
 * republishes it as `--bp-sm: theme(--breakpoint-sm)`, which the compiler
 * resolves to the same literal at build time. This module reads that.
 *
 * Net effect: one number, in `index.css`, consumed by both the `sm:` utilities
 * and this file. There is no pixel value written in TypeScript.
 */

/**
 * Last-resort fallback, in CSS units so it still tracks the root font size.
 * Only used if the stylesheet has not applied yet (very early call, or a test
 * environment with no CSS) — in which case there is no layout to disagree with.
 */
const FALLBACK_SM = '40rem'

/** Convert a CSS length (`40rem`, `640px`) to pixels, using the real root font size. */
function toPx(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return Number.NaN

  const numeric = Number.parseFloat(trimmed)
  if (Number.isNaN(numeric)) return Number.NaN

  if (trimmed.endsWith('rem')) {
    // `rem` is relative to the ROOT font size, which the user can change.
    // Resolving it properly is the whole point of not hard-coding 640.
    const rootSize = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    )
    return numeric * (Number.isNaN(rootSize) ? 16 : rootSize)
  }
  if (trimmed.endsWith('em')) {
    const rootSize = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    )
    return numeric * (Number.isNaN(rootSize) ? 16 : rootSize)
  }
  // px, or a bare number.
  return numeric
}

/** Read a breakpoint custom property off `:root`, falling back if absent. */
function readToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

/**
 * The `sm` breakpoint in CSS units, exactly as the stylesheet defines it
 * (e.g. `"40rem"`). Read live so it cannot go stale.
 */
export function smBreakpoint(): string {
  return readToken('--bp-sm', FALLBACK_SM)
}

/**
 * The `sm` breakpoint resolved to pixels against the current root font size.
 */
export function smBreakpointPx(): number {
  const px = toPx(smBreakpoint())
  return Number.isNaN(px) ? toPx(FALLBACK_SM) : px
}

/**
 * Is the viewport below the `sm` breakpoint — i.e. the width at which the
 * layout's `sm:` utilities have NOT kicked in yet?
 *
 * Mirrors Tailwind's own semantics: `sm:` applies at `width >= sm`, so "below
 * sm" is strictly narrower than the breakpoint. Uses `matchMedia` when
 * available so it reflects the same media-query engine the CSS uses.
 */
export function isBelowSm(): boolean {
  if (typeof window === 'undefined') return false

  const breakpoint = smBreakpoint()

  if (typeof window.matchMedia === 'function') {
    // `not all and (width >= X)` is the exact complement of Tailwind's `sm:`
    // condition, so the gate flips on precisely the same pixel the layout does.
    const query = window.matchMedia(`not all and (min-width: ${breakpoint})`)
    // A browser that cannot parse the query reports `media: "not all"`, which
    // never matches — fall through to the measured comparison in that case.
    if (query.media !== 'not all') return query.matches
  }

  const width = window.innerWidth || document.documentElement.clientWidth || 0
  return width > 0 && width < smBreakpointPx()
}
