import { describe, expect, it } from 'vitest'
import {
  SIDE_PANEL_FALLBACK_WIDTH,
  SIDE_PANEL_FLICK_VELOCITY,
  SIDE_PANEL_PROJECTION_SECONDS,
  SIDE_PANEL_STATE_ORDER,
  type SidePanelOffsets,
  clampSideOffset,
  drawerWindowWidth,
  isDragTail,
  nearestSidePanelState,
  resolveSidePanelAnchor,
  sidePanelOffsets,
  toggleSidePanelState,
} from './sidePanelAnchors'

/**
 * The drawer's snap maths, pinned the same way the sheet's was: a wrong branch
 * shows up as a drawer that "sticks" under a fast flick, on a phone, in front
 * of people. (The vertical equivalent retired with the bottom sheet.)
 */

const WIDTH = 172
const OFFSETS = sidePanelOffsets(WIDTH)

describe('sidePanelOffsets', () => {
  it('rests open at 0 and tucks the card fully out of the window when collapsed', () => {
    expect(OFFSETS.open).toBe(0)
    expect(OFFSETS.collapsed).toBe(-WIDTH)
    expect(OFFSETS.collapsed).toBeLessThan(0)
  })

  it('leaves no card visible when collapsed — the window shrinks to 0 with it', () => {
    // The collapsed offset plus the card width is exactly 0: the card sits
    // fully outside the clip window, and the window itself is width 0 — only
    // the grab tab (a static sibling of the window) shows.
    expect(WIDTH + OFFSETS.collapsed).toBe(0)
    expect(drawerWindowWidth(WIDTH, OFFSETS.collapsed)).toBe(0)
  })

  it('tucks a wider card further, so a wide card still hides fully', () => {
    const narrow = sidePanelOffsets(140)
    const wide = sidePanelOffsets(220)
    expect(wide.collapsed).toBeLessThan(narrow.collapsed)
    expect(140 + narrow.collapsed).toBe(0)
    expect(220 + wide.collapsed).toBe(0)
  })

  it('falls back to a sane negative offset when the width is unmeasured', () => {
    for (const bad of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const offsets = sidePanelOffsets(bad)
      expect(offsets.open).toBe(0)
      expect(offsets.collapsed).toBe(-SIDE_PANEL_FALLBACK_WIDTH)
      expect(offsets.collapsed).toBeLessThan(0)
    }
  })

  it('honours any positive measured width — small cards clip the same', () => {
    // No minimum-width gate: the window clips whatever the track holds.
    expect(sidePanelOffsets(32).collapsed).toBe(-32)
  })
})

describe('drawerWindowWidth', () => {
  it('fits the whole card when open and shrinks to 0 when collapsed', () => {
    expect(drawerWindowWidth(WIDTH, OFFSETS.open)).toBe(WIDTH)
    expect(drawerWindowWidth(WIDTH, OFFSETS.collapsed)).toBe(0)
  })

  it('shows exactly the visible remainder mid-drag', () => {
    expect(drawerWindowWidth(WIDTH, -WIDTH / 2)).toBe(WIDTH / 2)
    expect(drawerWindowWidth(WIDTH, -WIDTH / 4)).toBe((WIDTH * 3) / 4)
  })

  it('never exceeds the card or drops below 0 at any drag position', () => {
    // The clip guarantee, swept across every integer drag position including
    // elastic overshoot past both anchors: the window is always a valid
    // visible remainder, so the card can never paint outside it.
    for (let offset = OFFSETS.collapsed - 120; offset <= OFFSETS.open + 120; offset += 1) {
      const width = drawerWindowWidth(WIDTH, offset)
      expect(width).toBeGreaterThanOrEqual(0)
      expect(width).toBeLessThanOrEqual(WIDTH)
    }
  })

  it('tracks the drag monotonically — no jumps mid-gesture', () => {
    let previous = -1
    for (let offset = OFFSETS.collapsed; offset <= OFFSETS.open; offset += 1) {
      const width = drawerWindowWidth(WIDTH, offset)
      expect(width).toBeGreaterThanOrEqual(previous)
      previous = width
    }
  })

  it('clamps elastic overshoot past either anchor', () => {
    expect(drawerWindowWidth(WIDTH, OFFSETS.collapsed - 260)).toBe(0)
    expect(drawerWindowWidth(WIDTH, OFFSETS.open + 260)).toBe(WIDTH)
  })

  it('falls back safely on degenerate input rather than NaN', () => {
    expect(drawerWindowWidth(0, 0)).toBe(SIDE_PANEL_FALLBACK_WIDTH)
    expect(drawerWindowWidth(Number.NaN, Number.NaN)).toBe(
      SIDE_PANEL_FALLBACK_WIDTH,
    )
  })
})

describe('clampSideOffset', () => {
  it('clamps to the draggable range in both directions', () => {
    expect(clampSideOffset(OFFSETS.open + 400, OFFSETS)).toBe(OFFSETS.open)
    expect(clampSideOffset(OFFSETS.collapsed - 400, OFFSETS)).toBe(
      OFFSETS.collapsed,
    )
    expect(clampSideOffset(OFFSETS.collapsed / 2, OFFSETS)).toBe(
      OFFSETS.collapsed / 2,
    )
  })

  it('treats a non-finite offset as "still open" rather than NaN', () => {
    expect(clampSideOffset(Number.NaN, OFFSETS)).toBe(OFFSETS.open)
  })
})

describe('nearestSidePanelState', () => {
  it('picks the closest state', () => {
    expect(nearestSidePanelState(OFFSETS.open - 4, OFFSETS)).toBe('open')
    expect(nearestSidePanelState(OFFSETS.collapsed + 4, OFFSETS)).toBe(
      'collapsed',
    )
  })

  it('resolves an exact midpoint to collapsed, never open', () => {
    // Mirrors the sheet rule: a midpoint must not silently prefer covering
    // the map.
    const exact: SidePanelOffsets = { open: 0, collapsed: -200 }
    expect(nearestSidePanelState(-100, exact)).toBe('collapsed')
  })

  it('only considers the candidates it is given', () => {
    expect(nearestSidePanelState(OFFSETS.collapsed, OFFSETS, ['open'])).toBe(
      'open',
    )
  })

  it('searches left-to-right, so ties prefer the tucked state', () => {
    expect(SIDE_PANEL_STATE_ORDER).toEqual(['collapsed', 'open'])
  })
})

describe('resolveSidePanelAnchor', () => {
  it('snaps to the nearest state when released at rest', () => {
    expect(
      resolveSidePanelAnchor({ offset: -5, velocity: 0, offsets: OFFSETS }),
    ).toBe('open')
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.collapsed + 5,
        velocity: 0,
        offsets: OFFSETS,
      }),
    ).toBe('collapsed')
  })

  it('projects the release point forward with velocity', () => {
    // Slow leftward drift from just inside open carries past the midpoint.
    const target = resolveSidePanelAnchor({
      offset: -60,
      velocity: -400,
      offsets: OFFSETS,
    })
    expect(target).toBe('collapsed')
  })

  it('lets a flick collapse the panel even from just inside open', () => {
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.open - 10,
        velocity: -SIDE_PANEL_FLICK_VELOCITY,
        offsets: OFFSETS,
      }),
    ).toBe('collapsed')
  })

  it('lets a flick re-open the panel even from just inside collapsed', () => {
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.collapsed + 10,
        velocity: SIDE_PANEL_FLICK_VELOCITY,
        offsets: OFFSETS,
      }),
    ).toBe('open')
  })

  it('does not treat a below-threshold shove as a flick', () => {
    // A slow nudge stays a slow release: it projects a short way and settles
    // back open, rather than being flung to collapsed.
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.open - 2,
        velocity: -100,
        offsets: OFFSETS,
      }),
    ).toBe('open')
  })

  it('clamps at the ends of the range instead of snapping past them', () => {
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.open,
        velocity: SIDE_PANEL_FLICK_VELOCITY * 4,
        offsets: OFFSETS,
      }),
    ).toBe('open')
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.collapsed,
        velocity: -SIDE_PANEL_FLICK_VELOCITY * 4,
        offsets: OFFSETS,
      }),
    ).toBe('collapsed')
  })

  it('ignores elastic overshoot beyond the constraints', () => {
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.collapsed - 260,
        velocity: 0,
        offsets: OFFSETS,
      }),
    ).toBe('collapsed')
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.open + 260,
        velocity: 0,
        offsets: OFFSETS,
      }),
    ).toBe('open')
  })

  it('treats a missing or non-finite velocity as a slow release', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveSidePanelAnchor({ offset: -10, velocity: bad, offsets: OFFSETS }),
      ).toBe('open')
    }
  })

  it('honours overridden projection and flick thresholds', () => {
    const projected = resolveSidePanelAnchor({
      offset: OFFSETS.collapsed + 10,
      velocity: 200,
      offsets: OFFSETS,
      projectionSeconds: 1,
      flickVelocity: 10_000,
    })
    expect(projected).toBe('open')
  })

  it('shares the sheet tuning constants, so both gestures feel like one app', () => {
    expect(SIDE_PANEL_PROJECTION_SECONDS).toBeGreaterThan(0)
    expect(SIDE_PANEL_PROJECTION_SECONDS).toBeLessThan(0.5)
    expect(SIDE_PANEL_FLICK_VELOCITY).toBeGreaterThan(0)
  })
})

describe('toggleSidePanelState', () => {
  it('switches open ↔ collapsed', () => {
    expect(toggleSidePanelState('open')).toBe('collapsed')
    expect(toggleSidePanelState('collapsed')).toBe('open')
  })
})

/* ------------------------------------------------------------------------
   RIGHT EDGE — the top-right control column's orientation.

   The same maths mirrored: `collapsed` is +width instead of -width, the
   window remainder is `width - x` instead of `width + x`, and a flick's
   direction map follows whoever holds the larger offset. Pinning this half
   is what lets the zone drawer reuse the advisory drawer's proven snap
   without a parallel, unverified implementation.
   ------------------------------------------------------------------------ */

const RIGHT_OFFSETS = sidePanelOffsets(WIDTH, 'right')

describe('sidePanelOffsets (right edge)', () => {
  it('rests open at 0 and tucks the card into the right edge when collapsed', () => {
    expect(RIGHT_OFFSETS.open).toBe(0)
    expect(RIGHT_OFFSETS.collapsed).toBe(WIDTH)
    expect(RIGHT_OFFSETS.collapsed).toBeGreaterThan(0)
  })

  it('leaves no card visible when collapsed — the window shrinks to 0 with it', () => {
    expect(RIGHT_OFFSETS.collapsed - WIDTH).toBe(0)
    expect(drawerWindowWidth(WIDTH, RIGHT_OFFSETS.collapsed, 'right')).toBe(0)
  })

  it('honours a custom fallback before measurement (the zone panel is wider)', () => {
    const offsets = sidePanelOffsets(0, 'right', 380)
    expect(offsets.open).toBe(0)
    expect(offsets.collapsed).toBe(380)
    const left = sidePanelOffsets(0, 'left', 380)
    expect(left.collapsed).toBe(-380)
  })
})

describe('drawerWindowWidth (right edge)', () => {
  it('fits the whole card when open and shrinks to 0 when collapsed', () => {
    expect(drawerWindowWidth(WIDTH, RIGHT_OFFSETS.open, 'right')).toBe(WIDTH)
    expect(drawerWindowWidth(WIDTH, RIGHT_OFFSETS.collapsed, 'right')).toBe(0)
  })

  it('shows exactly the visible remainder mid-drag', () => {
    expect(drawerWindowWidth(WIDTH, WIDTH / 2, 'right')).toBe(WIDTH / 2)
    expect(drawerWindowWidth(WIDTH, WIDTH / 4, 'right')).toBe((WIDTH * 3) / 4)
  })

  it('never renders outside the clipped bounds at any right-edge drag position', () => {
    // The same clip guarantee as the left suite, swept across every integer
    // drag position of a right-edge drawer including elastic overshoot past
    // both anchors: the window is always a valid visible remainder.
    for (
      let offset = RIGHT_OFFSETS.open - 120;
      offset <= RIGHT_OFFSETS.collapsed + 120;
      offset += 1
    ) {
      const width = drawerWindowWidth(WIDTH, offset, 'right')
      expect(width).toBeGreaterThanOrEqual(0)
      expect(width).toBeLessThanOrEqual(WIDTH)
    }
  })

  it('tracks the drag monotonically in the right-edge direction', () => {
    let previous = WIDTH + 1
    for (
      let offset = RIGHT_OFFSETS.open;
      offset <= RIGHT_OFFSETS.collapsed;
      offset += 1
    ) {
      const width = drawerWindowWidth(WIDTH, offset, 'right')
      expect(width).toBeLessThanOrEqual(previous)
      previous = width
    }
  })

  it('clamps elastic overshoot past either anchor', () => {
    expect(drawerWindowWidth(WIDTH, RIGHT_OFFSETS.collapsed + 260, 'right')).toBe(0)
    expect(drawerWindowWidth(WIDTH, RIGHT_OFFSETS.open - 260, 'right')).toBe(WIDTH)
  })
})

describe('clampSideOffset (right edge)', () => {
  it('clamps to the draggable range even though collapsed is the larger offset', () => {
    expect(clampSideOffset(RIGHT_OFFSETS.open - 400, RIGHT_OFFSETS)).toBe(
      RIGHT_OFFSETS.open,
    )
    expect(clampSideOffset(RIGHT_OFFSETS.collapsed + 400, RIGHT_OFFSETS)).toBe(
      RIGHT_OFFSETS.collapsed,
    )
    expect(clampSideOffset(RIGHT_OFFSETS.collapsed / 2, RIGHT_OFFSETS)).toBe(
      RIGHT_OFFSETS.collapsed / 2,
    )
  })
})

describe('nearestSidePanelState (right edge)', () => {
  it('picks the closest state and resolves midpoints to collapsed', () => {
    expect(nearestSidePanelState(RIGHT_OFFSETS.open + 4, RIGHT_OFFSETS)).toBe('open')
    expect(
      nearestSidePanelState(RIGHT_OFFSETS.collapsed - 4, RIGHT_OFFSETS),
    ).toBe('collapsed')
    const exact: SidePanelOffsets = { open: 0, collapsed: 200 }
    expect(nearestSidePanelState(100, exact)).toBe('collapsed')
  })
})

describe('resolveSidePanelAnchor (right edge)', () => {
  it('snaps to the nearest state when released at rest', () => {
    expect(
      resolveSidePanelAnchor({ offset: 5, velocity: 0, offsets: RIGHT_OFFSETS }),
    ).toBe('open')
    expect(
      resolveSidePanelAnchor({
        offset: RIGHT_OFFSETS.collapsed - 5,
        velocity: 0,
        offsets: RIGHT_OFFSETS,
      }),
    ).toBe('collapsed')
  })

  it('lets a RIGHTWARD flick collapse the panel even from just inside open', () => {
    // The mirrored flick map: at the right edge, collapse is the positive
    // direction. If this ever resolves to 'open', the drawer snaps back open
    // under the one gesture the user was most confident about.
    expect(
      resolveSidePanelAnchor({
        offset: RIGHT_OFFSETS.open + 10,
        velocity: SIDE_PANEL_FLICK_VELOCITY,
        offsets: RIGHT_OFFSETS,
      }),
    ).toBe('collapsed')
  })

  it('lets a LEFTWARD flick re-open the panel even from just inside collapsed', () => {
    expect(
      resolveSidePanelAnchor({
        offset: RIGHT_OFFSETS.collapsed - 10,
        velocity: -SIDE_PANEL_FLICK_VELOCITY,
        offsets: RIGHT_OFFSETS,
      }),
    ).toBe('open')
  })

  it('clamps at the ends of the range instead of snapping past them', () => {
    expect(
      resolveSidePanelAnchor({
        offset: RIGHT_OFFSETS.open,
        velocity: -SIDE_PANEL_FLICK_VELOCITY * 4,
        offsets: RIGHT_OFFSETS,
      }),
    ).toBe('open')
    expect(
      resolveSidePanelAnchor({
        offset: RIGHT_OFFSETS.collapsed,
        velocity: SIDE_PANEL_FLICK_VELOCITY * 4,
        offsets: RIGHT_OFFSETS,
      }),
    ).toBe('collapsed')
  })

  it('ignores elastic overshoot beyond the constraints', () => {
    expect(
      resolveSidePanelAnchor({
        offset: RIGHT_OFFSETS.collapsed + 260,
        velocity: 0,
        offsets: RIGHT_OFFSETS,
      }),
    ).toBe('collapsed')
    expect(
      resolveSidePanelAnchor({
        offset: RIGHT_OFFSETS.open - 260,
        velocity: 0,
        offsets: RIGHT_OFFSETS,
      }),
    ).toBe('open')
  })

  it('projects a slow release forward with velocity, towards the correct edge', () => {
    // Slow rightward drift from just inside open carries past the midpoint.
    expect(
      resolveSidePanelAnchor({ offset: 60, velocity: 400, offsets: RIGHT_OFFSETS }),
    ).toBe('collapsed')
    // And the mirrored slow leftward drift settles back open.
    expect(
      resolveSidePanelAnchor({ offset: 60, velocity: -400, offsets: RIGHT_OFFSETS }),
    ).toBe('open')
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
