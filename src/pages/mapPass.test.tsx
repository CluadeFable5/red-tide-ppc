// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { clearDemoData, createDemoBackend } from '../lib/backend.demo'
import { setBackendForTesting } from '../lib/backend'
import { useAppStore } from '../store'

/**
 * The six-item visual pass, jsdom side — rewritten for the drawer layout.
 *
 * `scripts/map-drawers-pass.mjs` is the script of record for this checklist —
 * it runs in real Chromium and carries the geometry and motion assertions
 * (drag/flick physics, clip-window tracking, bounding-box clearance,
 * screenshots at five widths) that a DOM without a layout engine cannot
 * prove. This suite asserts the DOM/behaviour half of the same items against
 * the real components, so the checklist has executable coverage in CI even
 * where no browser is available:
 *
 *   1. bottom strip    — ABSENT: no sheet anchors, no 01/03 readout; the
 *                        zone drawer's header strip carries the summary, the
 *                        01/02 two-state readout and the compact © OSM link
 *   2. drawer states   — the zone drawer toggles collapsed ↔ open from its
 *                        tab and its state dots (flick-velocity projection
 *                        is pure logic, covered in sidePanelAnchors.test.ts)
 *   3. polygon ramp    — every polygon carries `.zone-path`; the fill-opacity
 *                        attribute moves rest → selected
 *   4. attribution     — the persistent pill is present in both drawer
 *                        states, full credit in the drawer footer, and no
 *                        Leaflet attribution control in the DOM
 *   5. zoom control    — the column's own 44px buttons, wired to the live
 *                        Leaflet instance; Leaflet's own control is absent
 *   6. report → approve — the full loop through the demo backend
 */

const ZONE = 'Honda Bay — Inner Islands'
const PASSCODE = 'test-passcode'

function zoneCard(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name })
  const card = heading.closest('li')
  if (!card) throw new Error(`No card found for zone "${name}"`)
  return card
}

async function openMap(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('link', { name: /open the map/i }))
  await screen.findByRole('button', { name: 'Reset view' })
}

function drawer(): HTMLElement {
  return screen.getByRole('region', { name: 'Advisory and zone list' })
}

beforeEach(() => {
  clearDemoData()
  setBackendForTesting(createDemoBackend())
  useAppStore.setState({
    zones: [],
    reports: [],
    zonesReady: false,
    reportsReady: false,
    error: null,
    formError: null,
    notice: null,
    submitting: false,
    busyReportId: null,
    busyZoneId: null,
    selectedZoneId: null,
    reportZoneId: null,
    adminUnlocked: false,
  })
  vi.stubEnv('VITE_ADMIN_PASSCODE', PASSCODE)
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  setBackendForTesting(null)
  window.history.pushState({}, '', '/')
})

describe('six-item pass on /map (jsdom side)', () => {
  it('1 · bottom strip absent: the drawer header strip carries the summary line, the 01/02 readout and © OSM', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const panel = drawer()
    expect(panel.dataset.state).toBe('collapsed')
    expect(within(panel).getByText('6 zones · No advisories')).toBeTruthy()
    expect(within(panel).getByText('01 / 02')).toBeTruthy()

    const attribution = within(panel).getByRole('link', { name: '© OSM' })
    expect(attribution.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )

    // The sheet is gone: no anchors, no tick strip, no three-page readout.
    expect(document.querySelector('[data-anchor]')).toBeNull()
    expect(document.querySelector('.sheet-ticks')).toBeNull()
    expect(screen.queryByText('01 / 03')).toBeNull()

    // The drawer body stays in the DOM while tucked (screen readers and the
    // report flow keep it) — the clip is visual, structural, and driven by
    // the drag motion value, never a conditional unmount.
    expect(
      within(panel).getByRole('heading', { name: ZONE }),
    ).toBeTruthy()
  })

  it('2 · drawer states: the tab and the state dots move collapsed ↔ open', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const panel = drawer()
    expect(panel.dataset.state).toBe('collapsed')

    await user.click(screen.getByTestId('zone-drawer-tab'))
    await waitFor(() => expect(panel.dataset.state).toBe('open'))
    expect(within(panel).getByText('02 / 02')).toBeTruthy()

    const collapsedDot = within(panel)
      .getAllByRole('button', { name: 'Collapse the zone drawer' })
      .find((el) => el.getAttribute('aria-pressed') !== null)!
    await user.click(collapsedDot)
    await waitFor(() => expect(panel.dataset.state).toBe('collapsed'))
    expect(within(panel).getByText('01 / 02')).toBeTruthy()

    const openDot = within(panel)
      .getAllByRole('button', { name: 'Open the zone drawer' })
      .find((el) => el.getAttribute('aria-pressed') !== null)!
    await user.click(openDot)
    await waitFor(() => expect(panel.dataset.state).toBe('open'))
  })

  it('3 · polygon fill ramp: every path carries .zone-path and the fill steps with selection', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const paths = Array.from(
      document.querySelectorAll<SVGPathElement>('.leaflet-overlay-pane path'),
    )
    expect(paths).toHaveLength(6)
    for (const path of paths) {
      expect(path.classList.contains('zone-path')).toBe(true)
      // All seed zones are `safe`: resting fill is 0.16.
      expect(path.getAttribute('fill-opacity')).toBe('0.16')
    }

    useAppStore.getState().selectZone('pp-bay')
    await waitFor(() => {
      const selected = paths.find((p) => p.classList.contains('zone-path--selected'))
      expect(selected).toBeTruthy()
      expect(selected!.getAttribute('fill-opacity')).toBe('0.46')
    })
    for (const other of paths) {
      if (other !== paths.find((p) => p.classList.contains('zone-path--selected'))) {
        expect(other.getAttribute('fill-opacity')).toBe('0.16')
      }
    }
  })

  it('4 · attribution: a persistent always-visible pill, full credit in the drawer footer, no Leaflet control', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    // The persistent pill is outside every clip window — present in both
    // states, and it is one stable element, never remounted.
    const pill = screen.getByTestId('map-attribution')
    expect(pill.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    expect(pill.textContent).toContain('OpenStreetMap')

    const panel = drawer()
    expect(panel.dataset.state).toBe('collapsed')
    await user.click(screen.getByTestId('zone-drawer-tab'))
    await waitFor(() => expect(panel.dataset.state).toBe('open'))
    expect(screen.getByTestId('map-attribution')).toBe(pill)

    // Full credit lives in the drawer footer.
    const footerCredit = within(panel).getByRole('link', {
      name: '© OpenStreetMap',
    })
    expect(footerCredit.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )

    // The Leaflet control is disabled — Leaflet's own attribution corner
    // would sit under the drawers and cannot satisfy "visible in every
    // state".
    expect(document.querySelector('.leaflet-control-attribution')).toBeNull()
  })

  it('5 · zoom control: the column renders its own 44px buttons wired to the live map', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const column = screen.getByTestId('map-control-column')
    const zoom = within(column).getByRole('group', { name: 'Map zoom' })

    const zoomIn = within(zoom).getByRole('button', { name: 'Zoom in' })
    const zoomOut = within(zoom).getByRole('button', { name: 'Zoom out' })
    expect(zoomIn.className).toContain('h-11')
    expect(zoomIn.className).toContain('w-11')
    expect(zoomOut.className).toContain('h-11')

    // Once the map instance is published the buttons are live (mid zoom,
    // neither limit reached).
    await waitFor(() => expect(zoomIn.hasAttribute('disabled')).toBe(false))
    expect(zoomOut.hasAttribute('disabled')).toBe(false)

    // Clicking drives the map (and never throws), though the zoom value
    // itself is a real-browser assertion (map-drawers-pass.mjs).
    await user.click(zoomIn)
    await user.click(zoomOut)

    // Leaflet's own 30px control is gone from the document.
    expect(document.querySelector('.leaflet-control-zoom')).toBeNull()
  })

  it('6 · report → approve: submit from the map, approve in admin, zone turns advisory', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    // Public user reports — from the zone drawer's card.
    await user.click(
      within(zoneCard(ZONE)).getByRole('button', {
        name: /Report something here/i,
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText('What did you see?'),
      'Water turned reddish-brown near the shallows and there were dead mussels.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Submit report' }))
    expect(await screen.findByText(/Salamat!/)).toBeTruthy()

    // Admin unlocks and approves.
    await user.click(screen.getByRole('link', { name: 'Admin' }))
    const passcodeInput = await screen.findByLabelText('Passcode')
    await user.type(passcodeInput, PASSCODE)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    const approve = await screen.findByRole('button', { name: /Approve → advisory/i })
    await user.click(approve)

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.reports[0].status).toBe('confirmed')
      const zone = state.zones.find((z) => z.id === 'honda-inner')!
      expect(zone.status).toBe('advisory')
    })
  })
})
