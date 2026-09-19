import { describe, expect, it } from 'vitest'
import {
  SIDE_PANEL_FALLBACK_WIDTH,
  SIDE_PANEL_FLICK_VELOCITY,
  SIDE_PANEL_PROJECTION_SECONDS,
  SIDE_PANEL_STATE_ORDER,
  SIDE_PANEL_TAB_VISIBLE,
  type SidePanelOffsets,
  clampSideOffset,
  nearestSidePanelState,
  resolveSidePanelAnchor,
  sidePanelOffsets,
  toggleSidePanelState,
} from './sidePanelAnchors'

/**
 * The drawer's snap maths, pinned the same way the sheet's is: a wrong branch
 * shows up as a panel that "sticks" under a fast flick, on a phone, in front
 * of people. See `sheetAnchors.test.ts` for the vertical equivalent.
 */

const WIDTH = 264
const OFFSETS = sidePanelOffsets(WIDTH)

describe('sidePanelOffsets', () => {
  it('rests open at 0 and tucks collapsed off-screen left', () => {
    expect(OFFSETS.open).toBe(0)
    expect(OFFSETS.collapsed).toBe(-(WIDTH - SIDE_PANEL_TAB_VISIBLE))
    expect(OFFSETS.collapsed).toBeLessThan(0)
  })

  it('leaves exactly the grab tab visible when collapsed', () => {
    // The visible remainder is the tab and nothing else: the collapsed offset
    // plus the panel width must equal the tab width.
    expect(WIDTH + OFFSETS.collapsed).toBe(SIDE_PANEL_TAB_VISIBLE)
  })

  it('tucks a wider panel further, so the tab still lands at the edge', () => {
    const narrow = sidePanelOffsets(200)
    const wide = sidePanelOffsets(320)
    expect(wide.collapsed).toBeLessThan(narrow.collapsed)
    expect(200 + narrow.collapsed).toBe(SIDE_PANEL_TAB_VISIBLE)
    expect(320 + wide.collapsed).toBe(SIDE_PANEL_TAB_VISIBLE)
  })

  it('falls back to a sane negative offset when the width is unmeasured', () => {
    for (const bad of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const offsets = sidePanelOffsets(bad)
      expect(offsets.open).toBe(0)
      expect(offsets.collapsed).toBe(
        -(SIDE_PANEL_FALLBACK_WIDTH - SIDE_PANEL_TAB_VISIBLE),
      )
      expect(offsets.collapsed).toBeLessThan(0)
    }
  })

  it('falls back when the width cannot even hold the tab', () => {
    // A width narrower than the tab would put `collapsed` at or right of 0 —
    // both anchors coinciding, and the panel unsnappable.
    const offsets = sidePanelOffsets(SIDE_PANEL_TAB_VISIBLE)
    expect(offsets.collapsed).toBeLessThan(0)
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
    expect(
      resolveSidePanelAnchor({
        offset: OFFSETS.open - 2,
        velocity: -(SIDE_PANEL_FLICK_VELOCITY - 1),
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
