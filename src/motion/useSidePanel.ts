import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import {
  animate,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from 'motion/react'
import type { DragControls, MotionValue } from 'motion/react'
import {
  SIDE_PANEL_FALLBACK_WIDTH,
  resolveSidePanelAnchor,
  sidePanelOffsets,
  toggleSidePanelState,
} from './sidePanelAnchors'
import type { SidePanelOffsets, SidePanelState } from './sidePanelAnchors'

/**
 * Spring the panel snaps with.
 *
 * Deliberately the same spring as the zone sheet (stiffness 420, damping 34,
 * mass 0.85): the drawer and the sheet are two gestures in one app, and they
 * should feel like one physics system. Duplicated rather than imported because
 * the sheet module is frozen — this interaction must not risk it.
 *
 * For reduced-motion we jump instantly (no spring), so keyboard users and
 * users with vestibular preferences still get a functional panel without
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
  /** Attach to the panel element; also the element measured for width. */
  panelRef: RefObject<HTMLDivElement | null>
  /** Current resting state. */
  state: SidePanelState
  /** Offsets in px for the measured panel width. */
  offsets: SidePanelOffsets
  /** The panel's translateX. */
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

/**
 * Owns the status panel's position and its open/collapsed state.
 *
 * A horizontal, two-state mirror of `useZoneSheet` — same structure on
 * purpose, so a reader who knows the sheet already knows this hook:
 *
 *  - `dragListener={false}` + `useDragControls` moves drag activation onto
 *    explicit surfaces (the grab tab + the pills row). The gauge card stays
 *    pointer-transparent so map gestures pass through it; dragging the whole
 *    panel would fight the map underneath.
 *  - `dragMomentum={false}` is required. The snap is ours; letting motion run
 *    its own momentum animation first means two animations writing one motion
 *    value.
 *  - `offsetX.get()` at release already contains `dragElastic` overshoot,
 *    which is why `resolveSidePanelAnchor` clamps before it projects.
 *  - Continuous drag tracking: offsetX is updated every pointermove via
 *    motion's drag, so the panel follows the finger 1:1. On release,
 *    velocity-aware snapping projects velocity forward (0.2s) and a flick
 *    always lands in the direction it was thrown.
 */
export function useSidePanel(
  initialState: SidePanelState = 'open',
): SidePanelController {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelWidth = useMeasuredWidth(panelRef)
  const offsets = useMemo(() => sidePanelOffsets(panelWidth), [panelWidth])

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
      dragControls.start(event)
    },
    [dragControls, stopSnap],
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

  // Re-pin to the same state when the panel geometry changes (pills wrapping
  // on a narrow screen, rotation, count changes). Without this the panel keeps
  // a px offset computed for the old width and the collapsed tab lands
  // half-clipped or floating. Keyed on geometry only — never on `state`, or
  // every drag would be yanked back to where it started.
  useEffect(() => {
    stopSnap()
    offsetX.jump(offsets[stateRef.current])
  }, [offsets, offsetX, stopSnap])

  return {
    panelRef,
    state,
    offsets,
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
 * Width of the panel's own surface.
 *
 * Falls back to `SIDE_PANEL_FALLBACK_WIDTH` where layout does not exist
 * (jsdom) — unlike the sheet, the panel width is the element's own, not the
 * viewport's, so there is no window dimension to fall back to.
 */
function useMeasuredWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(() => SIDE_PANEL_FALLBACK_WIDTH)

  useEffect(() => {
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
