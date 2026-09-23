// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteTransition } from './RouteTransition'

/**
 * RouteTransition's contracts that do not need a real browser:
 *
 *   1. `/` ⇄ `/map` is a *dissolve*: the outgoing page is caught mid-fade and so
 *      is the incoming one — both halves really animate, rather than one page
 *      being replaced by the other.
 *   2. The lazy-load gate holds the incoming frame invisible until the route's
 *      promise resolves, and only then fades it in. Without that, the enter would
 *      fade in blank space (a Suspense fallback) and hard-cut to the page.
 *   3. `/admin` is an instant swap with no opacity interpolated in either
 *      direction, whichever side of the navigation it is on.
 *   4. `prefers-reduced-motion` is an *instant swap* too, not a gentler version
 *      of the same move: the incoming frame renders already at rest.
 *   5. Exactly one page is ever mounted — the regression that once rendered the
 *      admin form twice and mounted two Leaflet maps.
 *
 * jsdom has no Web Animations API, so motion drives these with its own rAF loop
 * and the inline style is the honest record of what was on screen. Durations,
 * mid-flight values and Leaflet sizing are verified in a real browser by
 * scripts/route-transition-pass.mjs; a jsdom run cannot produce frames honestly.
 */
let reduceMotion = false
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduceMotion }
})

/** The real dissolving pair, plus the route that must not dissolve. */
function Page({ name, links }: { name: string; links: [string, string][] }) {
  return (
    <>
      <h1>{name}</h1>
      {links.map(([label, to]) => (
        <Link key={to} to={to}>
          {label}
        </Link>
      ))}
    </>
  )
}

function Harness({
  prepare,
  initial = '/',
}: {
  prepare?: Record<string, () => Promise<unknown>>
  initial?: string
} = {}) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <RouteTransition prepare={prepare}>
        <Route
          path="/"
          element={
            <Page
              name="Landing"
              links={[
                ['to map', '/map'],
                ['to admin', '/admin'],
              ]}
            />
          }
        />
        <Route
          path="/map"
          element={
            <Page
              name="Map"
              links={[
                ['to landing', '/'],
                ['to admin', '/admin'],
              ]}
            />
          }
        />
        <Route path="/admin" element={<Page name="Admin" links={[['to map', '/map']]} />} />
      </RouteTransition>
    </MemoryRouter>
  )
}

type Seen = { page: string | null; opacity: number }

/**
 * Watch the route frames on every animation frame for as long as the navigation
 * takes. `page` comes from what the frame contains, so every opacity can be
 * attributed to the page it belongs to — a fade-out and a fade-in are otherwise
 * indistinguishable samples of "something at 0.5".
 */
function watch() {
  const samples: Seen[][] = []
  let live = true
  const tick = () => {
    samples.push(
      [...document.querySelectorAll<HTMLElement>('[data-route-frame]')].map((frame) => {
        const inline = frame.style.opacity
        return {
          page: frame.querySelector('h1')?.textContent ?? null,
          opacity: inline === '' ? 1 : Number(inline),
        }
      }),
    )
    if (live) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return {
    stop: () => {
      live = false
    },
    /** Samples caught strictly between invisible and fully visible. */
    partial: (page?: string) =>
      samples
        .flat()
        .filter(
          (s) => (page === undefined || s.page === page) && s.opacity > 0.02 && s.opacity < 0.98,
        ),
    maxFrames: () => samples.reduce((max, s) => Math.max(max, s.length), 0),
  }
}

/** The frame holding `page`, whatever its opacity. */
function frameOf(page: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[data-route-frame]')].find(
    (frame) => frame.querySelector('h1')?.textContent === page,
  )
}

async function click(name: string) {
  await act(async () => {
    screen.getByRole('link', { name }).click()
  })
}

/**
 * Let jsdom's clock run so motion's rAF-driven animations actually advance.
 *
 * In chunks, each in its own `act` scope. A single long scope buffers the React
 * updates that motion's animation callbacks make — AnimatePresence committing
 * the incoming route once the exit finishes, the load gate resolving — until the
 * scope ends, so a two-stage transition reads as a stall. Real browsers have no
 * such hold-up, and the browser pass measures the un-chunked reality.
 */
async function settle(ms = 1300, step = 70) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, step))
    })
  }
}

afterEach(() => {
  reduceMotion = false
})

describe('RouteTransition', () => {
  it('dissolves / → /map: the landing page fades out and the map fades in', async () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: 'Landing' })).toBeTruthy()

    const seen = watch()
    await click('to map')
    await settle()
    seen.stop()

    expect(screen.getByRole('heading', { name: 'Map' })).toBeTruthy()
    // Both halves of the dissolve, each attributed to its own page: the landing
    // frame was caught on its way out, the map frame on its way in.
    expect(seen.partial('Landing').length).toBeGreaterThan(0)
    expect(seen.partial('Map').length).toBeGreaterThan(0)
    // …and the arrival is complete, not left mid-fade.
    expect(Number(frameOf('Map')?.style.opacity)).toBe(1)
    expect(seen.maxFrames()).toBe(1)
  })

  it('dissolves back: /map → / runs the same fade in reverse', async () => {
    render(<Harness initial="/map" />)
    expect(screen.getByRole('heading', { name: 'Map' })).toBeTruthy()

    const seen = watch()
    await click('to landing')
    await settle()
    seen.stop()

    // Nothing bespoke about "going back": it is the same pair the other way
    // round, which is why the browser's back button gets the animation for free.
    expect(screen.getByRole('heading', { name: 'Landing' })).toBeTruthy()
    expect(seen.partial('Map').length).toBeGreaterThan(0)
    expect(seen.partial('Landing').length).toBeGreaterThan(0)
    expect(seen.maxFrames()).toBe(1)
  })

  it('holds the incoming page invisible until its route has finished loading', async () => {
    let release: () => void = () => {}
    const loading = new Promise<void>((resolve) => {
      release = resolve
    })
    render(<Harness prepare={{ '/map': () => loading }} />)

    const seen = watch()
    await click('to map')
    // Long enough that an ungated enter (400ms) would be most of the way in, and
    // that the exit (350ms) has certainly finished.
    await settle(500)

    // The map page is rendered by now — it is simply not being shown yet. That
    // is the difference between holding dark and fading over a blank fallback.
    expect(screen.getByRole('heading', { name: 'Map' })).toBeTruthy()
    expect(frameOf('Map')?.style.opacity).toBe('0')
    expect(seen.partial('Map')).toHaveLength(0)

    await act(async () => {
      release()
    })
    await settle(900)
    seen.stop()

    // The gate resolved → the enter ran, and it ran over a rendered page.
    expect(seen.partial('Map').length).toBeGreaterThan(0)
    expect(Number(frameOf('Map')?.style.opacity)).toBe(1)
  })

  it('swaps /admin instantly, and takes the page it is leaving with it', async () => {
    render(<Harness />)

    const leaving = watch()
    await click('to admin')
    await settle()
    leaving.stop()

    expect(screen.getByRole('heading', { name: 'Admin' })).toBeTruthy()
    // Neither half animated: the landing page never dimmed on its way out, and
    // the admin page never faded in.
    expect(leaving.partial()).toHaveLength(0)
    expect(Number(frameOf('Admin')?.style.opacity)).toBe(1)

    const arriving = watch()
    await click('to map')
    await settle()
    arriving.stop()

    // And the same when admin is the page being *left*: the map must not fade in
    // behind it, or the instant admin swap would still cost a transition.
    expect(screen.getByRole('heading', { name: 'Map' })).toBeTruthy()
    expect(arriving.partial()).toHaveLength(0)
    expect(Number(frameOf('Map')?.style.opacity)).toBe(1)
  })

  it('reduced motion: the incoming route renders already at rest', async () => {
    reduceMotion = true
    const { container } = render(<Harness />)
    expect(screen.getByRole('heading', { name: 'Landing' })).toBeTruthy()

    const seen = watch()
    await click('to map')
    await settle()
    seen.stop()

    expect(screen.getByRole('heading', { name: 'Map' })).toBeTruthy()
    const frame = container.querySelector('[data-route-frame]') as HTMLElement
    const inline = frame.getAttribute('style') ?? ''
    // Instant means no intermediate state is ever written: full opacity and no
    // transform on the frame that now holds the map, and nothing ever caught
    // mid-fade.
    expect(inline).not.toContain('transform')
    expect(inline).toMatch(/opacity:\s*1(\.|;|$)/)
    expect(seen.partial()).toHaveLength(0)
  })

  it('never mounts more than one page at a time while changing route', async () => {
    const { container } = render(<Harness />)
    expect(container.querySelectorAll('[data-route-frame]')).toHaveLength(1)

    const seen = watch()
    await click('to map')

    // Mid-exit the outgoing page is still the one on screen — and there is still
    // exactly one frame, never two.
    expect(container.querySelectorAll('[data-route-frame]')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Landing' })).toBeTruthy()

    await settle()
    seen.stop()

    // Once the handover is done: the map is showing, and the mount count never
    // went above one at any point during the change.
    expect(screen.getByRole('heading', { name: 'Map' })).toBeTruthy()
    expect(container.querySelectorAll('[data-route-frame]')).toHaveLength(1)
    expect(seen.maxFrames()).toBe(1)
  })
})
