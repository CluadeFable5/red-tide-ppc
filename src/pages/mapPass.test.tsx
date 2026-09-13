// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { clearDemoData, createDemoBackend } from '../lib/backend.demo'
import { setBackendForTesting } from '../lib/backend'
import { useAppStore } from '../store'

/**
 * The six-item visual pass, jsdom side.
 *
 * `scripts/final-pass.mjs` is the script of record for this checklist — it
 * runs in real Chromium and carries the geometry and motion assertions
 * (drag/flick physics, bounding-box clearance, computed styles) that a DOM
 * without a layout engine cannot prove. This suite asserts the DOM/behaviour
 * half of the same six items against the real components, so the checklist
 * has executable coverage in CI even where no browser is available:
 *
 *   1. peek row       — the summary line, © OSM and readout sit in the peek
 *                       strip, and the sheet body is fully hidden at peek
 *                       (content stays in the DOM; nothing is half-cut)
 *   2. anchors        — the handle cycles peek → mid → full → peek
 *                       (flick-velocity projection is pure logic, covered in
 *                        src/motion/sheetAnchors.test.ts)
 *   3. polygon ramp   — every polygon carries `.zone-path`; the fill-opacity
 *                       attribute moves rest → selected
 *   4. attribution    — © OSM in the peek row, full credit in the footer,
 *                       and no Leaflet attribution control in the DOM
 *   5. zoom control   — rendered top-right (visibility + margin are CSS,
 *                       checked by final-pass.mjs in a real browser)
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

function sheet(): HTMLElement {
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
  it('1 · peek row: summary line, © OSM and readout, with the body hidden at peek', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const panel = sheet()
    expect(panel.dataset.anchor).toBe('peek')
    expect(within(panel).getByText('6 zones · No advisories')).toBeTruthy()
    expect(within(panel).getByText('01 / 03')).toBeTruthy()

    const attribution = within(panel).getByRole('link', { name: '© OSM' })
    expect(attribution.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )

    // The sheet body is in the DOM (screen readers get it) but fully
    // transparent at peek — this is the fix for the half-cut headline:
    // nothing is visibly sliced at the peek edge.
    const body = panel.querySelector('[class*="overflow-y-auto"]') as HTMLElement
    expect(body).toBeTruthy()
    expect(body.style.opacity).toBe('0')
  })

  it('2 · anchors: the handle cycles peek → mid → full → peek', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const panel = sheet()
    expect(panel.dataset.anchor).toBe('peek')

    await user.click(
      within(panel).getByRole('button', { name: 'Show advisories and zones' }),
    )
    await waitFor(() => expect(panel.dataset.anchor).toBe('mid'))

    await user.click(
      within(panel).getByRole('button', { name: 'Show the full zone list' }),
    )
    await waitFor(() => expect(panel.dataset.anchor).toBe('full'))

    await user.click(
      within(panel).getByRole('button', { name: 'Collapse to the summary' }),
    )
    await waitFor(() => expect(panel.dataset.anchor).toBe('peek'))
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
      // All seed zones are `safe`: resting fill is 0.22.
      expect(path.getAttribute('fill-opacity')).toBe('0.22')
    }

    useAppStore.getState().selectZone('pp-bay')
    await waitFor(() => {
      const selected = paths.find((p) => p.classList.contains('zone-path--selected'))
      expect(selected).toBeTruthy()
      expect(selected!.getAttribute('fill-opacity')).toBe('0.46')
    })
    for (const other of paths) {
      if (other !== paths.find((p) => p.classList.contains('zone-path--selected'))) {
        expect(other.getAttribute('fill-opacity')).toBe('0.22')
      }
    }
  })

  it('4 · attribution: © OSM in the peek row, full credit in the footer, no Leaflet control', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const panel = sheet()
    const peekCredit = within(panel).getByRole('link', { name: '© OSM' })
    expect(peekCredit.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )

    // Full credit lives in the sheet footer.
    const footerCredit = within(panel).getByRole('link', {
      name: '© OpenStreetMap',
    })
    expect(footerCredit.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )

    // The Leaflet control is disabled — attribution moved to the sheet
    // because the control sits under it at every anchor.
    expect(document.querySelector('.leaflet-control-attribution')).toBeNull()
  })

  it('5 · zoom control: rendered in the top-right corner of the map', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    const zoom = document.querySelector(
      '.leaflet-top.leaflet-right .leaflet-control-zoom',
    )
    expect(zoom).toBeTruthy()
  })

  it('6 · report → approve: submit from the map, approve in admin, zone turns advisory', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    // Public user reports.
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
