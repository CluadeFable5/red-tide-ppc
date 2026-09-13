// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Waves } from './Waves'

/**
 * Proves the low-power paths in Waves actually fire:
 *  - reduced motion draws exactly one still frame and never touches rAF
 *  - the animated path caps itself at ~30 fps (skips rAF ticks under 33 ms)
 *  - the backing store never scales past DPR 1.5, even on DPR-3 phones
 */

let reduceMotion = false

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduceMotion }
})

interface FakeContext {
  clearRect: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  setTransform: ReturnType<typeof vi.fn>
  globalAlpha: number
  strokeStyle: string
  lineWidth: number
}

let ctx: FakeContext
let rafCallbacks: Array<(time: number) => void>

function makeContext(): FakeContext {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
  }
}

beforeEach(() => {
  reduceMotion = false
  ctx = makeContext()
  rafCallbacks = []

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      // Give the canvas a real CSS box so resize() has something to scale.
      Object.defineProperty(this, 'clientWidth', { value: 400, configurable: true })
      Object.defineProperty(this, 'clientHeight', { value: 800, configurable: true })
      return ctx as unknown as RenderingContext
    },
  )

  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Drive the rAF loop manually with the given timestamps. */
function pump(times: number[]): void {
  for (const time of times) {
    const queue = rafCallbacks
    rafCallbacks = []
    for (const cb of queue) cb(time)
  }
}

describe('Waves', () => {
  it('draws one still frame and schedules no animation under reduced motion', () => {
    reduceMotion = true
    render(<Waves />)

    // One still frame: one clear, one stroke per layer (2), no rAF at all.
    expect(ctx.clearRect).toHaveBeenCalledTimes(1)
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
    expect(rafCallbacks).toHaveLength(0)
  })

  it('animates with a ~30 fps cap: rAF ticks under 33 ms are skipped', () => {
    render(<Waves />)
    expect(rafCallbacks.length).toBeGreaterThan(0)

    // Tick as a 60 Hz display would: 0, 16.7, 33.4, 50, 66.7, 83.4, 100.
    pump([0, 16.7, 33.4, 50, 66.7, 83.4, 100])

    // Draws land at 0, 33.4, 66.7, 100 — four frames across seven ticks.
    expect(ctx.clearRect).toHaveBeenCalledTimes(4)
  })

  it('caps the backing store at DPR 1.5 on high-density phones', () => {
    vi.stubGlobal('devicePixelRatio', 3)
    const { container } = render(<Waves />)

    const canvas = container.querySelector('canvas')!
    expect(canvas.width).toBe(600) // 400 * 1.5, not 400 * 3
    expect(canvas.height).toBe(1200) // 800 * 1.5
  })
})
