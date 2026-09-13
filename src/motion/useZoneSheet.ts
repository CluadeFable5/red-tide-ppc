import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import {
  animate,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import type { DragControls, MotionValue } from 'motion/react'
import {
  chromeOpacity,
  nextSheetAnchor,
  resolveSheetAnchor,
  sheetOffsets,
  underlayProgress,
  underlayRadius,
  underlayScale,
  underlayShadow,
  underlayVeil,
} from './sheetAnchors'
import type { SheetAnchor, SheetOffsets } from './sheetAnchors'

/**
 * Spring the sheet snaps with. Stiffness/damping are the values in the brief:
 * stiff enough that a flick lands without a visible "arrive and settle", damped
 * enough that it does not overshoot the anchor and come back — on a
 * viewport-tall panel an overshoot reads as a glitch, not as springiness.
 */
const SHEET_SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const

/** A gesture that travelled less than this (px) was a tap, not a drag. */
const DRAG_SLOP = 6

export interface SheetDragEndInfo {
  /** Release velocity in px/s; positive is downward (towards peek). */
  velocity: { y: number }
}

/** Motion values the map underlay reads. All derived from one progress value. */
export interface SheetUnderlayValues {
  scale: MotionValue<number>
  radius: MotionValue<number>
  veil: MotionValue<number>
  shadow: MotionValue<number>
}

export interface ZoneSheetController {
  /** Attach to the sheet element; also the element measured for viewport height. */
  sheetRef: RefObject<HTMLDivElement | null>
  /** Current resting anchor. */
  anchor: SheetAnchor
  /** Offsets in px for the measured viewport. */
  offsets: SheetOffsets
  /** The sheet's translateY. */
  offsetY: MotionValue<number>
  /** 0 at peek → 1 at full. The `animatedIndex` equivalent for this sheet. */
  progress: MotionValue<number>
  /** 1 while chrome over the map should be visible, 0 once the sheet rises. */
  chromeOpacity: MotionValue<number>
  /** Recede transform for the map beneath the sheet. */
  underlay: SheetUnderlayValues
  dragControls: DragControls
  /** Call from the drag surface's `onPointerDown`. */
  startDrag: (event: ReactPointerEvent<HTMLElement>) => void
  onDragStart: () => void
  onDragEnd: (info: SheetDragEndInfo) => void
  /** Animate to an anchor. */
  goTo: (anchor: SheetAnchor) => void
  /** Advance peek → mid → full → peek. */
  cycle: () => void
  /** True while a pointer gesture owns the sheet. */
  dragging: boolean
  /** True if the gesture that just ended travelled far enough to count as a drag. */
  didDrag: () => boolean
}

/**
 * Owns the sheet's position, its anchor state, and the shared progress value
 * the map underlay is driven from.
 *
 * It lives in `motion/` rather than inside the sheet component because the
 * value it exposes is genuinely shared: the map recede, the chrome fade and the
 * sheet's own readouts are one continuous number, and splitting that across two
 * components is exactly how an underlay drifts out of sync mid-drag.
 *
 * Mechanics worth keeping in mind, because each one is a way this breaks:
 *
 *  - `dragListener={false}` + `useDragControls` moves drag activation onto an
 *    explicit surface (the sheet header). Dragging the whole panel would fight
 *    the scroll region inside it: `motion` listens on pointerdown, so every
 *    attempt to scroll the zone list would move the sheet instead.
 *  - `dragMomentum={false}` is required. The snap is ours; letting framer run
 *    its own momentum animation first means two animations writing one motion
 *    value, and the loser is whichever one the user happens to be watching.
 *  - `offsetY.get()` at release already contains `dragElastic` overshoot, which
 *    is why `resolveSheetAnchor` clamps before it projects.
 */
export function useZoneSheet(initialAnchor: SheetAnchor = 'peek'): ZoneSheetController {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const viewportHeight = useMeasuredHeight(sheetRef)
  const offsets = useMemo(() => sheetOffsets(viewportHeight), [viewportHeight])

  const offsetY = useMotionValue(offsets[initialAnchor])
  const [anchor, setAnchor] = useState<SheetAnchor>(initialAnchor)
  const [dragging, setDragging] = useState(false)
  const reduceMotion = useReducedMotion()
  const dragControls = useDragControls()

  // Handle to the in-flight snap, so a new gesture can cancel it.
  const snapAnimation = useRef<ReturnType<typeof animate> | null>(null)
  const dragOrigin = useRef(0)
  const dragTravelled = useRef(0)
  const anchorRef = useRef(anchor)

  useEffect(() => {
    anchorRef.current = anchor
  }, [anchor])

  const stopSnap = useCallback(() => {
    snapAnimation.current?.stop()
    snapAnimation.current = null
  }, [])

  const settle = useCallback(
    (target: SheetAnchor) => {
      setAnchor(target)
      stopSnap()
      const to = offsets[target]
      if (reduceMotion) {
        offsetY.jump(to)
        return
      }
      snapAnimation.current = animate(offsetY, to, SHEET_SPRING)
    },
    [offsets, offsetY, reduceMotion, stopSnap],
  )

  const goTo = useCallback((target: SheetAnchor) => settle(target), [settle])

  const cycle = useCallback(() => {
    settle(nextSheetAnchor(anchor))
  }, [anchor, settle])

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      stopSnap()
      dragControls.start(event)
    },
    [dragControls, stopSnap],
  )

  const onDragStart = useCallback(() => {
    stopSnap()
    dragOrigin.current = offsetY.get()
    dragTravelled.current = 0
    setDragging(true)
  }, [offsetY, stopSnap])

  const onDragEnd = useCallback(
    ({ velocity }: SheetDragEndInfo) => {
      setDragging(false)
      const released = offsetY.get()
      dragTravelled.current = Math.abs(released - dragOrigin.current)
      settle(
        resolveSheetAnchor({ offset: released, velocity: velocity.y, offsets }),
      )
    },
    [offsetY, offsets, settle],
  )

  const didDrag = useCallback(() => dragTravelled.current > DRAG_SLOP, [])

  // Re-pin to the same anchor when the viewport geometry changes (mobile URL
  // bar, rotation, desktop resize). Without this the sheet keeps a px offset
  // computed for the old height and lands at an arbitrary fraction of the new
  // one. Keyed on geometry only — never on `anchor`, or every drag would be
  // yanked back to where it started.
  useEffect(() => {
    stopSnap()
    offsetY.jump(offsets[anchorRef.current])
  }, [offsets, offsetY, stopSnap])

  // ---------------------------------------------------------------------
  // Underlay. One progress value, four interpolations — the shape of
  // gorhom's `animatedIndex` consumers, minus the reanimated worklets.
  // `useTransform`'s function form re-runs on render, so a resize is picked up
  // without the ranges being captured in a closure.
  // ---------------------------------------------------------------------
  const progress = useTransform(offsetY, (value) => underlayProgress(value, offsets))

  return {
    sheetRef,
    anchor,
    offsets,
    offsetY,
    progress,
    chromeOpacity: useTransform(progress, (value) => chromeOpacity(value)),
    underlay: {
      scale: useTransform(progress, (value) => underlayScale(value)),
      radius: useTransform(progress, (value) => underlayRadius(value)),
      veil: useTransform(progress, (value) => underlayVeil(value)),
      shadow: useTransform(progress, (value) => underlayShadow(value)),
    },
    dragControls,
    startDrag,
    onDragStart,
    onDragEnd,
    goTo,
    cycle,
    dragging,
    didDrag,
  }
}

/**
 * Height of the sheet's own surface.
 *
 * The surface is `fixed` + `h-[100dvh]`, so measuring it *is* measuring the
 * dynamic viewport — which is better than `window.innerHeight`, because on
 * mobile Safari that excludes the collapsing URL bar and would leave the peek
 * strip short by exactly that difference. Falls back to the window (and then to
 * a constant) where layout does not exist, e.g. jsdom.
 */
function useMeasuredHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight || 800,
  )

  useEffect(() => {
    const measure = () => {
      const measured = ref.current?.offsetHeight ?? 0
      const fallback = typeof window === 'undefined' ? 0 : window.innerHeight
      const resolved = measured > 0 ? measured : fallback
      if (resolved > 0) {
        setHeight((current) => (current === resolved ? current : resolved))
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

  return height
}
