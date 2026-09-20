// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { clearDemoData, createDemoBackend } from '../lib/backend.demo'
import { setBackendForTesting } from '../lib/backend'
import type { SidePanelState } from '../motion/sidePanelAnchors'
import { useSidePanel } from '../motion/useSidePanel'
import { useAppStore } from '../store'
import { ZONE_PANEL_FALLBACK_WIDTH, ZoneDrawer } from './ZoneDrawer'
import type { Zone } from '../types'

/**
 * The zone drawer's behaviour half — the right-edge side drawer that
 * replaced the bottom sheet. The snap maths live in
 * `sidePanelAnchors.test.ts` (both edges, unit-swept); this suite pins the
 * DOM/behaviour contract the brief demanded:
 *
 *   - the bottom strip is absent: no sheet anchors, no `01 / 03` readout,
 *     no bottom-edge region;
 *   - the drawer renders on the right edge of the control column and its
 *     tab toggles it (plus dots, summary, chevron — every non-drag path);
 *   - the "never renders outside clipped bounds at any drag state"
 *     guarantee is extended to this drawer: same containment chain, same
 *     no-blur-inside-the-track rule, window pinned to the drag motion value;
 *   - content parity with the sheet (summary, banner, zone list, readout,
 *     OSM credit — adapted to two states as `01 / 02`), and the zone cards
 *     stay MOUNTED when collapsed (the clip is visual only);
 *   - attribution is present and visible in open AND collapsed states.
 */

const zone: Zone = {
  id: 'pp-bay',
  name: 'Puerto Princesa Bay (City Proper)',
  status: 'safe',
  description: 'Sheltered city waters.',
  lastUpdated: Date.now(),
  polygon: [
    [9.7, 118.7],
    [9.71, 118.7],
    [9.71, 118.71],
  ],
}

function renderZoneDrawer(initial: SidePanelState = 'collapsed') {
  function Wrapper() {
    const panel = useSidePanel(initial, {
      edge: 'right',
      fallbackWidth: ZONE_PANEL_FALLBACK_WIDTH,
    })
    return (
      <ZoneDrawer
        zones={[zone]}
        zonesReady
        pendingCounts={{}}
        counts={{ safe: 1, unconfirmed: 0, advisory: 0 }}
        selectedZoneId={null}
        panel={panel}
        onFocusZone={() => {}}
        onReport={() => {}}
      />
    )
  }
  render(<Wrapper />)
}

function drawer(): HTMLElement {
  return screen.getByTestId('zone-drawer')
}

function drawerWindow(): HTMLElement {
  return screen.getByTestId('zone-drawer-window')
}

function tab(): HTMLElement {
  return screen.getByTestId('zone-drawer-tab')
}

afterEach(() => {
  cleanup()
  setBackendForTesting(null)
  window.history.pushState({}, '', '/')
})

describe('ZoneDrawer resting state', () => {
  it('renders collapsed with the grab tab contracted and labelled', () => {
    renderZoneDrawer()

    expect(drawer().dataset.state).toBe('collapsed')
    expect(tab().getAttribute('aria-expanded')).toBe('false')
    expect(tab().getAttribute('aria-label')).toBe('Open the zone drawer')
    expect(tab().getAttribute('aria-controls')).toBe('zone-drawer-body')
    expect(tab().classList.contains('w-11')).toBe(true) // 44px hit area

    // The sheet's content, present in the DOM even while tucked.
    expect(within(drawer()).getByText('1 zone · No advisories')).toBeTruthy()
    expect(within(drawer()).getByText('01 / 02')).toBeTruthy()
  })

  it('lays out the right-edge row: grab tab first, clip window hugging the edge', () => {
    renderZoneDrawer()

    const children = Array.from(drawer().children)
    expect(children[0]).toBe(tab())
    expect(children[1]).toBe(drawerWindow())
    expect(drawerWindow().classList.contains('justify-end')).toBe(true)

    // aria contract: the region keeps the sheet's accessible name.
    expect(drawer().getAttribute('aria-label')).toBe('Advisory and zone list')
  })

  it('reserves tab + gap + margins in the panel width so the tab never leaves the screen', () => {
    renderZoneDrawer()

    // min(100vw - 5rem, 23.75rem): at 320px the panel is 240px, leaving the
    // 44px tab, the 6px gap and the page margins inside the viewport.
    const panelEl = screen.getByTestId('zone-drawer-panel')
    expect(panelEl.className).toContain('min(100vw_-_5rem,23.75rem)')
  })
})

describe('ZoneDrawer toggle paths', () => {
  it('toggles collapsed → open → collapsed on tab clicks', async () => {
    const user = userEvent.setup()
    renderZoneDrawer()

    await user.click(tab())
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))
    expect(tab().getAttribute('aria-expanded')).toBe('true')
    expect(tab().getAttribute('aria-label')).toBe('Collapse the zone drawer')
    expect(within(drawer()).getByText('02 / 02')).toBeTruthy()

    await user.click(tab())
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
    expect(within(drawer()).getByText('01 / 02')).toBeTruthy()
  })

  it('opens on ArrowLeft and collapses on ArrowRight — the right-edge pair', async () => {
    const user = userEvent.setup()
    renderZoneDrawer()

    tab().focus()
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))

    // Directional, not a toggle: opening again is a no-op.
    await user.keyboard('{ArrowLeft}')
    expect(drawer().dataset.state).toBe('open')

    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))

    await user.keyboard('{ArrowRight}')
    expect(drawer().dataset.state).toBe('collapsed')
  })

  it('toggles on Enter and Space like any button', async () => {
    const user = userEvent.setup()
    renderZoneDrawer()

    tab().focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))
    await user.keyboard(' ')
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
  })

  it('reaches both states without dragging: summary button, state dots, chevron', async () => {
    const user = userEvent.setup()
    renderZoneDrawer()

    // The summary line toggles.
    await user.click(
      within(drawer()).getByRole('button', {
        name: '1 zone · No advisories — Open the zone drawer',
      }),
    )
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))

    // The state dots jump directly, with aria-pressed on the current state.
    // (Tab/chevron share the same aria-labels, so pick the dot out by its
    // aria-pressed attribute.)
    const collapsedDot = within(drawer())
      .getAllByRole('button', { name: 'Collapse the zone drawer' })
      .find((el) => el.getAttribute('aria-pressed') !== null)!
    const dots = drawer().querySelectorAll('[aria-label="Drawer position"] button')
    expect(dots).toHaveLength(2)
    await user.click(collapsedDot)
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
    const openDot = within(drawer())
      .getAllByRole('button', { name: 'Open the zone drawer' })
      .find((el) => el.getAttribute('aria-pressed') !== null)!
    // Collapsed is current: its dot is the pressed one.
    expect(collapsedDot.getAttribute('aria-pressed')).toBe('true')
    expect(openDot.getAttribute('aria-pressed')).toBe('false')
    await user.click(openDot)
    await waitFor(() => expect(drawer().dataset.state).toBe('open'))
    expect(openDot.getAttribute('aria-pressed')).toBe('true')

    // The chevron toggles too. (Its aria-label matches the tab's, so pick
    // the one that is neither the tab nor a state dot.)
    const chevrons = within(drawer())
      .getAllByRole('button', { name: 'Collapse the zone drawer' })
      .filter((el) => el !== tab() && el.getAttribute('aria-pressed') === null)
    expect(chevrons).toHaveLength(1)
    await user.click(chevrons[0])
    await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
  })
})

describe('ZoneDrawer map-interaction guarantees', () => {
  it('never captures gestures outside its tab and its solid panel', () => {
    renderZoneDrawer()

    expect(drawer().classList.contains('pointer-events-none')).toBe(true)
    expect(tab().classList.contains('pointer-events-auto')).toBe(true)
    expect(
      screen.getByTestId('zone-drawer-panel').classList.contains('pointer-events-auto'),
    ).toBe(true)
  })
})

describe('ZoneDrawer clip guarantees', () => {
  it('nests the panel inside the track inside the overflow-hidden window', () => {
    renderZoneDrawer()

    const window = drawerWindow()
    expect(window.classList.contains('overflow-hidden')).toBe(true)

    const track = document.getElementById('zone-drawer-body')
    expect(track).toBeTruthy()
    expect(track!.closest('[data-testid="zone-drawer-window"]')).toBe(window)
    expect(track!.classList.contains('w-max')).toBe(true)

    const panelEl = screen.getByTestId('zone-drawer-panel')
    expect(panelEl.closest('#zone-drawer-body')).toBe(track)
  })

  it('keeps backdrop-blur out of the translated track — blur lives on static layers only', () => {
    renderZoneDrawer()

    // Same rule as the gauge card: the panel is solid ink-2, and no element
    // from the panel up to the track may blur. The TAB keeps its blur: it is
    // a static sibling, never translated.
    const panelEl = screen.getByTestId('zone-drawer-panel')
    expect(panelEl.classList.contains('bg-ink-2')).toBe(true)

    let node: HTMLElement | null = panelEl
    const track = document.getElementById('zone-drawer-body')
    while (node && node !== track) {
      for (const cls of Array.from(node.classList)) {
        expect(cls.startsWith('backdrop-')).toBe(false)
      }
      node = node.parentElement
    }
    expect(node).toBe(track)

    expect(tab().className).toContain('backdrop-blur-md')
  })

  it('tracks the window width from the same motion value as the track (reduced-motion jump)', async () => {
    // Reduced-motion makes the snap a synchronous jump, so the window width
    // is deterministic in jsdom (no spring frames to wait out). This is the
    // "never renders outside clipped bounds at any drag state" DOM pin,
    // extended from the advisory drawer to the zone drawer.
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
      renderZoneDrawer()

      // Collapsed from the start: the window is already 0 wide.
      await waitFor(() => {
        expect(drawerWindow().style.width).toBe('0px')
      })

      tab().click()
      await waitFor(() => expect(drawer().dataset.state).toBe('open'))
      await waitFor(() => {
        // jsdom has no layout: the zone panel's fallback width stands in.
        expect(drawerWindow().style.width).toBe(`${ZONE_PANEL_FALLBACK_WIDTH}px`)
      })

      tab().click()
      await waitFor(() => expect(drawer().dataset.state).toBe('collapsed'))
      await waitFor(() => {
        expect(drawerWindow().style.width).toBe('0px')
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

describe('ZoneDrawer content parity with the sheet', () => {
  it('keeps the zone list mounted while collapsed — the clip is visual only', () => {
    renderZoneDrawer()

    expect(drawer().dataset.state).toBe('collapsed')
    // The report flow and screen readers keep their full DOM.
    expect(
      within(drawer()).getByRole('heading', { name: 'Puerto Princesa Bay (City Proper)' }),
    ).toBeTruthy()
    expect(within(drawer()).getByText('No advisories recorded right now')).toBeTruthy()
    expect(
      within(drawer()).getByRole('button', { name: /Report something here/i }),
    ).toBeTruthy()
  })

  it('carries the OSM credit twice inside, mirroring the sheet', () => {
    renderZoneDrawer()

    const compact = within(drawer()).getByRole('link', { name: '© OSM' })
    expect(compact.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    const full = within(drawer()).getByRole('link', { name: '© OpenStreetMap' })
    expect(full.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
  })
})

describe('ZoneDrawer on the map page', () => {
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

  async function openMap(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    render(<App />)
    await user.click(screen.getByRole('link', { name: /open the map/i }))
    await screen.findByRole('button', { name: 'Reset view' })
  }

  it('replaces the bottom strip entirely: no sheet anchors, no 01/03 readout', async () => {
    const user = userEvent.setup()
    await openMap(user)

    // The drawer exists, in the control column, under the advisory tab.
    const live = await screen.findByTestId('zone-drawer')
    const column = screen.getByTestId('map-control-column')
    expect(column.contains(live)).toBe(true)
    const rows = Array.from(column.children)
    expect(rows.indexOf(screen.getByTestId('advisory-drawer'))).toBeLessThan(
      rows.indexOf(live),
    )
    expect(rows.indexOf(screen.getByTestId('zoom-controls'))).toBeLessThan(
      rows.indexOf(screen.getByTestId('advisory-drawer')),
    )

    // The bottom sheet's contract is gone from the document.
    expect(document.querySelector('[data-anchor]')).toBeNull()
    expect(document.querySelector('.sheet-ticks')).toBeNull()
    expect(screen.queryByText('01 / 03')).toBeNull()
    expect(screen.queryByText('02 / 03')).toBeNull()
    expect(screen.queryByText('03 / 03')).toBeNull()

    // And its content lives in the drawer instead.
    expect(
      within(live).getByText('7 zones · No advisories'),
    ).toBeTruthy()
  })

  it('toggles from the tab, keeping the pills row and attribution fixed', async () => {
    const user = userEvent.setup()
    await openMap(user)

    const live = await screen.findByTestId('zone-drawer')
    const attribution = screen.getByTestId('map-attribution')

    await user.click(screen.getByTestId('zone-drawer-tab'))
    await waitFor(() => expect(live.dataset.state).toBe('open'))
    expect(within(live).getByText('02 / 02')).toBeTruthy()
    // Attribution present and the same element across the state change.
    expect(screen.getByTestId('map-attribution')).toBe(attribution)

    await user.click(screen.getByTestId('zone-drawer-tab'))
    await waitFor(() => expect(live.dataset.state).toBe('collapsed'))
    expect(within(live).getByText('01 / 02')).toBeTruthy()
    expect(screen.getByTestId('map-attribution')).toBe(attribution)
  })

  it('keeps the OSM attribution present in open AND collapsed states', async () => {
    const user = userEvent.setup()
    await openMap(user)

    const attribution = await screen.findByTestId('map-attribution')
    expect(attribution.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )
    expect(attribution.textContent).toContain('OpenStreetMap')

    // Collapsed (default on a phone viewport): present.
    const live = await screen.findByTestId('zone-drawer')
    expect(live.dataset.state).toBe('collapsed')
    expect(attribution.isConnected).toBe(true)

    // Open: still present — it sits outside every clip window.
    await user.click(screen.getByTestId('zone-drawer-tab'))
    await waitFor(() => expect(live.dataset.state).toBe('open'))
    expect(attribution.isConnected).toBe(true)
  })

  it('tucks the drawer when a zone row is tapped below the drawer breakpoint', async () => {
    // Drive the breakpoint explicitly: jsdom has no matchMedia by default.
    const originalMatchMedia = (window as unknown as { matchMedia?: unknown }).matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false, // below 768px
        media: query,
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
      await openMap(user)

      const live = await screen.findByTestId('zone-drawer')
      await user.click(screen.getByTestId('zone-drawer-tab'))
      await waitFor(() => expect(live.dataset.state).toBe('open'))

      await user.click(
        within(live).getByRole('heading', { name: 'Honda Bay — Inner Islands' }),
      )
      await waitFor(() => expect(live.dataset.state).toBe('collapsed'))
      expect(useAppStore.getState().selectedZoneId).toBe('honda-inner')
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
