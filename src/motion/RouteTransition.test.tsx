// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteTransition } from './RouteTransition'

/**
 * RouteTransition's two contracts that do not need a real browser:
 *
 *   1. `prefers-reduced-motion` is an *instant swap*, not a gentler animation:
 *      the incoming frame must render already at rest — full opacity, no
 *      transform, nothing to interpolate.
 *   2. The pinned `location` keeps exactly one page mounted during a change
 *      (the regression that once duplicated the admin form and mounted two
 *      Leaflet maps). Whatever else the animation does, there is never more
 *      than one `[data-route-frame]` in the tree.
 *
 * The visual half of the animation (durations, mid-flight values, Leaflet
 * sizing) is verified in a real browser by scripts/route-transition-pass.mjs;
 * a jsdom run cannot produce frames honestly.
 */
let reduceMotion = false
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduceMotion }
})

function Harness() {
  return (
    <MemoryRouter initialEntries={['/a']}>
      <RouteTransition>
        <Route
          path="/a"
          element={
            <div>
              <Link to="/b">to b</Link>
              <h1>Page A</h1>
            </div>
          }
        />
        <Route path="/b" element={<h1>Page B</h1>} />
      </RouteTransition>
    </MemoryRouter>
  )
}

const frames = (el: ParentNode) => el.querySelectorAll('[data-route-frame]')

async function go(toB: () => void) {
  await act(async () => {
    toB()
  })
}

afterEach(() => {
  reduceMotion = false
})

describe('RouteTransition', () => {
  it('reduced motion: the incoming route renders already at rest', async () => {
    reduceMotion = true
    const { container } = render(<Harness />)
    expect(screen.getByRole('heading', { name: 'Page A' })).toBeTruthy()

    await go(() => screen.getByRole('link', { name: 'to b' }).click())

    expect(screen.getByRole('heading', { name: 'Page B' })).toBeTruthy()
    const frame = container.querySelector('[data-route-frame]') as HTMLElement
    const inline = frame.getAttribute('style') ?? ''
    // Instant means no intermediate state is ever written: full opacity and no
    // transform on the frame that now holds Page B.
    expect(inline).not.toContain('transform')
    expect(inline).toMatch(/opacity:\s*1(\.|;|$)/)
  })

  it('never mounts more than one page at a time while changing route', async () => {
    reduceMotion = false
    const { container } = render(<Harness />)
    expect(frames(container)).toHaveLength(1)

    await go(() => screen.getByRole('link', { name: 'to b' }).click())

    // Mid-exit the outgoing page is still the one on screen — and there is
    // still exactly one frame, never two.
    expect(frames(container)).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Page A' })).toBeTruthy()

    // Let the exit (120ms) and enter (300ms) actually run on jsdom's clock.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
    })

    // Once the handover is done: Page B is showing, and the mount count never
    // went above one.
    expect(frames(container)).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Page B' })).toBeTruthy()
  })
})
