import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import {
  animate,
  useDragControls,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from 'motion/react'
import type { DragControls, MotionValue } from 'motion/react'
import {
  SIDE_PANEL_FALLBACK_WIDTH,
  drawerWindowWidth,
  resolveSidePanelAnchor,
  sidePanelOffsets,
  toggleSidePanelState,
} from './sidePanelAnchors'
import type {
  SidePanelEdge,
  SidePanelOffsets,
  SidePanelState,
} from './sidePanelAnchors'

/**
 * Spring the drawer snaps with.
 *
 * Deliberately the same spring as the zone sheet (stiffness 420, damping 34,
 * mass 0.85): the drawer and the sheet are two gestures in one app, and they
 * should feel like one physics system. Duplicated rather than imported because
 * the sheet module is frozen — this interaction must not risk it.
 *
 * For reduced-motion we jump instantly (no spring), so keyboard users and
 * users with vestibular preferences still get a functional drawer without
 * motion.
 */
const SIDE_PANEL_SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.85,
} as const

/** A gesture that travelled less than this (px) was a tap, not a drag. */
const DRAG_SLOP = 6

export interface SidePanelDragEndInfo {
  /** Release velocity in px/s; positive is rightward (towards open). */
  velocity: { x: number }
}

export interface SidePanelController {
  /** Attach to the card track; also the element measured for width. */
  panelRef: RefObject<HTMLDivElement | null>
  /** Current resting state. */
  state: SidePanelState
  /** The edge the panel is pinned to — decides the sign of `collapsed`. */
  edge: SidePanelEdge
  /** Offsets in px for the measured card width. */
  offsets: SidePanelOffsets
  /** Measured card width in px (the fallback until layout reports). */
  panelWidth: number
  /** Drag limits for motion's `dragConstraints`, ordered for either edge. */
  constraints: { left: number; right: number }
  /** The card track's translateX. */
  offsetX: MotionValue<number>
  dragControls: DragControls
  /** Call from the drag surfaces' `onPointerDown`. */
  startDrag: (event: ReactPointerEvent<HTMLElement>) => void
  onDragStart: () => void
  onDragEnd: (info: SidePanelDragEndInfo) => void
  /** Animate to a state. */
  goTo: (state: SidePanelState) => void
  /** Switch open ↔ collapsed. */
  toggle: () => void
  /** True while a pointer gesture owns the panel. */
  dragging: boolean
  /** True if the gesture that just ended travelled far enough to count as a drag. */
  didDrag: () => boolean
}

export interface UseSidePanelOptions {
  /** Which screen edge the panel tucks into. Default `'left'`. */
  edge?: SidePanelEdge
  /**
   * Width assumed before the first measurement (jsdom has no layout at all).
   * Should match the panel's rendered width so the collapsed offset never
   * leaves a sliver visible. Default `SIDE_PANEL_FALLBACK_WIDTH`.
   */
  fallbackWidth?: number
}

/**
 * Owns the advisory drawer's position and its open/collapsed state.
 *
 * A horizontal, two-state sibling of the retired `useZoneSheet` — same structure on
 * purpose, so a reader who knows the sheet already knows this hook:
 *
 *  - `dragListener={false}` + `useDragControls` moves drag activation onto
 *    the grab tab, the drawer's only drag surface. The gauge card stays
 *    pointer-transparent so map gestures pass through it; making the card a
 *    drag surface would newly swallow map pans starting on that 172px card.
 *  - `dragMomentum={false}` is required. The snap is ours; letting motion run
 *    its own momentum animation first means two animations writing one motion
 *    value.
 *  - `offsetX.get()` at release already contains `dragElastic` overshoot,
 *    which is why `resolveSidePanelAnchor` clamps before it projects.
 *  - Continuous drag tracking: offsetX is updated every pointermove via
 *    motion's drag, so the card follows the finger 1:1. On release,
 *    velocity-aware snapping projects velocity forward (0.2s) and a flick
 *    always lands in the direction it was thrown.
 */
export function useSidePanel(
  initialState: SidePanelState = 'open',
  options: UseSidePanelOptions = {},
): SidePanelController {
  const edge = options.edge ?? 'left'
  const fallbackWidth = options.fallbackWidth ?? SIDE_PANEL_FALLBACK_WIDTH
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelWidth = useMeasuredWidth(panelRef, fallbackWidth)
  const offsets = useMemo(
    () => sidePanelOffsets(panelWidth, edge, fallbackWidth),
    [panelWidth, edge, fallbackWidth],
  )
  const constraints = useMemo(
    () => ({
      left: Math.min(offsets.open, offsets.collapsed),
      right: Math.max(offsets.open, offsets.collapsed),
    }),
    [offsets],
  )

  const offsetX = useMotionValue(offsets[initialState])
  const [state, setState] = useState<SidePanelState>(initialState)
  const [dragging, setDragging] = useState(false)
  const reduceMotion = useReducedMotion()
  const dragControls = useDragControls()

  // Handle to the in-flight snap, so a new gesture can cancel it.
  const snapAnimation = useRef<ReturnType<typeof animate> | null>(null)
  const dragOrigin = useRef(0)
  const dragTravelled = useRef(0)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const stopSnap = useCallback(() => {
    snapAnimation.current?.stop()
    snapAnimation.current = null
  }, [])

  const settle = useCallback(
    (target: SidePanelState) => {
      setState(target)
      stopSnap()
      const to = offsets[target]
      if (reduceMotion) {
        offsetX.jump(to)
        return
      }
      snapAnimation.current = animate(offsetX, to, SIDE_PANEL_SPRING)
    },
    [offsets, offsetX, reduceMotion, stopSnap],
  )

  const goTo = useCallback((target: SidePanelState) => settle(target), [settle])

  const toggle = useCallback(() => {
    settle(toggleSidePanelState(stateRef.current))
  }, [settle])

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      stopSnap()
      // Reset per-press, not per-drag-session: the tab's click handler asks
      // "did THIS press travel", and a press with no movement may never fire
      // onDragStart/onDragEnd — without this reset, a tap after a real drag
      // inherits the old gesture's travel and gets swallowed as a drag tail.
      // (Caught by real-browser verification: taps toggled on a fresh page
      // but stopped working after the first drag.)
      dragOrigin.current = offsetX.get()
      dragTravelled.current = 0
      dragControls.start(event)
    },
    [dragControls, offsetX, stopSnap],
  )

  const onDragStart = useCallback(() => {
    stopSnap()
    dragOrigin.current = offsetX.get()
    dragTravelled.current = 0
    setDragging(true)
  }, [offsetX, stopSnap])

  const onDragEnd = useCallback(
    ({ velocity }: SidePanelDragEndInfo) => {
      setDragging(false)
      const released = offsetX.get()
      dragTravelled.current = Math.abs(released - dragOrigin.current)
      settle(
        resolveSidePanelAnchor({ offset: released, velocity: velocity.x, offsets }),
      )
    },
    [offsetX, offsets, settle],
  )

  const didDrag = useCallback(() => dragTravelled.current > DRAG_SLOP, [])

  // Re-pin to the same state when the card geometry changes (font load,
  // rotation, readout changes). Without this the track keeps a px offset
  // computed for the old width and the collapsed card lands half-visible.
  // Keyed on geometry only — never on `state`, or every drag would be yanked
  // back to where it started.
  //
  // A layout effect: paired with the layout-effect measurement above, the
  // first painted frame already carries the measured offsets — a drawer that
  // mounts `collapsed` never paints a fallback-width mis-pin.
  useLayoutEffect(() => {
    stopSnap()
    offsetX.jump(offsets[stateRef.current])
  }, [offsets, offsetX, stopSnap])

  return {
    panelRef,
    state,
    edge,
    offsets,
    panelWidth,
    constraints,
    offsetX,
    dragControls,
    startDrag,
    onDragStart,
    onDragEnd,
    goTo,
    toggle,
    dragging,
    didDrag,
  }
}

/**
 * The clip window's width, driven by the SAME motion value as the track's
 * position — the invariant that makes mid-drag clipping structural.
 *
 * A subscription rather than `useTransform` on purpose (moved here from
 * `AdvisoryDrawer` and shared by both right-edge drawers): the card width
 * can change independently of the offset (font load, rotation, viewport
 * resize), and this keeps the width correct through both without depending
 * on how the transform helper caches its closure.
 */
export function useClipWindowWidth(
  offsetX: MotionValue<number>,
  panelWidth: number,
  edge: SidePanelEdge,
): MotionValue<number> {
  const windowWidth = useMotionValue(
    drawerWindowWidth(panelWidth, offsetX.get(), edge),
  )
  const panelWidthRef = useRef(panelWidth)
  panelWidthRef.current = panelWidth
  const edgeRef = useRef(edge)
  edgeRef.current = edge
  useMotionValueEvent(offsetX, 'change', (x) => {
    windowWidth.set(drawerWindowWidth(panelWidthRef.current, x, edgeRef.current))
  })
  useEffect(() => {
    windowWidth.set(drawerWindowWidth(panelWidth, offsetX.get(), edge))
  }, [panelWidth, offsetX, windowWidth, edge])
  return windowWidth
}

/**
 * Width of the card track.
 *
 * Falls back where layout does not exist (jsdom) — unlike the sheet, the
 * card width is the element's own, not the viewport's, so there is no window
 * dimension to fall back to.
 *
 * Measured in a LAYOUT effect: the hook re-pins the track to the measured
 * offsets in a second layout pass, and both land before the browser paints,
 * so a drawer that mounts `collapsed` never flashes a stale, fallback-width
 * offset for one frame. (Measured via `offsetWidth`, so jsdom stays on the
 * fallback forever — which is exactly what the DOM tests pin.)
 */
function useMeasuredWidth(
  ref: RefObject<HTMLElement | null>,
  fallbackWidth: number = SIDE_PANEL_FALLBACK_WIDTH,
): number {
  const [width, setWidth] = useState(() => fallbackWidth)

  useLayoutEffect(() => {
    const measure = () => {
      const measured = ref.current?.offsetWidth ?? 0
      if (measured > 0) {
        setWidth((current) => (current === measured ? current : measured))
      }
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)

    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      observer = new ResizeObserver(measure)
      observer.observe(ref.current)
    }

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      observer?.disconnect()
    }
  }, [ref])

  return width
}
