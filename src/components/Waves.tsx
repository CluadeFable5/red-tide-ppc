import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Canvas wave background for the landing page (reactbits.dev "Waves" pattern,
 * MIT + Commons Clause — see `docs/design-references.md` §14).
 *
 * Two overlaid sine composites drift at different speeds and depths, amber at
 * low alpha — the water should read as *present*, not as an animation
 * demanding attention.
 *
 * TUNED FOR LOW-END PHONES
 * ------------------------
 * The landing is most often opened on exactly the devices that jank first,
 * so the ambient layer pays for itself: two layers (not three), a device
 * pixel ratio cap of 1.5 (ambient strokes do not need retina sharpness),
 * a coarser 6 px sampling step, and a ~30 fps frame cap — the drift is slow
 * enough that halving the frame rate is invisible and halves the CPU cost.
 *
 * It is an `aria-hidden` canvas: pure ambience, zero interaction.
 */

interface WaveLayer {
  /** Rest line, as a fraction of the canvas height. */
  base: number
  /** Primary amplitude, px. */
  amp: number
  /** Primary wavelength, px. */
  wavelength: number
  /** Angular speed, rad/s. Sign sets the direction. */
  speed: number
  /** Stroke alpha. */
  alpha: number
  color: string
  /** Phase offset so the layers do not start in step. */
  phase: number
}

const LAYERS: WaveLayer[] = [
  { base: 0.34, amp: 12, wavelength: 360, speed: 0.34, alpha: 0.14, color: '#f0a500', phase: 0.0 },
  { base: 0.56, amp: 22, wavelength: 600, speed: -0.21, alpha: 0.08, color: '#f0a500', phase: 2.1 },
]

/** Minimum ms between drawn frames — caps the loop at ~30 fps. */
const FRAME_INTERVAL_MS = 33

export function Waves({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    // Aliases so the nested render functions see non-null types (TS does not
    // carry the guard's narrowing into closures).
    const el: HTMLCanvasElement = canvas
    const g: CanvasRenderingContext2D = context

    let width = 0
    let height = 0
    let raf: number | undefined
    let running = false
    // -Infinity so the very first rAF tick draws immediately; the cap only
    // applies to subsequent frames.
    let lastFrame = -Infinity

    function resize(): void {
      // Cap the backing-store scale: at DPR 3 phones the old cap doubled the
      // pixel count the loop repaints every frame, for strokes nobody can
      // tell apart at 1.5×.
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5)
      width = el.clientWidth
      height = el.clientHeight
      el.width = Math.max(1, Math.round(width * dpr))
      el.height = Math.max(1, Math.round(height * dpr))
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function drawLayer(layer: WaveLayer, t: number): void {
      g.beginPath()
      for (let x = -6; x <= width + 6; x += 6) {
        const primary = Math.sin((x / layer.wavelength) * Math.PI * 2 + t * layer.speed + layer.phase)
        // A shorter, slower second harmonic keeps the crest from reading as
        // a metronome.
        const secondary =
          0.45 *
          Math.sin(
            (x / (layer.wavelength * 0.53)) * Math.PI * 2 - t * layer.speed * 1.7 + layer.phase * 2,
          )
        const y = layer.base * height + (primary + secondary) * layer.amp
        if (x === -6) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.globalAlpha = layer.alpha
      g.strokeStyle = layer.color
      g.lineWidth = 1
      g.stroke()
    }

    function frame(t: number): void {
      g.clearRect(0, 0, width, height)
      for (const layer of LAYERS) drawLayer(layer, t)
      g.globalAlpha = 1
    }

    function loop(now: number): void {
      raf = requestAnimationFrame(loop)
      // Frame cap: skip ticks that land sooner than ~33 ms after the last
      // drawn frame, so 90/120 Hz displays do not multiply the cost.
      if (now - lastFrame < FRAME_INTERVAL_MS) return
      lastFrame = now
      frame(now / 1000)
    }

    function start(): void {
      if (running || reduceMotion) return
      running = true
      raf = requestAnimationFrame(loop)
    }

    function stop(): void {
      running = false
      if (raf !== undefined) cancelAnimationFrame(raf)
    }

    function onVisibility(): void {
      if (document.hidden) stop()
      else start()
    }

    // ResizeObserver tracks the canvas' CSS box (it is `absolute inset-0`);
    // window resize covers viewport changes the observer might miss.
    function onResize(): void {
      resize()
      if (reduceMotion) frame(2.5)
    }

    resize()

    if (reduceMotion) {
      // One still frame: the motif is present, nothing moves.
      frame(2.5)
    } else {
      start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(onResize)
      observer.observe(el)
    }
    window.addEventListener('resize', onResize)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    }
  }, [reduceMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
    />
  )
}
