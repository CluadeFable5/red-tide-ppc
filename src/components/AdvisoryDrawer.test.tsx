// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { motionValue } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { clearDemoData, createDemoBackend } from '../lib/backend.demo'
import { setBackendForTesting } from '../lib/backend'
import { SIDE_PANEL_FALLBACK_WIDTH } from '../motion/sidePanelAnchors'
import { useAppStore } from '../store'
import { AdvisoryDrawer } from './AdvisoryDrawer'
import { StatusKey } from './StatusKey'

/**
 * The drawer's behaviour half, mirroring how the sheet is covered: the snap
 * branches live in `sidePanelAnchors.test.ts` (pure logic, like
 * `sheetAnchors.test.ts`), and this suite pins the DOM/behaviour contract —
 * resting state, tap/keyboard paths, map-interaction guarantees, the chrome
 * fade, and the split from the pills row — plus one integration pass proving
 * the map page wires it up.
 *
 * The clip suite is the regression net for the bug class the old merged
 * panel shipped: content rendering outside the drawer's visible bounds. The
 * unit half (`drawerWindowWidth` swept across every drag position) lives in
 * `sidePanelAnchors.test.ts`; here the DOM half pins the containment chain,
 * the no-blur-inside-transform rule, and the collapsed window width.
 */

function renderDrawer() {
  const chromeOpacity = motionValue(1)
  render(
    <AdvisoryDrawer advisory={1} zones={6} pending={2} chromeOpacity={chromeOpacity} />,
  )
  return { chromeOpacity }
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
    const chromeOpacity = motionValue(1)
    render(
      <>
        <AdvisoryDrawer advisory={1} zones={6} pending={2} chromeOpacity={chromeOpacity} />
        <StatusKey counts={{ safe: 4, unconfirmed: 1, advisory: 1 }} chromeOpacity={chromeOpacity} />
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

  it('collapses on ArrowLeft and expands on ArrowRight', async () => {
    const user = userEvent.setup()
    renderDrawer()

    tab().focus()
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))

    // ArrowLeft again is a no-op, not a toggle — directional, like the swipe.
    await user.keyboard('{ArrowLeft}')
    expect(drawer().dataset.state).toBe('collapsed')

    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))

    await user.keyboard('{ArrowRight}')
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
  })

  it('keeps the gauge pointer-transparent so the map works beneath it', () => {
    renderDrawer()

    const gauge = screen.getByTestId('advisory-gauge')
    expect(gauge.classList.contains('pointer-events-none')).toBe(true)
  })

  it('drops tab pointer events while the chrome is faded out', async () => {
    const { chromeOpacity } = renderDrawer()

    // Visible chrome: the tab takes events.
    await waitFor(() => {
      expect((tab() as HTMLElement).style.pointerEvents).toBe('auto')
    })

    // The sheet rises; chrome fades. Invisible chrome must never swallow a
    // map gesture, so the tab goes pointer-transparent too.
    chromeOpacity.set(0)
    await waitFor(() => {
      expect((tab() as HTMLElement).style.pointerEvents).toBe('none')
    })

    // And back when the sheet comes down.
    chromeOpacity.set(1)
    await waitFor(() => {
      expect((tab() as HTMLElement).style.pointerEvents).toBe('auto')
    })
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

  it('is wired up with a live gauge, a working tab, and a separate fixed key', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: /open the map/i }))
    await screen.findByRole('button', { name: 'Reset view' })

    const live = await screen.findByTestId('advisory-drawer')
    expect(live.dataset.state).toBe('open')
    // Seeded demo data: 6 zones, none under advisory.
    expect(screen.getByText('Advisory signal')).toBeTruthy()
    expect(screen.getByText('0/6 adv · 0 pend')).toBeTruthy()

    // The pills row is a separate fixed element, not in the drawer.
    const key = await screen.findByTestId('status-key')
    expect(live.contains(key)).toBe(false)

    const liveTab = screen.getByTestId('advisory-drawer-tab')
    await user.click(liveTab)
    await waitFor(() => expect(live.dataset.state).toBe('collapsed'))
    // The key never moves with the drawer.
    expect(key.style.transform).toBe('')
    await user.click(liveTab)
    await waitFor(() => expect(live.dataset.state).toBe('open'))
  })
})
