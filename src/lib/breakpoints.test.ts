// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBelowSm, smBreakpoint, smBreakpointPx } from './breakpoints'

/**
 * The point of this module is that there is exactly ONE number, living in
 * `index.css`, and JavaScript reads it rather than restating it. These tests
 * pin that property — especially the drift scenario the refactor exists to
 * prevent: if the stylesheet's breakpoint changes, the JS gate must follow
 * without anyone editing a `.ts` file.
 */

/** Put a `--bp-sm` value on :root, the way the compiled stylesheet does. */
function setToken(value: string | null): void {
  if (value === null) document.documentElement.style.removeProperty('--bp-sm')
  else document.documentElement.style.setProperty('--bp-sm', value)
}

/** Set the root font size, so rem resolution is testable. */
function setRootFontSize(px: string): void {
  document.documentElement.style.fontSize = px
}

beforeEach(() => {
  setToken(null)
  document.documentElement.style.removeProperty('font-size')
})

afterEach(() => {
  vi.unstubAllGlobals()
  setToken(null)
  document.documentElement.style.removeProperty('font-size')
})

describe('breakpoints', () => {
  it('reads the sm breakpoint from the --bp-sm custom property', () => {
    setToken('40rem')
    expect(smBreakpoint()).toBe('40rem')
  })

  it('follows the stylesheet when the breakpoint changes — no JS edit needed', () => {
    // The whole reason this module exists. Retune the theme, and the value the
    // JS gate uses moves with it.
    setToken('48rem')
    expect(smBreakpoint()).toBe('48rem')
    expect(smBreakpointPx()).toBe(768) // 48 * 16
  })

  it('falls back to 40rem when no stylesheet has applied', () => {
    setToken(null)
    // jsdom applies no CSS; the fallback must match what index.css declares.
    expect(smBreakpoint()).toBe('40rem')
    expect(smBreakpointPx()).toBe(640)
  })

  it('resolves rem against the ROOT font size, not a hard-coded 16', () => {
    setToken('40rem')
    // A user who bumps their browser's default font size to 20px: 40rem is now
    // 800px, not 640px. This is precisely the case a hard-coded `640` got
    // wrong, and why the old check only agreed with the layout by coincidence.
    setRootFontSize('20px')
    expect(smBreakpointPx()).toBe(800)
  })

  it('handles a px-valued token too', () => {
    setToken('640px')
    expect(smBreakpointPx()).toBe(640)
  })

  describe('isBelowSm', () => {
    /** matchMedia fake that actually evaluates min-width against a width. */
    function stubMatchMedia(viewportPx: number): void {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => {
          const m = /min-width:\s*([\d.]+)(rem|px)/.exec(query)
          let matches = false
          if (m) {
            const n = Number.parseFloat(m[1])
            const px = m[2] === 'rem' ? n * 16 : n
            const atLeast = viewportPx >= px
            matches = /^not all and/.test(query) ? !atLeast : atLeast
          }
          return {
            matches,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            onchange: null,
            dispatchEvent: vi.fn(),
          }
        }),
      )
    }

    it('is true below the breakpoint', () => {
      setToken('40rem')
      stubMatchMedia(375)
      expect(isBelowSm()).toBe(true)
    })

    it('is false at and above the breakpoint', () => {
      setToken('40rem')
      stubMatchMedia(640)
      expect(isBelowSm()).toBe(false)

      stubMatchMedia(1280)
      expect(isBelowSm()).toBe(false)
    })

    it('matches Tailwind exactly at the boundary: sm applies at >= 640', () => {
      setToken('40rem')
      // Tailwind's `sm:` is `(width >= 40rem)`, so 639 is below and 640 is not.
      stubMatchMedia(639)
      expect(isBelowSm()).toBe(true)
      stubMatchMedia(640)
      expect(isBelowSm()).toBe(false)
    })

    it('falls back to measuring innerWidth when matchMedia is unavailable', () => {
      setToken('40rem')
      vi.stubGlobal('matchMedia', undefined)
      vi.stubGlobal('innerWidth', 375)
      expect(isBelowSm()).toBe(true)

      vi.stubGlobal('innerWidth', 1024)
      expect(isBelowSm()).toBe(false)
    })
  })
})
