// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { motionValue } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { clearDemoData, createDemoBackend } from '../lib/backend.demo'
import { setBackendForTesting } from '../lib/backend'
import { useAppStore } from '../store'
import type { ZoneStatus } from '../types'
import { StatusPanel } from './StatusPanel'

/**
 * The drawer's behaviour half, mirroring how the sheet is covered: the snap
 * branches live in `sidePanelAnchors.test.ts` (pure logic, like
 * `sheetAnchors.test.ts`), and this suite pins the DOM/behaviour contract —
 * resting state, tap/keyboard paths, map-interaction guarantees, and the
 * chrome fade — plus one integration pass proving the map page wires it up.
 */

const COUNTS: Record<ZoneStatus, number> = {
  safe: 4,
  unconfirmed: 1,
  advisory: 1,
}

function renderPanel() {
  const chromeOpacity = motionValue(1)
  render(
    <StatusPanel
      counts={COUNTS}
      advisory={1}
      zones={6}
      pending={2}
      chromeOpacity={chromeOpacity}
    />,
  )
  return { chromeOpacity }
}

function panel(): HTMLElement {
  return screen.getByTestId('status-panel')
}

function tab(): HTMLElement {
  return screen.getByTestId('status-panel-tab')
}

afterEach(() => {
  cleanup()
  setBackendForTesting(null)
  window.history.pushState({}, '', '/')
})

describe('StatusPanel resting state', () => {
  it('renders open with pills, gauge and an expanded tab', () => {
    renderPanel()

    expect(panel().dataset.state).toBe('open')

    // Pills: every status label with its count.
    const key = screen.getByRole('group', { name: 'Zone status key' })
    expect(within(key).getByText('Advisory')).toBeTruthy()
    expect(within(key).getByText('Unconfirmed')).toBeTruthy()
    expect(within(key).getByText('Safe')).toBeTruthy()
    expect(within(key).getByText('4')).toBeTruthy() // safe count

    // Gauge: the instrument readout.
    expect(screen.getByText('Advisory signal')).toBeTruthy()
    expect(screen.getByText('1/6 adv · 2 pend')).toBeTruthy()

    // Tab: expanded, labelled with what it will do next.
    expect(tab().getAttribute('aria-expanded')).toBe('true')
    expect(tab().getAttribute('aria-label')).toBe('Collapse status panel')
    expect(tab().getAttribute('aria-controls')).toBe('status-panel-body')
  })
})

describe('StatusPanel tap path', () => {
  it('toggles open → collapsed → open on tab clicks', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(tab())
    await waitFor(() => expect(panel().dataset.state).toBe('collapsed'))
    expect(tab().getAttribute('aria-expanded')).toBe('false')
    expect(tab().getAttribute('aria-label')).toBe('Expand status panel')

    await user.click(tab())
    await waitFor(() => expect(panel().dataset.state).toBe('open'))
    expect(tab().getAttribute('aria-expanded')).toBe('true')
    expect(tab().getAttribute('aria-label')).toBe('Collapse status panel')
  })
})

describe('StatusPanel keyboard path', () => {
  it('toggles on Enter and Space like any button', async () => {
    const user = userEvent.setup()
    renderPanel()

    tab().focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(panel().dataset.state).toBe('collapsed'))

    await user.keyboard(' ')
    await waitFor(() => expect(panel().dataset.state).toBe('open'))
  })

  it('collapses on ArrowLeft and expands on ArrowRight', async () => {
    const user = userEvent.setup()
    renderPanel()

    tab().focus()
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(panel().dataset.state).toBe('collapsed'))

    // ArrowLeft again is a no-op, not a toggle — directional, like the swipe.
    await user.keyboard('{ArrowLeft}')
    expect(panel().dataset.state).toBe('collapsed')

    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(panel().dataset.state).toBe('open'))

    await user.keyboard('{ArrowRight}')
    expect(panel().dataset.state).toBe('open')
  })
})

describe('StatusPanel map-interaction guarantees', () => {
  it('never captures gestures outside its own controls', () => {
    renderPanel()

    // The panel box itself is transparent: only the pills and the tab take
    // pointer events, so pan/zoom/tap-zones work everywhere else.
    expect(panel().classList.contains('pointer-events-none')).toBe(true)
    expect(tab().classList.contains('pointer-events-none')).toBe(false)
  })

  it('keeps the gauge pointer-transparent so the map works beneath it', () => {
    renderPanel()

    const gauge = screen.getByText('Advisory signal').closest('div')
      ?.parentElement as HTMLElement
    expect(gauge.classList.contains('pointer-events-none')).toBe(true)
  })

  it('drops pills and tab pointer events while the chrome is faded out', async () => {
    const { chromeOpacity } = renderPanel()
    const key = screen.getByRole('group', { name: 'Zone status key' })

    // Visible chrome: the controls take events.
    await waitFor(() => {
      expect((tab() as HTMLElement).style.pointerEvents).toBe('auto')
      expect(key.style.pointerEvents).toBe('auto')
    })

    // The sheet rises; chrome fades. Invisible chrome must never swallow a
    // map gesture, so the controls go pointer-transparent too.
    chromeOpacity.set(0)
    await waitFor(() => {
      expect((tab() as HTMLElement).style.pointerEvents).toBe('none')
      expect(key.style.pointerEvents).toBe('none')
    })

    // And back when the sheet comes down.
    chromeOpacity.set(1)
    await waitFor(() => {
      expect((tab() as HTMLElement).style.pointerEvents).toBe('auto')
      expect(key.style.pointerEvents).toBe('auto')
    })
  })
})

describe('StatusPanel on the map page', () => {
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
  })

  it('is wired up with live counts and a working tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: /open the map/i }))
    await screen.findByRole('button', { name: 'Reset view' })

    const live = await screen.findByTestId('status-panel')
    expect(live.dataset.state).toBe('open')
    // Seeded demo data: 6 zones, none under advisory.
    expect(screen.getByText('Advisory signal')).toBeTruthy()
    expect(screen.getByText('0/6 adv · 0 pend')).toBeTruthy()

    const liveTab = screen.getByTestId('status-panel-tab')
    await user.click(liveTab)
    await waitFor(() => expect(live.dataset.state).toBe('collapsed'))
    await user.click(liveTab)
    await waitFor(() => expect(live.dataset.state).toBe('open'))
  })
})
