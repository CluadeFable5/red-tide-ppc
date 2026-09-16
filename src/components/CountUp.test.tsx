// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CountUp } from './CountUp'

let reduced = false
vi.mock('motion/react', () => ({ useReducedMotion: () => reduced }))
afterEach(cleanup)

describe('CountUp accessible values', () => {
  it.each([false, true])('exposes the source value, not tween frames (reduced motion: %s)', (motion) => {
    reduced = motion
    const { container, rerender } = render(<CountUp to={100} prefix="$" suffix=" total" decimals={2} />)
    expect(container.querySelector('.sr-only')?.textContent).toBe('$100.00 total')
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(container.querySelector('[aria-live]')).toBeNull()
    rerender(<CountUp to={0} prefix="$" suffix=" total" decimals={2} />)
    expect(container.querySelector('.sr-only')?.textContent).toBe('$0.00 total')
  })
})
