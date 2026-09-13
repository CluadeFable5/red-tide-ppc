// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DecryptedText } from './DecryptedText'

/**
 * The landing page is most often opened on low-end phones, where the two
 * reduced-cost paths matter most: the mobile viewport skip and the
 * reduced-motion skip. These tests pin both paths down — plus the fact that
 * the scramble still runs (and finishes) on a desktop viewport.
 */

let reduceMotion = false

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduceMotion }
})

/** Control what `(max-width: 640px)` reports. */
function setViewportMatches(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 640px)' ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  )
}

function overlayText(container: HTMLElement): string | null {
  return container.querySelector('span.absolute')?.textContent ?? null
}

beforeEach(() => {
  reduceMotion = false
  setViewportMatches(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('DecryptedText', () => {
  it('scrambles then resolves on a desktop viewport', () => {
    vi.useFakeTimers()
    const { container } = render(<DecryptedText text="RED TIDE" />)

    // Scrambled first: glyphs come from a set with no letters, so this can
    // never collide with the real text by luck.
    expect(overlayText(container)).not.toBe('RED TIDE')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(overlayText(container)).toBe('RED TIDE')
  })

  it('renders plain text immediately on a small viewport, with no scramble', () => {
    setViewportMatches(true)
    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    const { container } = render(<DecryptedText text="RED TIDE" />)

    // No scrambled first paint, and the skip path schedules no interval work.
    expect(overlayText(container)).toBe('RED TIDE')
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('renders plain text immediately under reduced motion', () => {
    reduceMotion = true
    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    const { container } = render(<DecryptedText text="RED TIDE" />)

    expect(overlayText(container)).toBe('RED TIDE')
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })
})
