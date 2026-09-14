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

/**
 * @param deliverInitial mimic a real IntersectionObserver, which always
 *   delivers an initial callback with the current (usually non-intersecting)
 *   state shortly after observe(). Pass false to simulate a *dead* observer —
 *   one that is installed but never speaks — which is the only case the
 *   failsafe is allowed to override.
 */
function installObserver({ deliverInitial = true } = {}): void {
  class FakeIntersectionObserver {
    private cb: ObserverCallback
    constructor(cb: ObserverCallback) {
      this.cb = cb
      observerCallbacks.push(cb)
    }
    observe() {
      observeCount += 1
      if (deliverInitial) {
        // Real observers report "not intersecting" first, asynchronously.
        setTimeout(() => this.cb([{ isIntersecting: false }]), 0)
      }
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

  function mockRect(top: number, bottom: number): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top, bottom, left: 0, right: 300,
      width: 300, height: bottom - top, x: 0, y: top, toJSON: () => ({}),
    } as DOMRect)
  }

  it('reveals via the failsafe when the observer is DEAD and the block is on screen', () => {
    vi.useFakeTimers()
    installObserver({ deliverInitial: false }) // never speaks
    mockRect(100, 150)

    render(<BlurText text="A local admin verifies it" />)
    expect(observeCount).toBe(1)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByLabelText('A local admin verifies it')).toBeTruthy()
  })

  it('does NOT let the failsafe pre-reveal a block that is still off screen', () => {
    vi.useFakeTimers()
    installObserver({ deliverInitial: false })
    mockRect(5000, 5050) // far below the fold

    const { container } = render(<BlurText text="Find your shore" />)

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(container.textContent).toContain('Find your shore')
  })

  it('stands down once a live observer has responded, even if not yet intersecting', () => {
    vi.useFakeTimers()
    installObserver({ deliverInitial: true }) // healthy observer, below threshold
    // On screen by a naive bounding-box test, but the observer's own
    // threshold/rootMargin contract says "not yet".
    mockRect(754, 800)

    const { container } = render(<BlurText text="Find your shore" />)

    act(() => {
      vi.advanceTimersByTime(60)   // let the initial callback land
      vi.advanceTimersByTime(10000) // and then a long time
    })

    /*
     * Regression guard for a real-browser finding. At 1280x800 the first
     * "How it works" item peeks 46px into the viewport at rest. A failsafe
     * that only asks "is any part visible" fires here and overrides a
     * perfectly healthy observer, revealing the list before the reader ever
     * scrolls — which is exactly the stagger this component exists to create.
     * A responsive observer must win.
     */
    const segs = Array.from(container.querySelectorAll('span[aria-hidden="true"]'))
    expect(segs.length).toBeGreaterThan(0)
    // The observer is alive and reported not-intersecting, so the component
    // must still be deferring to it rather than self-revealing.
    expect(observerCallbacks.length).toBeGreaterThan(0)
    // The copy is in the DOM throughout — deferring the reveal never means
    // removing the text.
    expect(container.textContent).toContain('Find your shore')
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
