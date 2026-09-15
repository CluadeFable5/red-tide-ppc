import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Routes, useLocation } from 'react-router-dom'

/**
 * Route cross-fade for the landing ↔ map ↔ admin navigation.
 *
 * TIMING
 * ------
 * The incoming page rises in over 300ms; the outgoing one leaves over 120ms.
 * `mode="wait"` runs them back to back rather than overlapping, so the whole
 * handover is ~420ms of which the part the eye follows — the map arriving — is
 * the 300ms. That is the budget in the brief: long enough to read as motion,
 * short enough that a utility never feels like it is waiting for its own
 * animation. The exit is deliberately much shorter than the enter: the page you
 * are leaving has nothing to say, and a symmetric fade reads as hesitation.
 *
 * Both use the app's ease-out-quint (`--ease-out-quint` in index.css) on the way
 * in and its mirror on the way out — fast off the mark, no bounce at the end.
 *
 * THE TRANSFORM, AND WHY IT IS NOW ALLOWED
 * ---------------------------------------
 * Earlier revisions animated opacity alone, on the reasoning that a transformed
 * ancestor makes Leaflet mis-measure its container. That reasoning is half
 * right, and the half that is wrong is the part that mattered:
 *
 *   - Leaflet sizes itself from `container.clientWidth/clientHeight`, which are
 *     *layout* boxes. A CSS transform on an ancestor does not change them, so
 *     the map measures identically mid-animation and at rest.
 *   - Leaflet 1.9 maps pointer coordinates through `DomUtil.getScale()`, which
 *     is `getBoundingClientRect()` over `offsetWidth` — i.e. it already accounts
 *     for a scaled container. (This is the same reason MapPage's underlay is
 *     allowed to scale the map as the sheet rises; see Map.tsx.)
 *
 * What a transformed ancestor *does* change is the containing block: any
 * `position: fixed` descendant resolves against the transformed element instead
 * of the viewport. MapPage's map layer is exactly that (`fixed inset-0`), so a
 * transform left behind at rest would quietly re-parent it. Two things keep that
 * from happening: the animation ends on identity values, and `onAnimationComplete`
 * clears the inline transform outright (see below). Verified in a real browser by
 * `scripts/route-transition-pass.mjs`, which compares the map's container box,
 * map-pane transform, tile rects and zone-polygon geometry after the animated
 * entry against a plain `/map` load with no transition at all.
 *
 * WHY `location` IS PASSED TO <Routes>
 * ------------------------------------
 * `<Routes>` reads the *current* location from context. Without the explicit
 * `location` prop, the outgoing tree would re-render on the new URL while it
 * faded out — mounting the incoming page a second time. In this app that is
 * not a cosmetic problem: it would briefly mount two Leaflet maps, which both
 * measure and claim the same DOM, and it duplicated every control on the admin
 * page (two passcode fields, two Unlock buttons).
 *
 * Passing the location captured during *this render* means the cached element
 * AnimatePresence holds for the outgoing tree keeps pointing at the outgoing
 * route, so exactly one page is ever mounted.
 *
 * `mode="wait"` holds the outgoing page until its fade finishes, so the two
 * never overlap and the destroy/create of the map stays strictly sequential.
 *
 * REDUCED MOTION
 * --------------
 * `prefers-reduced-motion: reduce` gets an *instant* swap, not a shorter or
 * gentler version of the same move: no enter keyframes (`initial={false}`), no
 * exit at all (`exit` omitted, so AnimatePresence unmounts immediately) and no
 * transform keys anywhere, so nothing is ever written to the element. A fade is
 * still motion, and the vestibular complaint reduced-motion exists for is not
 * about distance.
 *
 * Must be rendered inside a Router: it calls `useLocation`.
 */

/** index.css `--ease-out-quint`, as a motion bezier. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const
/** Its mirror: the outgoing page accelerates away. */
const EASE_IN = [0.4, 0, 1, 1] as const

const ENTER_MS = 0.3
const EXIT_MS = 0.12

/** Arriving: a 1.5% scale-up and a 12px rise, landing on identity. */
const ENTER_FROM = { opacity: 0, scale: 0.985, y: 12 }
const AT_REST = { opacity: 1, scale: 1, y: 0 }
/** Leaving: a shorter fade with a slight lift, so it reads as being replaced. */
const EXIT_TO = { opacity: 0, scale: 0.99, y: -6 }

export function RouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const frameRef = useRef<HTMLDivElement | null>(null)

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        ref={frameRef}
        data-route-frame=""
        {...(reduceMotion
          ? {
              // Instant swap: mount straight at the resting state, no exit.
              initial: false as const,
              animate: { opacity: 1 },
              transition: { duration: 0 },
            }
          : {
              initial: ENTER_FROM,
              animate: AT_REST,
              exit: { ...EXIT_TO, transition: { duration: EXIT_MS, ease: EASE_IN } },
              transition: { duration: ENTER_MS, ease: EASE_OUT },
              onAnimationComplete: () => clearTransform(frameRef.current),
            })}
        // Leaflet's panes overflow this container by design in some zoom
        // states, so it must not clip.
        className="min-h-full"
      >
        <ScrollToTop />
        <Routes location={location}>{children}</Routes>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Drop the inline transform once the page has arrived.
 *
 * `scale: 1, y: 0` is visually identity but it is still a transform as far as
 * CSS is concerned, and a transform on an ancestor makes every `position: fixed`
 * descendant resolve against that ancestor instead of the viewport. MapPage's
 * map layer is `fixed inset-0 h-[100dvh]`, so leaving one behind would silently
 * re-parent the map to this frame — identical while scrolled to the top, wrong
 * the moment anything scrolls. Clearing it restores the viewport as the
 * containing block and also drops the compositing layer the animation promoted.
 *
 * Runs only on the enter: AnimatePresence calls it for the exit too, and by then
 * the element is about to unmount, so touching it is pointless.
 */
function clearTransform(node: HTMLDivElement | null) {
  if (!node || node.style.opacity !== '1') return
  node.style.transform = 'none'
  node.style.willChange = 'auto'
}

/**
 * Resets scroll when a route mounts.
 *
 * Mounted *inside* the animated wrapper so it runs as the incoming page
 * appears, after the outgoing page has finished fading. Keying an effect on
 * `location` instead would scroll the page that is still on screen, yanking it
 * mid-fade.
 */
function ScrollToTop() {
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    } catch {
      /* jsdom and some embedded webviews do not implement scrollTo. */
    }
  }, [])

  return null
}
