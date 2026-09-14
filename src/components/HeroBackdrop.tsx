import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * The landing hero's backdrop, and the single place that decides whether any
 * WebGL is allowed to exist on this page.
 *
 * WHY THERE IS WebGL HERE AT ALL
 * ------------------------------
 * This project's standing constraint is "no WebGL / canvas-heavy effects" —
 * the audience is coastal Puerto Princesa on rural connectivity and low-end
 * Android. The Ferrofluid hero is an explicitly signed-off exception, scoped
 * to the hero panel only, and it is paid for with every mitigation below.
 * See `docs/design-references.md` §15.
 *
 * THE MITIGATIONS, ALL OF THEM
 * ----------------------------
 *  1. **Reduced motion mounts no canvas.** If `prefers-reduced-motion` is set
 *     the lazy chunk is never imported and no GL context is ever created —
 *     the static gradient below is the whole backdrop. This is a hard skip,
 *     not a paused canvas.
 *  2. **Lazy-loaded.** `ogl` sits in its own chunk behind `React.lazy`, so the
 *     landing page's HTML, CSS and app JS parse and paint without it. On a 3G
 *     connection the page is readable before the shader arrives.
 *  3. **`dpr={1}`.** Not `devicePixelRatio`. On a DPR-3 phone this is a 9×
 *     reduction in fragments shaded per frame, and the effect is a soft
 *     out-of-focus glow that nobody can tell apart at 1×.
 *  4. **Paused off-screen.** An `IntersectionObserver` on the hero stops the
 *     rAF loop the moment it scrolls away — the rest of the landing page
 *     scrolls with no GL work at all.
 *  5. **Paused on `document.hidden`.** A backgrounded tab renders nothing.
 *  6. **No pointer interaction.** `mouseInteraction={false}`: this is a
 *     glance, not a toy, and it also means no `pointermove` handler on the
 *     main thread during scroll.
 *  7. **Deferred first mount.** The canvas is only imported once the browser
 *     is idle, so it never competes with first paint or with the live
 *     Firestore subscription the figures depend on.
 *
 * The gradient underneath is always painted, WebGL or not — so the hero never
 * flashes as a black hole, and a failed chunk load is invisible.
 */

const Ferrofluid = lazy(() => import('./ferrofluid/Ferrofluid'))

/** Amber / off-white / near-black, matching the app's tokens. */
export const FERROFLUID_COLORS = ['#f0a500', '#eaeaea', '#080808']

/** Wait for idle before pulling the WebGL chunk (ms fallback for Safari). */
const IDLE_TIMEOUT_MS = 1200

/**
 * The always-present, zero-cost backdrop: an amber wash off the top-left
 * falling into the page's near-black. This is what reduced-motion users,
 * WebGL-less devices and slow connections see, and it sits underneath the
 * canvas for everyone else.
 */
function StaticBackdrop() {
  return (
    <div
      aria-hidden="true"
      data-testid="hero-static-backdrop"
      className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_0%,rgba(240,165,0,0.16),rgba(240,165,0,0.05)_42%,rgba(8,8,8,0)_72%)]"
    />
  )
}

/**
 * Feather mask applied to the whole backdrop.
 *
 * The hero panel is as wide as the content column, so without this its left
 * and right edges are a hard vertical cut against the page ground — measured
 * in a real browser at an 11.17/255 luminance step at x=304, clearly visible
 * as a rectangle of lighter background behind the headline. The horizontal
 * pass feathers both sides, the vertical pass fades the bottom into the page.
 */
const FEATHER_MASK = [
  'linear-gradient(to right, transparent 0, black 18%, black 82%, transparent 100%)',
  'linear-gradient(to bottom, black 0, black 62%, transparent 100%)',
].join(', ')

/** The two mask passes must intersect, so both edges feather. */
const featherStyle: CSSProperties = {
  maskImage: FEATHER_MASK,
  WebkitMaskImage: FEATHER_MASK,
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
}

export function HeroBackdrop({ className = '' }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)

  // Has the hero ever been on screen, and is the tab in front? Both must hold
  // for a frame to be drawn.
  const [visible, setVisible] = useState(false)
  const [tabActive, setTabActive] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )
  // Gate on idle so the shader chunk never competes with first paint.
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    if (reduceMotion) return

    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const w = window as IdleWindow

    if (typeof w.requestIdleCallback === 'function') {
      const handle = w.requestIdleCallback(() => setIdle(true), { timeout: IDLE_TIMEOUT_MS })
      return () => w.cancelIdleCallback?.(handle)
    }
    const timer = window.setTimeout(() => setIdle(true), IDLE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [reduceMotion])

  // Pause when the hero leaves the viewport.
  useEffect(() => {
    if (reduceMotion) return
    const element = ref.current
    if (!element) return

    if (typeof IntersectionObserver !== 'function') {
      // No observer: treat the hero as visible. It is at the top of the page,
      // and `document.hidden` still gates the loop.
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting)
      },
      // NO positive rootMargin. It was '100px', which measured as a real bug:
      // the landing page at 1280x800 is only ~537px of scroll, so a fully
      // scrolled-out hero still sits at bottom=-88px — inside a 100px margin,
      // so the observer never reported it as hidden and the shader ran for the
      // entire visit on desktop. Pausing exactly at the viewport edge costs
      // nothing visually: the canvas keeps its last frame while paused, so
      // resuming is not a pop.
      { threshold: 0, rootMargin: '0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [reduceMotion])

  // Pause when the tab is backgrounded.
  useEffect(() => {
    if (reduceMotion) return
    const onVisibility = () => setTabActive(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [reduceMotion])

  // Reduced motion: the gradient IS the backdrop. No lazy import is triggered,
  // so `ogl` is never fetched and no GL context is ever created.
  if (reduceMotion) {
    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${className}`}
        style={featherStyle}
      >
        <StaticBackdrop />
      </div>
    )
  }

  // Only mount the canvas once the hero has actually been seen *and* the
  // browser has gone idle — a visitor who lands and immediately scrolls past
  // never pays for the chunk.
  const mountCanvas = idle && visible

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="hero-backdrop"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={featherStyle}
    >
      <StaticBackdrop />

      {mountCanvas ? (
        <Suspense fallback={null}>
          <div className="absolute inset-0 opacity-70">
            <Ferrofluid
              // Capped hard at 1: the dominant cost of a full-bleed shader is
              // fragments, and fragments scale with the square of the DPR.
              dpr={1}
              paused={!visible || !tabActive}
              colors={FERROFLUID_COLORS}
              // Slow and large: fewer, softer blobs read as ambience rather
              // than as an animation demanding attention, and a bigger
              // feature size means less high-frequency noise to shade.
              speed={0.28}
              scale={2.1}
              turbulence={0.7}
              fluidity={0.14}
              rimWidth={0.22}
              sharpness={2.6}
              shimmer={1.1}
              glow={1.5}
              flowDirection="down"
              opacity={0.85}
              // A landing-page glance, not an interactive demo.
              mouseInteraction={false}
            />
          </div>
        </Suspense>
      ) : null}

      {/*
        The bottom fade is part of FEATHER_MASK (the vertical pass), so the
        panel dissolves into the page ground rather than ending on an edge.
      */}
    </div>
  )
}
