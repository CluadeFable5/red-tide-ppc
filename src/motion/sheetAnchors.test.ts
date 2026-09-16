import { describe, expect, it } from 'vitest'
import {
  SHEET_ANCHOR_ORDER,
  SHEET_FLICK_VELOCITY,
  SHEET_PROJECTION_SECONDS,
  SHEET_VISIBLE_RATIO,
  UNDERLAY_RADIUS_AT_FULL,
  UNDERLAY_SCALE_AT_FULL,
  UNDERLAY_SHADOW_AT_FULL,
  UNDERLAY_VEIL_AT_FULL,
  type SheetOffsets,
  chromeOpacity,
  clampOffset,
  headerOpacity,
  isDragTail,
  nearestAnchor,
  nextSheetAnchor,
  resolveSheetAnchor,
  sheetOffsets,
  sheetVisibleRatio,
  underlayProgress,
  underlayRadius,
  underlayScale,
  underlayShadow,
  underlayVeil,
} from './sheetAnchors'

/**
 * The snap maths is the one part of this feature that cannot be verified by
 * looking at it: a wrong branch shows up as a sheet that "sticks" under a fast
 * flick, on a phone, in front of people. So the branches are pinned here.
 */

const HEIGHT = 800
const OFFSETS = sheetOffsets(HEIGHT)

describe('sheetOffsets', () => {
  it('places each anchor at the complement of its visible ratio', () => {
    expect(OFFSETS.peek).toBeCloseTo(HEIGHT * (1 - SHEET_VISIBLE_RATIO.peek))
    expect(OFFSETS.mid).toBeCloseTo(HEIGHT * (1 - SHEET_VISIBLE_RATIO.mid))
    expect(OFFSETS.full).toBeCloseTo(HEIGHT * (1 - SHEET_VISIBLE_RATIO.full))
  })

  it('orders anchors top-to-bottom and keeps every anchor on screen', () => {
    expect(OFFSETS.full).toBeLessThan(OFFSETS.mid)
    expect(OFFSETS.mid).toBeLessThan(OFFSETS.peek)
    for (const anchor of SHEET_ANCHOR_ORDER) {
      expect(OFFSETS[anchor]).toBeLessThan(HEIGHT)
      expect(OFFSETS[anchor]).toBeGreaterThanOrEqual(0)
    }
  })

  it('degrades to zero offsets for a viewport that has not been measured', () => {
    for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const offsets = sheetOffsets(bad)
      expect(offsets).toEqual({ peek: 0, mid: 0, full: 0 })
    }
  })

  it('respects the briefed peek band and full cap', () => {
    expect(SHEET_VISIBLE_RATIO.peek).toBeGreaterThanOrEqual(0.12)
    expect(SHEET_VISIBLE_RATIO.peek).toBeLessThanOrEqual(0.18)
    expect(SHEET_VISIBLE_RATIO.mid).toBeGreaterThanOrEqual(0.45)
    expect(SHEET_VISIBLE_RATIO.mid).toBeLessThanOrEqual(0.55)
    expect(SHEET_VISIBLE_RATIO.full).toBeGreaterThanOrEqual(0.85)
    expect(SHEET_VISIBLE_RATIO.full).toBeLessThanOrEqual(0.9)
  })

  it('caps full at 88vh per spec, never unbounded', () => {
    expect(SHEET_VISIBLE_RATIO.full).toBeLessThanOrEqual(0.9)
    expect(SHEET_VISIBLE_RATIO.full).toBeGreaterThanOrEqual(0.85)
  })
})

describe('clampOffset', () => {
  it('clamps to the draggable range in both directions', () => {
    expect(clampOffset(OFFSETS.peek + 400, OFFSETS)).toBe(OFFSETS.peek)
    expect(clampOffset(OFFSETS.full - 400, OFFSETS)).toBe(OFFSETS.full)
    expect(clampOffset(OFFSETS.mid, OFFSETS)).toBe(OFFSETS.mid)
  })

  it('treats a non-finite offset as "still at peek" rather than NaN', () => {
    expect(clampOffset(Number.NaN, OFFSETS)).toBe(OFFSETS.peek)
  })
})

describe('sheetVisibleRatio', () => {
  it('reports the visible fraction at each anchor', () => {
    expect(sheetVisibleRatio(OFFSETS.peek, HEIGHT)).toBeCloseTo(SHEET_VISIBLE_RATIO.peek)
    expect(sheetVisibleRatio(OFFSETS.mid, HEIGHT)).toBeCloseTo(SHEET_VISIBLE_RATIO.mid)
    expect(sheetVisibleRatio(OFFSETS.full, HEIGHT)).toBeCloseTo(SHEET_VISIBLE_RATIO.full)
  })

  it('falls back to the peek ratio when the viewport is unknown', () => {
    expect(sheetVisibleRatio(OFFSETS.mid, 0)).toBe(SHEET_VISIBLE_RATIO.peek)
  })
})

describe('nearestAnchor', () => {
  it('picks the closest anchor', () => {
    expect(nearestAnchor(OFFSETS.peek - 4, OFFSETS)).toBe('peek')
    expect(nearestAnchor(OFFSETS.mid + 4, OFFSETS)).toBe('mid')
    expect(nearestAnchor(OFFSETS.full + 4, OFFSETS)).toBe('full')
  })

  it('resolves an exact midpoint to the lower anchor, never the higher one', () => {
    // Integer offsets, because a computed midpoint of the real ratios is never
    // exactly equidistant in binary floating point.
    const exact: SheetOffsets = { peek: 100, mid: 50, full: 0 }
    expect(nearestAnchor(75, exact)).toBe('peek')
    expect(nearestAnchor(25, exact)).toBe('mid')
  })

  it('only considers the candidates it is given', () => {
    expect(nearestAnchor(OFFSETS.peek, OFFSETS, ['mid', 'full'])).toBe('mid')
  })
})

describe('resolveSheetAnchor', () => {
  it('snaps to the nearest anchor when released at rest', () => {
    expect(
      resolveSheetAnchor({ offset: OFFSETS.mid - 5, velocity: 0, offsets: OFFSETS }),
    ).toBe('mid')
    expect(
      resolveSheetAnchor({ offset: OFFSETS.full + 5, velocity: 0, offsets: OFFSETS }),
    ).toBe('full')
  })

  it('projects the release point forward with velocity', () => {
    // Just past mid, moving up at 1000 px/s: the projection (200px at 0.2s) is past
    // full, so the flick should carry all the way, not stop at mid.
    const target = resolveSheetAnchor({
      offset: OFFSETS.mid + 10,
      velocity: -1000,
      offsets: OFFSETS,
    })
    expect(target).toBe('full')
  })

  it('lets a fast downward flick travel back down even from near full', () => {
    // One anchor per flick at moderate speed...
    expect(
      resolveSheetAnchor({
        offset: OFFSETS.full + 20,
        velocity: SHEET_FLICK_VELOCITY * 2,
        offsets: OFFSETS,
      }),
    ).toBe('mid')

    // ...and two when it is thrown hard enough to project past mid.
    expect(
      resolveSheetAnchor({
        offset: OFFSETS.full + 20,
        velocity: SHEET_FLICK_VELOCITY * 9,
        offsets: OFFSETS,
      }),
    ).toBe('peek')
  })

  it('always advances at least one anchor on a flick', () => {
    // Exactly at the threshold, the projected point is still closest to peek —
    // the guaranteed step is the only thing that opens the sheet here.
    expect(
      resolveSheetAnchor({
        offset: OFFSETS.peek - 2,
        velocity: -SHEET_FLICK_VELOCITY,
        offsets: OFFSETS,
      }),
    ).toBe('mid')

    expect(
      resolveSheetAnchor({
        offset: OFFSETS.full + 2,
        velocity: SHEET_FLICK_VELOCITY,
        offsets: OFFSETS,
      }),
    ).toBe('mid')

    // Just under the threshold it is a slow release, and position wins.
    expect(
      resolveSheetAnchor({
        offset: OFFSETS.peek - 2,
        velocity: -(SHEET_FLICK_VELOCITY - 1),
        offsets: OFFSETS,
      }),
    ).toBe('peek')
  })

  it('clamps at the ends of the range instead of snapping past them', () => {
    expect(
      resolveSheetAnchor({
        offset: OFFSETS.peek,
        velocity: SHEET_FLICK_VELOCITY * 4,
        offsets: OFFSETS,
      }),
    ).toBe('peek')
    expect(
      resolveSheetAnchor({
        offset: OFFSETS.full,
        velocity: -SHEET_FLICK_VELOCITY * 4,
        offsets: OFFSETS,
      }),
    ).toBe('full')
  })

  it('ignores elastic overshoot beyond the constraints', () => {
    // dragElastic lets the sheet travel past `peek` while dragging; the snap
    // must not read that overshoot as "further down than peek".
    const target = resolveSheetAnchor({
      offset: OFFSETS.peek + 260,
      velocity: 0,
      offsets: OFFSETS,
    })
    expect(target).toBe('peek')
  })

  it('treats a missing or non-finite velocity as a slow release', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveSheetAnchor({ offset: OFFSETS.mid, velocity: bad, offsets: OFFSETS }),
      ).toBe('mid')
    }
  })

  it('honours overridden projection and flick thresholds', () => {
    const projected = resolveSheetAnchor({
      offset: OFFSETS.mid,
      velocity: -200,
      offsets: OFFSETS,
      projectionSeconds: 1,
      flickVelocity: 10_000,
    })
    expect(projected).toBe('full')
  })

  it('uses the documented projection constant', () => {
    expect(SHEET_PROJECTION_SECONDS).toBeGreaterThan(0)
    expect(SHEET_PROJECTION_SECONDS).toBeLessThan(0.5)
  })
})

describe('nextSheetAnchor', () => {
  it('cycles bottom-to-top and wraps', () => {
    expect(nextSheetAnchor('peek')).toBe('mid')
    expect(nextSheetAnchor('mid')).toBe('full')
    expect(nextSheetAnchor('full')).toBe('peek')
  })
})

describe('underlay', () => {
  it('runs 0 at peek → 1 at full', () => {
    expect(underlayProgress(OFFSETS.peek, OFFSETS)).toBeCloseTo(0)
    expect(underlayProgress(OFFSETS.full, OFFSETS)).toBeCloseTo(1)
    expect(underlayProgress(OFFSETS.mid, OFFSETS)).toBeCloseTo(
      (SHEET_VISIBLE_RATIO.peek - SHEET_VISIBLE_RATIO.mid) /
        (SHEET_VISIBLE_RATIO.peek - SHEET_VISIBLE_RATIO.full),
    )
    // Sanity: past the halfway point of the travel, but not yet receded fully.
    expect(underlayProgress(OFFSETS.mid, OFFSETS)).toBeGreaterThan(0.25)
    expect(underlayProgress(OFFSETS.mid, OFFSETS)).toBeLessThan(0.75)
  })

  it('is monotonic in the sheet position', () => {
    const samples = [OFFSETS.peek, OFFSETS.mid, OFFSETS.full].map((offset) =>
      underlayProgress(offset, OFFSETS),
    )
    expect(samples[0]).toBeLessThan(samples[1])
    expect(samples[1]).toBeLessThan(samples[2])
  })

  it('clamps outside the range and survives an unmeasured viewport', () => {
    expect(underlayProgress(OFFSETS.peek + 500, OFFSETS)).toBe(0)
    expect(underlayProgress(OFFSETS.full - 500, OFFSETS)).toBe(1)
    expect(underlayProgress(123, sheetOffsets(0))).toBe(0)
  })

  it('maps progress onto the recede values', () => {
    expect(underlayScale(0)).toBe(1)
    expect(underlayScale(1)).toBeCloseTo(UNDERLAY_SCALE_AT_FULL)
    expect(underlayRadius(0)).toBe(0)
    expect(underlayRadius(1)).toBe(UNDERLAY_RADIUS_AT_FULL)
    expect(underlayVeil(1)).toBeCloseTo(UNDERLAY_VEIL_AT_FULL)
    expect(underlayShadow(1)).toBeCloseTo(UNDERLAY_SHADOW_AT_FULL)

    // Out-of-range progress must never over-shoot the token values.
    expect(underlayScale(4)).toBeCloseTo(UNDERLAY_SCALE_AT_FULL)
    expect(underlayRadius(-4)).toBe(0)
    expect(underlayVeil(Number.NaN)).toBe(0)
  })

  it('keeps the recede subtle enough to stay legible', () => {
    expect(UNDERLAY_SCALE_AT_FULL).toBeGreaterThan(0.9)
    expect(UNDERLAY_SCALE_AT_FULL).toBeLessThan(1)
    expect(UNDERLAY_VEIL_AT_FULL).toBeLessThan(0.5)
  })
})

describe('chromeOpacity', () => {
  it('is fully visible over the map and gone by the mid anchor', () => {
    expect(chromeOpacity(0)).toBe(1)
    expect(chromeOpacity(0.35)).toBe(0)
    expect(chromeOpacity(0.8)).toBe(0)
  })

  it('fades linearly in between', () => {
    expect(chromeOpacity(0.175)).toBeCloseTo(0.5)
  })

  it('keeps the chrome visible when progress is unknown', () => {
    // Failing *visible* is the right direction here: a NaN progress should not
    // blank the legend and the gauge off the map.
    expect(chromeOpacity(Number.NaN)).toBe(1)
    expect(chromeOpacity(-1)).toBe(1)
  })
})

describe('headerOpacity', () => {
  it('stays fully visible at peek and mid, only fades at full', () => {
    expect(headerOpacity(0)).toBe(1) // peek
    expect(headerOpacity(0.48)).toBe(1) // mid ~0.48 progress
    expect(headerOpacity(0.6)).toBe(1) // still visible at 60% threshold
    expect(headerOpacity(0.8)).toBeCloseTo(0.5) // half-faded at 80% with smoothstep
    expect(headerOpacity(1)).toBe(0) // full
  })

  it('fades back in promptly when dragging down from full to mid', () => {
    // At full progress 1 → mid 0.48, by 0.6 it should be fully visible again
    // So dragging down from full should restore header quickly, not late
    // With smoothstep 0.6→1.0, fade is spread over 40% travel, not abrupt
    expect(headerOpacity(0.9)).toBeCloseTo(0.156, 1) // 0.75 t smoothstep
    expect(headerOpacity(0.7)).toBeCloseTo(0.843, 1) // 0.25 t, still mostly visible
    expect(headerOpacity(0.6)).toBe(1)
    expect(headerOpacity(0.5)).toBe(1)
  })

  it('uses smoothstep easing so fast flick peek→full is not jarring glitch', () => {
    // Fast flick from peek (0) to full (1) skips mid — verify fade has intermediate values,
    // not instant 1→0. With smoothstep 0.6-1.0, opacity at 0.7,0.8,0.9 should be intermediate
    // and monotonic decreasing, with S-curve shape (not linear abrupt).
    const samples = [0.6, 0.7, 0.8, 0.9, 1.0].map((p) => headerOpacity(p))
    // Monotonic decreasing
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1])
    }
    // Has intermediate values, not just 0/1
    expect(samples[1]).toBeGreaterThan(0.5) // at 0.7, still mostly visible ~0.84
    expect(samples[1]).toBeLessThan(1)
    expect(samples[2]).toBeCloseTo(0.5, 1) // at 0.8, half
    expect(samples[3]).toBeGreaterThan(0)
    expect(samples[3]).toBeLessThan(0.5) // at 0.9, mostly faded but not 0
    // Smoothstep: derivative at start and end is 0, so fade starts gently
    // Check that fade from 0.6→0.7 is smaller than 0.7→0.8 (ease-in portion)
    const delta1 = samples[0] - samples[1] // 1 - 0.843 = 0.157
    const delta2 = samples[1] - samples[2] // 0.843 - 0.5 = 0.343
    expect(delta1).toBeLessThan(delta2) // starts gently, accelerates
  })

  it('keeps header visible when progress unknown', () => {
    expect(headerOpacity(Number.NaN)).toBe(1)
    expect(headerOpacity(-1)).toBe(1)
  })

  it('supports reduced-motion instant swap at same threshold', () => {
    // Reduced-motion uses offsetY.jump, so progress jumps instantly from 0 to 1.
    // Opacity should swap instantly 1→0 at threshold, no animated fade.
    // This test documents that headerOpacity itself is pure and threshold-based,
    // so a jump over threshold yields instant swap — no extra animation needed.
    // The pointer-events logic (headerOpacity<0.1 ? 'none' : 'auto') also swaps instantly.
    const peekOpacity = headerOpacity(0)
    const fullOpacity = headerOpacity(1)
    expect(peekOpacity).toBe(1)
    expect(fullOpacity).toBe(0)
    const pointerEvents = (p: number) => (headerOpacity(p) < 0.1 ? 'none' : 'auto')
    expect(pointerEvents(0)).toBe('auto')
    expect(pointerEvents(0.6)).toBe('auto')
    expect(pointerEvents(1)).toBe('none')
    // Instant swap means no intermediate opacity during jump — verified in
    // real browser with prefers-reduced-motion: log shows only 1 and 0, no 0.05-0.95 values
  })
})

describe('isDragTail', () => {
  it('ignores a pointer click that trails a drag', () => {
    expect(isDragTail(true, 1)).toBe(true)
    expect(isDragTail(true, 2)).toBe(true)
  })

  it('keeps a click that was not caused by a drag', () => {
    expect(isDragTail(false, 1)).toBe(false)
  })

  it('always lets keyboard and assistive-tech activation through', () => {
    expect(isDragTail(true, 0)).toBe(false)
    expect(isDragTail(false, 0)).toBe(false)
  })
})
