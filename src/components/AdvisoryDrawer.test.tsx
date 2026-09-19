// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { clearDemoData, createDemoBackend } from '../lib/backend.demo'
import { setBackendForTesting } from '../lib/backend'
import { SIDE_PANEL_FALLBACK_WIDTH } from '../motion/sidePanelAnchors'
import { useAppStore } from '../store'
import { AdvisoryDrawer } from './AdvisoryDrawer'
import { StatusKey } from './StatusKey'

/**
 * The drawer's behaviour half, mirroring how the zone drawer is covered: the
 * snap branches live in `sidePanelAnchors.test.ts` (pure logic, both edges),
 * and this suite pins the DOM/behaviour contract — resting state, tap/
 * keyboard paths, map-interaction guarantees, the split from the pills row,
 * and the right-edge geometry it now lives in — plus one integration pass
 * proving the map page wires it up.
 *
 * The clip suite is the regression net for the bug class the old merged
 * panel shipped: content rendering outside the drawer's visible bounds. The
 * unit half (`drawerWindowWidth` swept across every drag position, both
 * edges) lives in `sidePanelAnchors.test.ts`; here the DOM half pins the
 * containment chain, the no-blur-inside-transform rule, and the collapsed
 * window width. The drawer moved to the RIGHT edge in the control-column
 * pass (tab before the window, ArrowRight collapses); the clip invariants
 * are orientation-neutral and are pinned unchanged.
 */

function renderDrawer() {
  render(<AdvisoryDrawer advisory={1} zones={6} pending={2} />)
}

function drawer(): HTMLElement {
  return screen.getByTestId('advisory-drawer')
}

function drawerWindow(): HTMLElement {
  return screen.getByTestId('advisory-drawer-window')
}

function tab(): HTMLElement {
  return screen.getByTestId('advisory-drawer-tab')
}

afterEach(() => {
  cleanup()
  setBackendForTesting(null)
  window.history.pushState({}, '', '/')
})

describe('AdvisoryDrawer resting state', () => {
  it('renders open with the gauge and an expanded tab', () => {
    renderDrawer()

    expect(drawer().dataset.state).toBe('open')

    // Gauge: the instrument readout.
    expect(screen.getByText('Advisory signal')).toBeTruthy()
    expect(screen.getByText('1/6 adv · 2 pend')).toBeTruthy()

    // Tab: expanded, labelled with what it will do next.
    expect(tab().getAttribute('aria-expanded')).toBe('true')
    expect(tab().getAttribute('aria-label')).toBe('Collapse advisory signal panel')
    expect(tab().getAttribute('aria-controls')).toBe('advisory-drawer-body')
  })

  it('holds only the gauge — the pills row is not in this subtree', () => {
    render(
      <>
        <AdvisoryDrawer advisory={1} zones={6} pending={2} />
        <StatusKey counts={{ safe: 4, unconfirmed: 1, advisory: 1 }} />
      </>,
    )

    // The pills group exists on the page but outside the drawer.
    const key = screen.getByTestId('status-key')
    expect(drawer().contains(key)).toBe(false)
    expect(
      within(drawer()).queryByRole('group', { name: 'Zone status key' }),
    ).toBeNull()

    // The drawer root itself is never translated — only the card track moves,
    // inside the clip window.
    expect(drawer().style.transform).toBe('')
  })

  it('lays out the right-edge row: grab tab first, clip window hugging the edge', () => {
    renderDrawer()

    // Right-edge geometry mirrors the left: the tab leads, the window
    // follows, and the track hugs the window's anchored (right) edge while
    // the left edge is the moving cut.
    const children = Array.from(drawer().children)
    expect(children[0]).toBe(tab())
    expect(children[1]).toBe(drawerWindow())
    expect(drawerWindow().classList.contains('justify-end')).toBe(true)

    // The tab meets the 44px touch hit-area floor of the control column.
    expect(tab().classList.contains('w-11')).toBe(true)
  })
})

describe('AdvisoryDrawer tap path', () => {
  it('toggles open → collapsed → open on tab clicks', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(tab())
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
    expect(tab().getAttribute('aria-expanded')).toBe('false')
    expect(tab().getAttribute('aria-label')).toBe('Expand advisory signal panel')

    await user.click(tab())
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))
    expect(tab().getAttribute('aria-expanded')).toBe('true')
    expect(tab().getAttribute('aria-label')).toBe('Collapse advisory signal panel')
  })

  it('still toggles on a tap fired right after a drag (tap-after-drag regression)', async () => {
    // The hook's per-press reset of the drag-travel ledger is what makes
    // this pass: a tap after a real drag must not inherit the old gesture's
    // travel and get swallowed as a drag tail. jsdom cannot produce a real
    // pointer drag, so this pins the contract the keyboard path shares:
    // detail-0 activation (assistive tech) always works, drag or no drag.
    const user = userEvent.setup()
    renderDrawer()

    tab().focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))
    tab().click() // element.click(): detail 0, must never be a "drag tail"
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
  })
})

describe('AdvisoryDrawer keyboard path', () => {
  it('toggles on Enter and Space like any button', async () => {
    const user = userEvent.setup()
    renderDrawer()

    tab().focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))

    await user.keyboard(' ')
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))
  })

  it('collapses on ArrowRight and expands on ArrowLeft — the right-edge pair', async () => {
    const user = userEvent.setup()
    renderDrawer()

    tab().focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))

    // ArrowRight again is a no-op, not a toggle — directional, like the swipe.
    await user.keyboard('{ArrowRight}')
    expect(drawer().dataset.state).toBe('collapsed')

    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))

    await user.keyboard('{ArrowLeft}')
    expect(drawer().dataset.state).toBe('open')
  })
})

describe('AdvisoryDrawer map-interaction guarantees', () => {
  it('never captures gestures outside its own tab', () => {
    renderDrawer()

    // The drawer box itself is transparent: only the tab takes pointer
    // events, so pan/zoom/tap-zones work everywhere else.
    expect(drawer().classList.contains('pointer-events-none')).toBe(true)
    expect(tab().classList.contains('pointer-events-none')).toBe(false)
    expect(tab().classList.contains('pointer-events-auto')).toBe(true)
  })

  it('keeps the gauge pointer-transparent so the map works beneath it', () => {
    renderDrawer()

    const gauge = screen.getByTestId('advisory-gauge')
    expect(gauge.classList.contains('pointer-events-none')).toBe(true)
  })
})

describe('AdvisoryDrawer clip guarantees', () => {
  it('nests the gauge inside the track inside the overflow-hidden window', () => {
    renderDrawer()

    // The containment chain is the clip: track → window clips everything.
    const window = drawerWindow()
    expect(window.classList.contains('overflow-hidden')).toBe(true)

    const track = document.getElementById('advisory-drawer-body')
    expect(track).toBeTruthy()
    expect(track!.closest('[data-testid="advisory-drawer-window"]')).toBe(window)
    // `w-max` keeps the track at the card's own width whatever the window is
    // doing — without it the measurement corrupts and the drawer re-pins
    // mid-drag.
    expect(track!.classList.contains('w-max')).toBe(true)

    const gauge = screen.getByTestId('advisory-gauge')
    expect(gauge.closest('#advisory-drawer-body')).toBe(track)
  })

  it('keeps backdrop-blur out of the translated track', () => {
    renderDrawer()

    // The bleed the old panel shipped: translucent blurred layers inside a
    // transformed ancestor detach on mobile GPUs, leaving floating text. The
    // gauge card must be solid, and no ancestor up to the track may blur.
    const gauge = screen.getByTestId('advisory-gauge')
    expect(gauge.classList.contains('bg-ink-2')).toBe(true)
    for (const cls of Array.from(gauge.classList)) {
      expect(cls.startsWith('backdrop-')).toBe(false)
      expect(cls.startsWith('bg-ink-2/')).toBe(false)
    }

    let node: HTMLElement | null = gauge.parentElement
    const track = document.getElementById('advisory-drawer-body')
    while (node && node !== track) {
      for (const cls of Array.from(node.classList)) {
        expect(cls.startsWith('backdrop-')).toBe(false)
      }
      node = node.parentElement
    }
    expect(node).toBe(track)
  })

  it('shrinks the clip window to 0 when collapsed and restores it when open', async () => {
    // Reduced-motion makes the snap a synchronous jump, so the window width
    // is deterministic in jsdom (no spring frames to wait out).
    const originalMatchMedia = (window as unknown as { matchMedia?: unknown }).matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => ({
        matches: true,
        media: '',
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }),
    })
    try {
      const user = userEvent.setup()
      renderDrawer()

      // jsdom has no layout: the fallback card width stands in.
      await waitFor(() => {
        expect(drawerWindow().style.width).toBe(`${SIDE_PANEL_FALLBACK_WIDTH}px`)
      })

      await user.click(tab())
      await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
      await waitFor(() => {
        expect(drawerWindow().style.width).toBe('0px')
      })

      await user.click(tab())
      await waitFor(() => expect(drawer().dataset.state).toBe('open'))
      await waitFor(() => {
        expect(drawerWindow().style.width).toBe(`${SIDE_PANEL_FALLBACK_WIDTH}px`)
      })
    } finally {
      if (originalMatchMedia === undefined) {
        delete (window as unknown as { matchMedia?: unknown }).matchMedia
      } else {
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          configurable: true,
          value: originalMatchMedia,
        })
      }
    }
  })
})

describe('AdvisoryDrawer on the map page', () => {
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

  it('is wired into the control column with a live gauge, a working tab, and a separate fixed key', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: /open the map/i }))
    await screen.findByRole('button', { name: 'Reset view' })

    const live = await screen.findByTestId('advisory-drawer')
    expect(live.dataset.state).toBe('open')
    // Seeded demo data: 6 zones, none under advisory.
    expect(screen.getByText('Advisory signal')).toBeTruthy()
    expect(screen.getByText('0/6 adv · 0 pend')).toBeTruthy()

    // The drawer lives in the top-right control column now, under the zoom.
    const column = screen.getByTestId('map-control-column')
    expect(column.contains(live)).toBe(true)
    expect(column.contains(screen.getByTestId('advisory-drawer-tab'))).toBe(true)

    // The pills row is a separate fixed element, not in the drawer.
    const key = await screen.findByTestId('status-key')
    expect(live.contains(key)).toBe(false)
    expect(column.contains(key)).toBe(false)

    const liveTab = screen.getByTestId('advisory-drawer-tab')
    await user.click(liveTab)
    await waitFor(() => expect(live.dataset.state).toBe('collapsed'))
    // The key never moves with the drawer.
    expect(key.style.transform).toBe('')
    await user.click(liveTab)
    await waitFor(() => expect(live.dataset.state).toBe('open'))
  })
})
