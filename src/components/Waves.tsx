import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Canvas wave background for the landing page (reactbits.dev "Waves" pattern,
 * MIT + Commons Clause — see `docs/design-references.md` §14).
 *
 * Three overlaid sine composites drift at different speeds and depths. The
 * palette is the app's own: amber, with one advisory-red trace far behind it,
 * all at low alpha — the water should read as *present*, not as an animation
 * demanding attention (the same restraint rule as the map's tide scan).
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
  { base: 0.34, amp: 12, wavelength: 360, speed: 0.34, alpha: 0.16, color: '#f0a500', phase: 0.0 },
  { base: 0.52, amp: 20, wavelength: 540, speed: -0.21, alpha: 0.1, color: '#f0a500', phase: 2.1 },
  { base: 0.72, amp: 30, wavelength: 780, speed: 0.13, alpha: 0.06, color: '#ff5252', phase: 4.2 },
]

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

    function resize(): void {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
      width = el.clientWidth
      height = el.clientHeight
      el.width = Math.max(1, Math.round(width * dpr))
      el.height = Math.max(1, Math.round(height * dpr))
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function drawLayer(layer: WaveLayer, t: number): void {
      g.beginPath()
      for (let x = -6; x <= width + 6; x += 4) {
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

    function loop(): void {
      frame(performance.now() / 1000)
      raf = requestAnimationFrame(loop)
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
