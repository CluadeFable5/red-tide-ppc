// @vitest-environment jsdom
import { render, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SEED_ZONES } from '../data/zones'
import { zonePaint } from '../styles/statusTheme'
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
      reports={[]} pendingCounts={{}}
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
        reports={[]} pendingCounts={{}}
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
    // Expected values come from the theme itself (statusTheme.ts moved the
    // ramp in PR #28; the test asserts the wiring, not the old numbers).
    const safe = zonePaint('safe')
    const { container, rerender } = renderMap('pp-bay')
    const path = await waitFor(() => {
      const el = pathFor(container, 'pp-bay')
      expect(el.getAttribute('fill-opacity')).toBe(String(safe.fillSelected))
      return el
    })
    // Its neighbours sit at the resting `fill`.
    expect(pathFor(container, 'honda-inner').getAttribute('fill-opacity')).toBe(String(safe.fill))

    // Deselect: the same element drops back to the resting step.
    rerender(
      <Map
        zones={ZONES}
        reports={[]} pendingCounts={{}}
        selectedZoneId={null}
        resetToken={0}
        focusZoneId={null}
        focusToken={0}
        onSelectZone={NOOP}
        onReport={NOOP}
      />,
    )

    await waitFor(() => {
      expect(path.getAttribute('fill-opacity')).toBe(String(safe.fill))
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
