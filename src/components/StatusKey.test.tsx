// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { motionValue } from 'motion/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ZoneStatus } from '../types'
import { StatusKey } from './StatusKey'

/**
 * The fixed pills row. This suite pins what the split guarantees: the key is
 * a plain, fixed, always-visible element — no drag surfaces, no transform,
 * no drawer state — sitting in its original top-left position.
 */

const COUNTS: Record<ZoneStatus, number> = {
  safe: 4,
  unconfirmed: 1,
  advisory: 1,
}

function renderKey() {
  const chromeOpacity = motionValue(1)
  render(<StatusKey counts={COUNTS} chromeOpacity={chromeOpacity} />)
  return { chromeOpacity }
}

function keyEl(): HTMLElement {
  return screen.getByTestId('status-key')
}

afterEach(() => {
  cleanup()
})

describe('StatusKey content', () => {
  it('renders every status label with its count', () => {
    renderKey()

    const key = screen.getByRole('group', { name: 'Zone status key' })
    expect(within(key).getByText('Advisory')).toBeTruthy()
    expect(within(key).getByText('Unconfirmed')).toBeTruthy()
    expect(within(key).getByText('Safe')).toBeTruthy()
    expect(within(key).getByText('4')).toBeTruthy() // safe count
    expect(within(key).getAllByText('1')).toHaveLength(2) // advisory + unconfirmed
  })
})

describe('StatusKey fixed positioning', () => {
  it('sits fixed top-left and never carries a transform or drawer state', () => {
    renderKey()
    const el = keyEl()

    // Original top-left position.
    expect(el.classList.contains('absolute')).toBe(true)
    expect(el.classList.contains('left-3')).toBe(true)
    expect(el.classList.contains('top-[4.5rem]')).toBe(true)

    // Fixed means fixed: no transform, no drawer state attributes, no tab.
    expect(el.style.transform).toBe('')
    expect(el.dataset.state).toBeUndefined()
    expect(el.dataset.dragging).toBeUndefined()
    expect(
      within(el).queryByRole('button', { name: /panel/i }),
    ).toBeNull()
  })

  it('never captures gestures outside its own chips', () => {
    renderKey()
    expect(keyEl().classList.contains('pointer-events-none')).toBe(true)
  })

  it('drops chip pointer events while the chrome is faded out', async () => {
    const { chromeOpacity } = renderKey()
    const key = screen.getByRole('group', { name: 'Zone status key' })

    await waitFor(() => {
      expect(key.style.pointerEvents).toBe('auto')
    })

    chromeOpacity.set(0)
    await waitFor(() => {
      expect(key.style.pointerEvents).toBe('none')
    })

    chromeOpacity.set(1)
    await waitFor(() => {
      expect(key.style.pointerEvents).toBe('auto')
    })
  })
})
