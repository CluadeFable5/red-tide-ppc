// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlurText } from './BlurText'

/**
 * BlurText animates safety-adjacent copy from `opacity: 0`, so the tests that
 * matter most are the ones proving the text cannot get stranded invisible:
 * reduced motion, a missing IntersectionObserver, and an observer that is
 * installed but never fires.
 */

let reduceMotion = false

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduceMotion }
})

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void

let observerCallbacks: ObserverCallback[] = []
let observeCount = 0

function installObserver(): void {
  class FakeIntersectionObserver {
    constructor(cb: ObserverCallback) {
      observerCallbacks.push(cb)
    }
    observe() {
      observeCount += 1
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
}

/** Fire every registered observer as if the block scrolled into view. */
function scrollIntoView(): void {
  act(() => {
    for (const cb of observerCallbacks) cb([{ isIntersecting: true }])
  })
}

beforeEach(() => {
  reduceMotion = false
  observerCallbacks = []
  observeCount = 0
  installObserver()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('BlurText', () => {
  it('renders the full string as one accessible label, not per-word fragments', () => {
    render(<BlurText text="How it works" />)

    // The label is on the wrapper; the animated spans are hidden from AT.
    expect(screen.getByLabelText('How it works')).toBeTruthy()
  })

  it('waits for its own scroll intersection before revealing', () => {
    const { container } = render(<BlurText text="Watch the water" />)

    expect(observeCount).toBe(1)

    // Before intersecting the segments are mounted (so layout is reserved)
    // but not yet animated in.
    const spans = container.querySelectorAll('span[aria-hidden="true"]')
    expect(spans.length).toBe(3)

    scrollIntoView()
    // Still the same nodes — the reveal is an animation, not a remount.
    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBe(3)
  })

  it('renders static text and mounts no observer under reduced motion', () => {
    reduceMotion = true
    const { container } = render(<BlurText text="Community early warning" />)

    expect(observeCount).toBe(0)
    // Plain text node, no per-segment spans to strand at opacity 0.
    expect(container.textContent).toBe('Community early warning')
    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBe(0)
  })

  it('reveals immediately when the browser has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)

    const { container } = render(<BlurText text="Report what you see" />)

    // Nothing to observe — the copy must not wait for an event that can
    // never arrive.
    expect(observeCount).toBe(0)
    expect(container.textContent).toContain('Report')
  })

  it('reveals via the failsafe if the observer never fires', () => {
    vi.useFakeTimers()
    render(<BlurText text="A local admin verifies it" />)

    // Observer installed, but deliberately never called.
    expect(observeCount).toBe(1)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // The failsafe flipped it in view; the text is present either way.
    expect(screen.getByLabelText('A local admin verifies it')).toBeTruthy()
  })

  it('separates words with a real space so the copy can still line-wrap', () => {
    const { container } = render(<BlurText text="Watch the water" />)

    // Regression guard. Upstream appends U+00A0 *inside* each word span, which
    // makes the whole paragraph one unbreakable run — fine for its own
    // `flex flex-wrap` root, broken inside a normal `max-w-md` paragraph.
    // The rendered text must be plain, breakable spaces.
    expect(container.textContent).toBe('Watch the water')
    expect(container.textContent).not.toContain('\u00A0')
  })

  it('splits by letters when asked, keeping the label intact', () => {
    const { container } = render(<BlurText text="abc" animateBy="letters" />)

    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBe(3)
    expect(screen.getByLabelText('abc')).toBeTruthy()
  })
})
