// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MorphChevronIcon } from './MorphChevron'

/**
 * The chevron is a geometry morph: the `d` attribute itself changes between
 * two same-structure paths (M/L/L), which is what lets the real-browser pass
 * sample an in-between shape mid-morph. Here we pin the endpoints.
 */

const COLLAPSED_D = 'M 15 6 L 9 12 L 15 18'
const OPEN_D = 'M 9 6 L 15 12 L 9 18'

afterEach(() => cleanup())

function chevronPath(container: HTMLElement): SVGPathElement {
  const path = container.querySelector('[data-testid="morph-chevron"]')
  expect(path).toBeTruthy()
  return path as SVGPathElement
}

describe('MorphChevron geometry', () => {
  it('renders the leftward chevron when collapsed', async () => {
    const { container } = render(<MorphChevronIcon open={false} />)
    await waitFor(() => {
      expect(chevronPath(container).getAttribute('d')).toBe(COLLAPSED_D)
    })
  })

  it('morphs to the rightward chevron when open', async () => {
    const { container, rerender } = render(<MorphChevronIcon open={false} />)
    await waitFor(() => {
      expect(chevronPath(container).getAttribute('d')).toBe(COLLAPSED_D)
    })

    rerender(<MorphChevronIcon open />)
    await waitFor(
      () => {
        expect(chevronPath(container).getAttribute('d')).toBe(OPEN_D)
      },
      { timeout: 2000 },
    )
  })

  it('exposes its state for assistive tooling and verification', () => {
    const { container } = render(<MorphChevronIcon open />)
    expect(chevronPath(container).getAttribute('data-state')).toBe('open')
  })
})
