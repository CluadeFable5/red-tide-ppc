// @vitest-environment jsdom
import { render, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SEED_ZONES } from '../data/zones'
import type { Zone } from '../types'
import { Map } from './Map'

/**
 * Regression for the production `zone-path` class bug.
 *
 * The class used to be passed inside `pathOptions`, which react-leaflet
 * applies via `setStyle` — and `setStyle` writes only stroke/fill
 * presentation attributes, never the path's class. Leaflet reads
 * `options.className` exactly once, when the path node is created on add.
 * So in a production single-pass render the class silently never reached
 * the DOM: the ramp transition, the press-feedback hook and the
 * `--selected` press exemption all died with it. It only appeared in dev,
 * because StrictMode's double effect invocation re-added the layer and
 * re-ran the one-time `_initPath` against options the first `setStyle` had
 * already stored.
 *
 * These tests render `<Map>` the way production does — one pass, no
 * StrictMode — and assert the class is on the path node.
 */

const ZONES: Zone[] = SEED_ZONES.map((zone) => ({
  ...zone,
  polygon: [...zone.polygon],
  lastUpdated: Date.now(),
}))

const NOOP = () => {}

function renderMap(selectedZoneId: string | null = null) {
  return render(
    <Map
      zones={ZONES}
      pendingCounts={{}}
      selectedZoneId={selectedZoneId}
      resetToken={0}
      focusZoneId={null}
      focusToken={0}
      onSelectZone={NOOP}
      onReport={NOOP}
    />,
  )
}

/** Every zone polygon's `<path>` node, in DOM order (zone order). */
function zonePaths(container: HTMLElement): SVGPathElement[] {
  return Array.from(
    container.querySelectorAll<SVGPathElement>('.leaflet-overlay-pane path'),
  )
}

function pathFor(container: HTMLElement, zoneId: string): SVGPathElement {
  // DOM order matches ZONES order (Leaflet adds layers in creation order).
  return zonePaths(container)[ZONES.findIndex((z) => z.id === zoneId)]
}

describe('zone-path class application (production single-pass render)', () => {
  it('applies zone-path to every polygon path', async () => {
    const { container } = renderMap()
    await waitFor(() => {
      expect(zonePaths(container)).toHaveLength(ZONES.length)
    })
    for (const path of zonePaths(container)) {
      expect(path.classList.contains('zone-path')).toBe(true)
    }
  })

  it('applies zone-path--selected on first mount for a pre-selected zone', async () => {
    const { container } = renderMap('honda-inner')
    const path = await waitFor(() => {
      const el = pathFor(container, 'honda-inner')
      expect(el.classList.contains('zone-path')).toBe(true)
      return el
    })
    // First application happens on the layer's `add` — no re-render involved.
    await waitFor(() => {
      expect(path.classList.contains('zone-path--selected')).toBe(true)
    })
    // And it stays off every other polygon.
    for (const other of zonePaths(container)) {
      if (other !== path) expect(other.classList.contains('zone-path--selected')).toBe(false)
    }
  })

  it('moves zone-path--selected when the selection changes', async () => {
    const { container, rerender } = renderMap('pp-bay')
    await waitFor(() => {
      expect(pathFor(container, 'pp-bay').classList.contains('zone-path--selected')).toBe(true)
    })

    rerender(
      <Map
        zones={ZONES}
        pendingCounts={{}}
        selectedZoneId='honda-outer'
        resetToken={0}
        focusZoneId={null}
        focusToken={0}
        onSelectZone={NOOP}
        onReport={NOOP}
      />,
    )

    await waitFor(() => {
      expect(pathFor(container, 'honda-outer').classList.contains('zone-path--selected')).toBe(true)
      expect(pathFor(container, 'pp-bay').classList.contains('zone-path--selected')).toBe(false)
    })
  })

  it('keeps the fill ramp attributes in sync with selection', async () => {
    // Selected first: `fillSelected` for `safe` is 0.46.
    const { container, rerender } = renderMap('pp-bay')
    const path = await waitFor(() => {
      const el = pathFor(container, 'pp-bay')
      expect(el.getAttribute('fill-opacity')).toBe('0.46')
      return el
    })
    // Its neighbours sit at the resting `fill` of 0.16.
    expect(pathFor(container, 'honda-inner').getAttribute('fill-opacity')).toBe('0.16')

    // Deselect: the same element drops back to the resting step.
    rerender(
      <Map
        zones={ZONES}
        pendingCounts={{}}
        selectedZoneId={null}
        resetToken={0}
        focusZoneId={null}
        focusToken={0}
        onSelectZone={NOOP}
        onReport={NOOP}
      />,
    )

    await waitFor(() => {
      expect(path.getAttribute('fill-opacity')).toBe('0.16')
    })
  })

  it('lights the polygon from pointerdown and releases it on pointerup', async () => {
    const { container } = renderMap()
    const path = await waitFor(() => {
      const el = pathFor(container, 'honda-inner')
      expect(el.classList.contains('zone-path')).toBe(true)
      return el
    })

    fireEvent.pointerDown(path, { clientX: 10, clientY: 10 })
    expect(path.classList.contains('zone-path--pressed')).toBe(true)

    fireEvent.pointerUp(window, { clientX: 12, clientY: 11 })
    expect(path.classList.contains('zone-path--pressed')).toBe(false)
  })

  it('never dims the selected polygon with the press class', async () => {
    const { container } = renderMap('pp-bay')
    const path = await waitFor(() => {
      const el = pathFor(container, 'pp-bay')
      expect(el.classList.contains('zone-path--selected')).toBe(true)
      return el
    })

    fireEvent.pointerDown(path, { clientX: 10, clientY: 10 })
    // The class may be present, but the CSS press rule exempts
    // `.zone-path--selected`, so the selected fill holds.
    expect(path.classList.contains('zone-path--selected')).toBe(true)
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
  })
})

/**
 * Regression for adjacent same-status zones fusing into one shape.
 *
 * `pp-bay` and `irawan` share a ~300m seam at the bay mouth (measured: zero
 * overlap, 11–23m gap, see zones.test.ts). Both are `safe`, so the seam was a
 * single low-opacity stroke of the same hex as both fills and disappeared.
 * Every zone ring is now drawn twice: a dark casing in a pane *under* the
 * overlay pane, then the status stroke on top, so every outline is flanked by
 * a dark edge regardless of its neighbour's colour.
 */
describe('zone boundary casing', () => {
  it('draws one non-interactive casing per zone in a pane below the overlay pane', async () => {
    const { container } = renderMap()
    await waitFor(() => expect(zonePaths(container)).toHaveLength(ZONES.length))

    const pane = container.querySelector<HTMLElement>('.leaflet-zoneCasing-pane')
    expect(pane).toBeTruthy()
    expect(Number(pane!.style.zIndex)).toBeLessThan(400)

    const casings = Array.from(pane!.querySelectorAll<SVGPathElement>('path.zone-casing'))
    expect(casings).toHaveLength(ZONES.length)
    for (const casing of casings) {
      expect(casing.classList.contains('leaflet-interactive')).toBe(false)
      expect(casing.getAttribute('fill')).toBe('none')
      // Wider than the 2px status stroke it sits under.
      expect(Number(casing.getAttribute('stroke-width'))).toBeGreaterThan(2)
    }
  })

  it('keeps the casings out of the overlay pane so zone-path selectors are unaffected', async () => {
    const { container } = renderMap()
    await waitFor(() => expect(zonePaths(container)).toHaveLength(ZONES.length))
    for (const path of zonePaths(container)) {
      expect(path.classList.contains('zone-path')).toBe(true)
      expect(path.classList.contains('zone-casing')).toBe(false)
    }
  })

  it('widens the casing with the selected zone so the halo tracks the emphasised stroke', async () => {
    const { container } = renderMap('pp-bay')
    await waitFor(() => expect(pathFor(container, 'pp-bay').classList.contains('zone-path--selected')).toBe(true))
    const casings = Array.from(
      container.querySelectorAll<SVGPathElement>('.leaflet-zoneCasing-pane path.zone-casing'),
    )
    const widths = casings.map((c) => Number(c.getAttribute('stroke-width')))
    const selectedIdx = ZONES.findIndex((z) => z.id === 'pp-bay')
    for (let i = 0; i < widths.length; i++) {
      if (i === selectedIdx) expect(widths[i]).toBeGreaterThan(widths[(i + 1) % widths.length])
    }
  })
})
