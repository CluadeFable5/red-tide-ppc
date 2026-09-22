import { describe, expect, it } from 'vitest'
import {
  ADVISORY_PULSE_SECONDS,
  DRAWER_BREAKPOINT_PX,
  DRAWER_RESERVE_COLLAPSED,
  DRAWER_RESERVE_OPEN,
  FOCUS_FLIGHT_SECONDS,
  ZONE_LOAD_DURATION_MS,
  ZONE_LOAD_STAGGER_MS,
  focusPaddingFor,
  zoneLoadDelayMs,
} from './mapMotion'

describe('motion constants (brief limits)', () => {
  it('load-in is 500ms with a 60-80ms stagger', () => {
    expect(ZONE_LOAD_DURATION_MS).toBe(500)
    expect(ZONE_LOAD_STAGGER_MS).toBeGreaterThanOrEqual(60)
    expect(ZONE_LOAD_STAGGER_MS).toBeLessThanOrEqual(80)
  })

  it('focus flight is 0.8-1.0s', () => {
    expect(FOCUS_FLIGHT_SECONDS).toBeGreaterThanOrEqual(0.8)
    expect(FOCUS_FLIGHT_SECONDS).toBeLessThanOrEqual(1.0)
  })

  it('advisory pulse loops every 3-4s', () => {
    expect(ADVISORY_PULSE_SECONDS).toBeGreaterThanOrEqual(3)
    expect(ADVISORY_PULSE_SECONDS).toBeLessThanOrEqual(4)
  })
})

describe('zoneLoadDelayMs', () => {
  it('staggers each zone by the stagger constant', () => {
    expect(zoneLoadDelayMs(0)).toBe(0)
    expect(zoneLoadDelayMs(1)).toBe(ZONE_LOAD_STAGGER_MS)
    expect(zoneLoadDelayMs(6)).toBe(6 * ZONE_LOAD_STAGGER_MS)
  })

  it('never returns a NaN or negative delay', () => {
    expect(zoneLoadDelayMs(NaN)).toBe(0)
    expect(zoneLoadDelayMs(-3)).toBe(0)
    expect(zoneLoadDelayMs(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('floors fractional indices', () => {
    expect(zoneLoadDelayMs(2.9)).toBe(2 * ZONE_LOAD_STAGGER_MS)
  })
})

describe('focusPaddingFor', () => {
  it('uses the small phone gutters below the drawer breakpoint', () => {
    const padding = focusPaddingFor(390, DRAWER_RESERVE_OPEN)
    // The drawer reserve is ignored on phones — the drawer tucks on focus.
    expect(padding.paddingBottomRight[0]).toBe(16)
    expect(padding.paddingTopLeft[0]).toBe(16)
    // Top clears the header + pills; bottom clears the attribution pill.
    expect(padding.paddingTopLeft[1]).toBeGreaterThanOrEqual(56)
    expect(padding.paddingBottomRight[1]).toBeGreaterThanOrEqual(48)
  })

  it('reserves the drawer width on desktop when it is open', () => {
    const padding = focusPaddingFor(1280, DRAWER_RESERVE_OPEN)
    expect(padding.paddingBottomRight[0]).toBeGreaterThan(DRAWER_RESERVE_OPEN)
  })

  it('reserves only the tab when the drawer is collapsed on desktop', () => {
    const open = focusPaddingFor(1280, DRAWER_RESERVE_OPEN)
    const collapsed = focusPaddingFor(1280, DRAWER_RESERVE_COLLAPSED)
    expect(collapsed.paddingBottomRight[0]).toBeLessThan(
      open.paddingBottomRight[0],
    )
    expect(collapsed.paddingBottomRight[0]).toBeGreaterThan(
      DRAWER_RESERVE_COLLAPSED,
    )
  })

  it('defends against degenerate input', () => {
    const padding = focusPaddingFor(NaN, NaN)
    for (const value of [...padding.paddingTopLeft, ...padding.paddingBottomRight]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('treats the breakpoint itself as desktop', () => {
    const atBreakpoint = focusPaddingFor(DRAWER_BREAKPOINT_PX, DRAWER_RESERVE_OPEN)
    expect(atBreakpoint.paddingBottomRight[0]).toBeGreaterThan(DRAWER_RESERVE_OPEN)
  })
})
