import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import { Routes, useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'

/**
 * The route dissolve: `/` ⇄ `/map` cross-fade through black.
 *
 * WHAT IT IS
 * ----------
 * One continuous dip-to-dark, in three movements:
 *
 *   0ms    the page you are leaving holds, then accelerates away  (350ms, easeIn)
 *   ~350ms black — the URL has changed, the incoming chunk has loaded,
 *          and nothing is on screen                                  (~0-100ms)
 *   400ms  the page you asked for rises 8px and fades up           (400ms, easeOut)
 *
 * `mode="wait"` runs the two halves back to back rather than overlapping, so the
 * handover is sequential by construction: the outgoing page is gone before the
 * incoming one mounts. Nothing is ever half-visible on top of anything else, and
 * — because the app's pages own `position: fixed` layers and a Leaflet map —
 * there is never more than one page mounted either.
 *
 * WHY THE EXIT IS EASE-IN AND THE ENTER EASE-OUT
 * -----------------------------------------------
 * Direction matters, and it is the opposite of what a symmetric cross-fade
 * assumes: the page you are leaving holds its content and then accelerates away
 * (ease-in), while the page you asked for snaps to visible and then settles
 * (ease-out — the app's own `--ease-out-quint`, so the arrival moves like the
 * rest of the app). Read together that is a short, confident dark beat rather
 * than a long symmetric fade, which reads as hesitation. The exit is also the
 * shorter half: the page being replaced has nothing left to say.
 *
 * The enter also travels: 8px up from below, landing on identity. It is the only
 * transform in the transition, it is on the incoming page only, and it is small
 * enough to be felt rather than watched. (Earlier revisions also scaled; the
 * scale was dropped because 8px of rise already carries the "arriving" idea, and
 * one small transform is less to defend against `position: fixed` descendants —
 * see `clearTransform`.)
 *
 * THE LAZY CHUNK, AND WHY THE ENTER WAITS FOR IT
 * ----------------------------------------------
 * `/map` is `React.lazy`. If the enter started on mount, a slow chunk would
 * spend the whole 400ms fading in *empty space* — the Suspense fallback — and
 * then hard-cut to the map when the module finally executed. So the frame is
 * *gated*: `RouteTransition` is told which promise makes each route renderable
 * (App.tsx passes `{ '/map': prefetchMapPage }`), and an incoming frame that has
 * a pending promise holds at opacity 0 until it resolves. The map then mounts
 * *underneath* the still-black screen and the fade-in happens over a rendered
 * map — which is also why `MapLoadingFallback` is transparent: during that
 * window dark is the correct thing to show, and a spinner or a brand mark in the
 * middle of a dissolve breaks it.
 *
 * With the landing page's hover/focus prefetch the chunk is normally in memory
 * before the click, so the gate resolves in a microtask and costs a frame or two
 * at most. On a cold `/map` load the gate is what turns "black, then map" into
 * "black, then map fading up".
 *
 * ROUTES OUTSIDE THE DISSOLVE
 * ---------------------------
 * Only `/` and `/map` dissolve. `/admin` (and the `*` redirect) swap instantly:
 * no enter, and — via the `dissolve` pair flag passed to `AnimatePresence` as
 * `custom` — no exit on the page being left either, whichever side of the
 * navigation the admin page is on. `custom` is how this is possible at all: the
 * outgoing element was rendered before the navigation existed, so its props are
 * frozen and it cannot be asked "where are you going?" at exit time. Motion
 * re-resolves an exiting child's `exit` against AnimatePresence's *current*
 * `custom`, which is exactly the hook needed to decide at exit time whether this
 * handover is a dissolve or a cut. (Deliberately a boolean rather than a
 * direction: the brief asks for the reverse transition to fall out of the same
 * variants, and it does — `/map` → `/` is the same pair with the roles swapped.)
 *
 * WHY `location` IS PASSED TO <Routes>
 * ------------------------------------
 * `<Routes>` reads the *current* location from context. Without the explicit
 * `location` prop, the outgoing tree would re-render on the new URL while it
 * faded out — mounting the incoming page a second time. In this app that is not
 * a cosmetic problem: it would briefly mount two Leaflet maps, which both
 * measure and claim the same DOM, and it duplicated every control on the admin
 * page (two passcode fields, two Unlock buttons).
 *
 * REDUCED MOTION
 * --------------
 * `prefers-reduced-motion: reduce` gets an *instant* swap, not a shorter or
 * gentler version of the same move: no enter keyframes (`initial={false}`), no
 * exit at all, and no transform keys anywhere, so nothing is ever written to the
 * element. A fade is still motion, and the vestibular complaint reduced-motion
 * exists for is not about distance.
 *
 * Must be rendered inside a Router: it calls `useLocation`.
 */

/** index.css `--ease-out-quint`, as a motion bezier: snaps to visible, settles. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const
/**
 * `easeIn`: holds its content, then the fade accelerates away.
 *
 * Deliberately *this* curve and not the mirror of the quint above. The mirror
 * (`0.64, 0, 0.78, 0`) looks principled on paper and is wrong on screen: it is
 * still at ~40% opacity nine tenths of the way through the 350ms, so the whole
 * visible fade is over in the last 35ms and reads as a flicker to black rather
 * than a fade. Measured mid-flight opacities, fraction of the exit → opacity:
 *
 *     30% → 0.87    50% → 0.69    70% → 0.47    90% → 0.16
 *
 * — a fade the eye can follow, ending decisively.
 */
const EASE_IN = [0.42, 0, 1, 1] as const

/**
 * The only two numbers that set the pace of the app's navigation.
 *
 * Tap to fully-arrived is `EXIT_S + ENTER_S` (750ms) when the incoming chunk is
 * already warm. The two are sequential, not overlapping, so the near-black beat
 * between them is the tail of the exit plus the head of the enter — a frame or
 * two in practice, and longer only when the incoming chunk is still arriving, in
 * which case dark is exactly what should be on screen.
 */
const EXIT_S = 0.35
const ENTER_S = 0.4

/** Arriving: 8px up from below, landing on identity. */
const ENTER_FROM = { opacity: 0, y: 8 }
const AT_REST = { opacity: 1, y: 0 }

/** Leaving: opacity only. The outgoing page is not "going" anywhere. */
const EXIT_ANIMATED = { opacity: 0, transition: { duration: EXIT_S, ease: EASE_IN } }
/** Outside the dissolve: gone this frame, no animation to wait for. */
const EXIT_INSTANT = { opacity: 1, transition: { duration: 0 } }

/**
 * An `exit` variant that reads AnimatePresence's `custom` — the `dissolve` flag
 * for the navigation that is starting. Every frame uses this same resolver, so
 * which of the two behaviours a frame gets is decided by *that* navigation
 * rather than by how the frame was rendered.
 *
 * It lives in `variants` and is referenced by label because that is the only way
 * to hand motion a variant *resolver* here: `exit` itself is typed as a target
 * object or a label, while the runtime resolves a function it finds in
 * `variants` — with `custom` — exactly as wanted. (`motion-dom`'s
 * `resolveVariants`: label → `props.variants[label]` → if it is a function, call
 * it with `custom`.)
 */
const FRAME_VARIANTS: Variants = {
  exit: (dissolvePair?: boolean) => (dissolvePair === true ? EXIT_ANIMATED : EXIT_INSTANT),
}

/** Routes that dissolve into each other. Everything else swaps instantly. */
const DISSOLVES = new Set(['/', '/map'])

/**
 * Per-route "this page is renderable" promises, keyed by pathname. A route
 * without an entry has nothing to wait for.
 */
export type RoutePreparation = Record<string, () => Promise<unknown>>

export function RouteTransition({
  children,
  prepare,
}: {
  children: ReactNode
  prepare?: RoutePreparation
}) {
  const location = useLocation()
  const reduceMotion = useReducedMotion()

  /**
   * Where this navigation is coming from, and the pathname whose render it was
   * captured for.
   *
   * Both live in state because the answer has to survive every re-render of the
   * navigation — `AnimatePresence` re-renders several times between the click
   * and the incoming page mounting (it commits the exit, then the new child),
   * and by the time the incoming frame renders, `location` has long since
   * stopped describing where we came from. Writing them *during render* (the
   * documented "adjust state when props change" pattern) keeps them correct in
   * the very first render of the new location, which is the render that starts
   * the exit and therefore the one that decides whether it animates.
   */
  const [previousPath, setPreviousPath] = useState(location.pathname)
  const [originPath, setOriginPath] = useState(location.pathname)
  if (previousPath !== location.pathname) {
    setOriginPath(previousPath)
    setPreviousPath(location.pathname)
  }

  const dissolve =
    !reduceMotion && DISSOLVES.has(originPath) && DISSOLVES.has(location.pathname)

  return (
    /*
      `initial={false}`: the first page of a session renders at rest. A cold load
      of the landing page fading up out of black would be a slow way to say
      "hello", and it is not a transition — nothing preceded it.
    */
    <AnimatePresence mode="wait" initial={false} custom={dissolve}>
      <RouteFrame
        key={location.pathname}
        location={location}
        dissolve={dissolve}
        prepare={prepare?.[location.pathname]}
      >
        {children}
      </RouteFrame>
    </AnimatePresence>
  )
}

function RouteFrame({
  location,
  dissolve,
  prepare,
  children,
}: {
  location: Location
  dissolve: boolean
  prepare?: () => Promise<unknown>
  children: ReactNode
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)

  /**
   * Has this route finished loading?
   *
   * Per-frame state, which is the point: the gate has to belong to the frame
   * that is entering, not to the router. A frame keyed by pathname is a fresh
   * component instance, so a second visit asks its own question instead of
   * inheriting the first visit's answer.
   *
   * `useState` for the initial value (so a frame whose chunk is already in
   * memory starts at rest) and a layout effect to subscribe, because the state
   * of an already-resolved promise is still only knowable from its callback —
   * a microtask, which this way lands before the browser paints the frame at
   * opacity 0.
   */
  const [prepared, setPrepared] = useState(() => !prepare)
  useLayoutEffect(() => {
    if (!prepare) return
    let live = true
    prepare().then(() => {
      if (live) setPrepared(true)
    })
    return () => {
      live = false
    }
  }, [prepare])

  // The gate is a *hold*, not a state: a page that is not dissolving has
  // nothing to wait for, and must never be held at opacity 0.
  const ready = !dissolve || prepared

  const frameProps = dissolve
    ? {
        initial: ENTER_FROM,
        animate: ready ? AT_REST : ENTER_FROM,
        transition: { duration: ENTER_S, ease: EASE_OUT },
        exit: 'exit',
        onAnimationComplete: () => clearTransform(frameRef.current),
      }
    : {
        // Outside the dissolve: at rest from the first frame, in and out.
        initial: false as const,
        animate: { opacity: 1 },
        transition: { duration: 0 },
        exit: 'exit',
      }

  return (
    <motion.div
      ref={frameRef}
      data-route-frame=""
      // Leaflet's panes overflow this container by design in some zoom states,
      // so it must not clip.
      className="min-h-full"
      variants={FRAME_VARIANTS}
      {...frameProps}
    >
      <ScrollToTop />
      <Routes location={location}>{children}</Routes>
    </motion.div>
  )
}

/**
 * Drop the inline transform once the page has arrived.
 *
 * The enter's last frame is `y: 0`, which motion renders as `transform: none` —
 * which is *not* a containing block, so the fixed map layer is already safe at
 * rest. This is the belt to that braces: it also drops the compositing layer and
 * the `will-change` hint the animation left behind, so nothing about the frame
 * outlives the transition. (A transform that *did* survive would re-parent
 * MapPage's `fixed inset-0` map layer onto this frame: identical while scrolled
 * to the top, wrong the moment anything scrolls.)
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
