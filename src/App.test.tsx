// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { MapLoadingFallback } from './App'
import { clearDemoData, createDemoBackend } from './lib/backend.demo'
import { setBackendForTesting } from './lib/backend'
import { useAppStore } from './store'

/**
 * End-to-end UI walk-through of the core loop, rendered for real in jsdom:
 *
 *   /map → tap a zone → report form → submit
 *        → /admin → passcode → approve → zone turns advisory
 *
 * It runs against the in-memory demo backend, so it needs no Firebase project.
 *
 * The map now lives at `/map` (lazy-loaded); `/` is the landing page. Each
 * test starts at `/` and navigates to the page it walks.
 */

const ZONE = 'Honda Bay — Inner Islands'
const PASSCODE = 'test-passcode'

/**
 * Walk from the landing page to the map the way a user would: through the
 * router's own link. (A raw `history.pushState` clobbers the router's
 * location state and is not a navigation it will honour.)
 */
async function openMap(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('link', { name: /open the map/i }))
  // The map page is lazy; wait for it to mount.
  await screen.findByRole('button', { name: 'Reset view' })
}

function zoneCard(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name })
  const card = heading.closest('li')
  if (!card) throw new Error(`No card found for zone "${name}"`)
  return card
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

// jsdom has no createObjectURL; restore whatever was there before.
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  setBackendForTesting(null)
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  window.history.pushState({}, '', '/')
})

describe('landing page (/)', () => {
  it('shows the decrypted hero, the CTAs and the live readout', async () => {
    render(<App />)

    // The hero labels itself on the heading; the scramble completes shortly
    // after load and its final text lands in the overlay span.
    const h1 = screen.getByRole('heading', { name: 'Red Tide' })
    await waitFor(
      () => {
        const overlay = h1.querySelector('span.absolute') as HTMLElement
        expect(overlay.textContent).toBe('RED TIDE')
      },
      { timeout: 3000 },
    )

    expect(screen.getByRole('link', { name: /open the map/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /report a sighting/i })).toBeTruthy()

    // The live readout lands from the demo backend (synchronous subscribe).
    expect(await screen.findByText('7 zones watched')).toBeTruthy()
    expect(screen.getByText('Zones watched')).toBeTruthy()
  })
})

describe('route transition', () => {
  it('shows nothing at all while the map chunk is loading', () => {
    // The fallback is only on screen inside a route dissolve, where the caller
    // is holding the whole frame at opacity 0. Anything visible here — a spinner,
    // a brand mark, any content — would be fading in blank space before the map
    // arrives, which is the one thing that makes a route transition look
    // unfinished. `scripts/route-transition-pass.mjs` measures the same thing in
    // a browser with the map chunk deliberately delayed.
    const { container } = render(<MapLoadingFallback />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('opacity-0')
    expect(el.innerHTML).toBe('')
  })
})

describe('map page (/map)', () => {
  it('lists every seeded zone with its status', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    for (const name of [
      'Puerto Princesa Bay (City Proper)',
      'Sta. Lourdes Coastal Waters',
      'Honda Bay — Inner Islands',
      'Honda Bay — Outer Islands',
      'Binuatan (Northeast Coast)',
      'Sabang — St. Paul Bay (North Coast)',
    ]) {
      expect(await screen.findByRole('heading', { name })).toBeTruthy()
    }

    // All zones start safe, so the "no advisories" panel is shown.
    expect(screen.getByText('No advisories recorded right now')).toBeTruthy()
  })

  it('rejects a report that is too short', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    await user.click(
      within(zoneCard(ZONE)).getByRole('button', {
        name: /Report something here/i,
      }),
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('What did you see?'), 'red')
    await user.click(within(dialog).getByRole('button', { name: 'Submit report' }))

    expect(useAppStore.getState().reports).toHaveLength(0)
    // Still open — the submit button stays disabled until it is long enough.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('the full report → approve loop', () => {
  it('submits a report, then approves it in admin, turning the zone advisory', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    // --- 1. public user files a report -------------------------------
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

    await waitFor(() => {
      expect(useAppStore.getState().reports).toHaveLength(1)
    })
    const report = useAppStore.getState().reports[0]
    expect(report.status).toBe('pending')
    expect(report.zoneId).toBe('honda-inner')

    // The form closed itself and the zone now shows a pending count.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(await screen.findByText('1 pending report')).toBeTruthy()

    // --- 2. admin unlocks and approves --------------------------------
    await user.click(screen.getByRole('link', { name: 'Admin' }))

    const passcodeInput = await screen.findByLabelText('Passcode')
    await user.type(passcodeInput, 'wrong-one')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('That passcode is not correct.')).toBeTruthy()

    await user.clear(passcodeInput)
    await user.type(passcodeInput, PASSCODE)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(
      await screen.findByRole('button', { name: /Approve → advisory/i }),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Approve → advisory/i }))

    await waitFor(() => {
      const state = useAppStore.getState()
      const zone = state.zones.find((z) => z.id === 'honda-inner')!
      expect(state.reports[0].status).toBe('confirmed')
      expect(zone.status).toBe('advisory')
    })

    // --- 3. the public map now shows the advisory ---------------------
    await user.click(screen.getByRole('link', { name: 'Public map' }))
    expect(
      await screen.findByText(/zone is under advisory|zones are under advisory/i),
    ).toBeTruthy()

    const card = zoneCard(ZONE)
    expect(within(card).getByText('Advisory')).toBeTruthy()
  })
})

describe('photo attachment', () => {
  it('uploads a photo with the report and stores the resulting URL', async () => {
    // jsdom has no createObjectURL, no real image decoding and no canvas, so
    // stub the first and let the rest fall through to the raw-data-URL path
    // that `fileToCompressedDataUrl` is designed to use.
    URL.createObjectURL = vi
      .fn()
      .mockReturnValue('blob:http://localhost/mock') as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL

    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 2400
      height = 1200
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal('Image', FakeImage)

    const user = userEvent.setup()
    render(<App />)
    await openMap(user)

    await user.click(
      within(zoneCard(ZONE)).getByRole('button', {
        name: /Report something here/i,
      }),
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText('What did you see?'),
      'Brown water and dead shellfish along the reef edge this morning.',
    )

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'redwater.jpg', {
      type: 'image/jpeg',
    })
    await user.upload(within(dialog).getByLabelText(/Take or choose a photo/i), file)

    expect(await within(dialog).findByText('redwater.jpg')).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Submit report' }))

    await waitFor(() => {
      expect(useAppStore.getState().reports).toHaveLength(1)
    })

    const photoUrl = useAppStore.getState().reports[0].photoUrl
    expect(photoUrl).toBeTruthy()
    expect(photoUrl!.startsWith('data:image/jpeg;base64,')).toBe(true)
  })
})

describe('live data announcement routing', () => {
  it('keeps one data channel per public/admin page, but none in the locked gate', async () => {
    const user = userEvent.setup()
    render(<App />)
    const channel = () => screen.getByRole('status', { name: 'Live coastal data' })
    await waitFor(() => expect(channel().textContent).toContain('7 zones watched'))
    expect(screen.getAllByRole('status', { name: 'Live coastal data' })).toHaveLength(1)

    await openMap(user)
    await waitFor(() => expect(channel().textContent).toContain('7 zones watched'))
    expect(screen.getAllByRole('status', { name: 'Live coastal data' })).toHaveLength(1)

    await user.click(screen.getByRole('link', { name: 'Admin' }))
    await screen.findByLabelText('Passcode')
    expect(screen.queryByRole('status', { name: 'Live coastal data' })).toBeNull()
    await user.type(screen.getByLabelText('Passcode'), PASSCODE)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(channel().textContent).toContain('0 total reports'))
    expect(screen.getAllByRole('status', { name: 'Live coastal data' })).toHaveLength(1)
  })
})
