// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeroBackdrop } from './HeroBackdrop'

/**
 * The WebGL hero is a signed-off exception to this project's "no WebGL"
 * constraint, and the sign-off was conditional on the mitigations. These tests
 * pin the two that are load-bearing and easy to regress:
 *
 *  - under `prefers-reduced-motion` the lazy chunk is never even imported, so
 *    no GL context can exist;
 *  - the static gradient is always painted, so the hero is never a black hole.
 *
 * The pause-on-scroll / pause-on-hidden behaviour is driven by props into the
 * lazy child, which jsdom cannot render (no WebGL), so it is verified by the
 * import-count assertions here plus manual browser checks (§15).
 */

let reduceMotion = false

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduceMotion }
})

// Count imports of the WebGL module without ever evaluating `ogl`.
const ferrofluidImports = vi.hoisted(() => ({ count: 0 }))

vi.mock('./ferrofluid/Ferrofluid', () => {
  ferrofluidImports.count += 1
  return { default: () => <div data-testid="ferrofluid-canvas" /> }
})

beforeEach(() => {
  reduceMotion = false
  ferrofluidImports.count = 0

  // Drive the idle gate synchronously.
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
    cb()
    return 1
  })
  vi.stubGlobal('cancelIdleCallback', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function installObserver(intersecting: boolean): void {
  class FakeIntersectionObserver {
    constructor(private cb: (entries: Array<{ isIntersecting: boolean }>) => void) {}
    observe() {
      this.cb([{ isIntersecting: intersecting }])
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
}

describe('HeroBackdrop', () => {
  it('mounts no WebGL at all under prefers-reduced-motion', async () => {
    reduceMotion = true
    installObserver(true)

    render(<HeroBackdrop />)
    // Flush any pending lazy resolution.
    await act(async () => {})

    // The decisive assertion: the module was never imported, so `ogl` is never
    // fetched and no GL context is ever created.
    expect(ferrofluidImports.count).toBe(0)
    expect(screen.queryByTestId('ferrofluid-canvas')).toBeNull()

    // The static gradient stands in for it.
    expect(screen.getByTestId('hero-static-backdrop')).toBeTruthy()
  })

  it('always paints the static gradient, canvas or not', async () => {
    installObserver(true)
    render(<HeroBackdrop />)
    await act(async () => {})

    expect(screen.getByTestId('hero-static-backdrop')).toBeTruthy()
  })

  it('does not import the WebGL chunk while the hero is off screen', async () => {
    installObserver(false)

    render(<HeroBackdrop />)
    await act(async () => {})

    // Scrolled past before idle — the visitor never pays for the shader.
    expect(ferrofluidImports.count).toBe(0)
    expect(screen.queryByTestId('ferrofluid-canvas')).toBeNull()
  })

  it('mounts the canvas once the hero is visible and the browser is idle', async () => {
    installObserver(true)

    render(<HeroBackdrop />)
    await act(async () => {})

    expect(await screen.findByTestId('ferrofluid-canvas')).toBeTruthy()
  })
})
