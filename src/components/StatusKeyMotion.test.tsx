// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ZoneStatus } from '../types'
import { StatusKey } from './StatusKey'

/**
 * Phase-2 pill-row motion wiring: the shared layoutId indicator lives in
 * exactly one chip (the active status), and the counts tick through CountUp
 * instead of cutting. The slide itself is measured in the real-browser pass;
 * here we pin the DOM contract.
 */

const COUNTS: Record<ZoneStatus, number> = {
  safe: 4,
  unconfirmed: 1,
  advisory: 1,
}

afterEach(() => {
  cleanup()
})

function chipFor(container: HTMLElement, status: ZoneStatus): HTMLElement {
  const chip = container.querySelector(`[data-status="${status}"]`)
  expect(chip).toBeTruthy()
  return chip as HTMLElement
}

describe('shared active indicator', () => {
  it('rests on the worst non-zero status by default', () => {
    const { container } = render(<StatusKey counts={COUNTS} />)
    expect(chipFor(container, 'advisory').querySelector('[data-testid="status-key-indicator"]')).toBeTruthy()
    expect(chipFor(container, 'safe').querySelector('[data-testid="status-key-indicator"]')).toBeNull()
    expect(chipFor(container, 'unconfirmed').querySelector('[data-testid="status-key-indicator"]')).toBeNull()
  })

  it('moves to the selected zone status and stays singular', async () => {
    const { container, rerender } = render(
      <StatusKey counts={COUNTS} activeStatus="advisory" />,
    )
    rerender(<StatusKey counts={COUNTS} activeStatus="safe" />)

    await waitFor(() => {
      expect(
        chipFor(container, 'safe').querySelector('[data-testid="status-key-indicator"]'),
      ).toBeTruthy()
    })
    // Exactly ONE indicator in the whole row — it is a shared element.
    expect(
      container.querySelectorAll('[data-testid="status-key-indicator"]'),
    ).toHaveLength(1)
  })
})

describe('ticking counts', () => {
  it('animates through intermediate values when a count changes', async () => {
    const { container, rerender } = render(
      <StatusKey counts={{ ...COUNTS, safe: 4 }} activeStatus="advisory" />,
    )
    // Scoped to the count container — the StatusPip wrapper is aria-hidden
    // too and comes first in the chip.
    const shown = () =>
      chipFor(container, 'safe').querySelector('.font-mono span[aria-hidden="true"]')
        ?.textContent ?? ''

    rerender(<StatusKey counts={{ ...COUNTS, safe: 7 }} activeStatus="advisory" />)

    const seen = new Set<string>()
    const deadline = Date.now() + 1500
    while (Date.now() < deadline) {
      seen.add(shown())
      if (seen.has('7')) break
      await new Promise((resolve) => setTimeout(resolve, 40))
    }

    // Landed on the target...
    await waitFor(() => expect(shown()).toBe('7'))
    // ...and the tween passed through at least one intermediate integer,
    // i.e. it ticked rather than cut.
    const intermediates = [...seen].filter((v) => v !== '4' && v !== '7')
    expect(intermediates.length).toBeGreaterThan(0)
  })

  it('shows the source value to assistive tech immediately', () => {
    const { container } = render(
      <StatusKey counts={{ ...COUNTS, safe: 9 }} activeStatus="advisory" />,
    )
    expect(
      chipFor(container, 'safe').querySelector('.sr-only')?.textContent,
    ).toBe('9')
  })
})
