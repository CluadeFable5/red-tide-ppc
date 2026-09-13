import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Routes, useLocation } from 'react-router-dom'

/**
 * Route cross-fade for the map ↔ admin navigation.
 *
 * WHY OPACITY ONLY
 * ----------------
 * The map page contains a live Leaflet instance. Leaflet measures its
 * container and positions every pane by writing transforms, and it does all of
 * that on mount. Animating `transform` or `filter` on an ancestor of the map
 * element is a known way to get a mis-measured canvas, so the wrapper animates
 * opacity alone. That still removes the hard cut, which is all this is for,
 * without touching the map's coordinate space.
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
 * Must be rendered inside a Router: it calls `useLocation`.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: reduceMotion ? 0.01 : 0.2,
          ease: [0.22, 1, 0.36, 1],
        }}
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
