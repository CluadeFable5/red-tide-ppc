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
/** Rest amber (`#f0a500`) → redder amber (`#e27036`, hsl ~20) while an advisory is up. */
const TINT_MS = 1500
const REST_RGB = [0xf0, 0xa5, 0x00] as const
const ADVISORY_RGB = [0xe2, 0x70, 0x36] as const

function tintedStroke(mix: number): string {
  const r = Math.round(REST_RGB[0] + (ADVISORY_RGB[0] - REST_RGB[0]) * mix)
  const g = Math.round(REST_RGB[1] + (ADVISORY_RGB[1] - REST_RGB[1]) * mix)
  const b = Math.round(REST_RGB[2] + (ADVISORY_RGB[2] - REST_RGB[2]) * mix)
  return `rgb(${r}, ${g}, ${b})`
}

export function Waves({
  className = '',
  advisoryActive = false,
}: {
  className?: string
  /**
   * True once zones are ready and at least one is advisory. Read from a ref
   * inside the draw loop — it must not be an effect dependency, or the loop
   * restarts and the stroke/rAF counts change.
   */
  advisoryActive?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduceMotion = useReducedMotion()
  const advisoryRef = useRef(advisoryActive)
  advisoryRef.current = advisoryActive
  const stillFrameRef = useRef<(() => void) | null>(null)
  const paintedAdvisoryRef = useRef(advisoryActive)

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

    // 0 = rest amber, 1 = advisory amber. Starts at rest so a flag that is
    // already set still eases across 1.5s inside this loop. Reduced motion
    // snaps in strokeColor and never uses this clock.
    let mix = 0
    let mixFrom = 0
    let mixTo = 0
    let shiftStart = 0

    function strokeColor(tSeconds: number): string {
      const target = advisoryRef.current ? 1 : 0
      if (reduceMotion) {
        mix = target
        mixTo = target
        return tintedStroke(mix)
      }
      if (target !== mixTo) {
        mixFrom = mix
        mixTo = target
        shiftStart = tSeconds
      }
      if (mix !== mixTo) {
        const elapsed = Math.min(1, (tSeconds - shiftStart) / (TINT_MS / 1000))
        const eased = 1 - (1 - elapsed) ** 3
        mix = mixFrom + (mixTo - mixFrom) * eased
      }
      return tintedStroke(mix)
    }

    function drawLayer(layer: WaveLayer, t: number, color: string): void {
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
      g.strokeStyle = color
      g.lineWidth = 1
      g.stroke()
    }

    function frame(t: number): void {
      const color = strokeColor(t)
      g.clearRect(0, 0, width, height)
      for (const layer of LAYERS) drawLayer(layer, t, color)
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

    // Reduced motion redraws this one frame when the advisory flag flips.
    // The mount draw below is the only paint on first commit — this ref
    // must not be called again from the same mount.
    stillFrameRef.current = () => frame(2.5)

    if (reduceMotion) {
      // One still frame: the motif is present, nothing moves. The tint is
      // already the target colour (strokeColor snaps under reduced motion).
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
      stillFrameRef.current = null
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    }
    // advisoryActive is intentionally absent: putting it here restarts the
    // loop and breaks the stroke / rAF counts.
  }, [reduceMotion])

  // Instant tint when the flag changes under reduced motion. The mount frame
  // already painted the current value, so this does not draw on first commit.
  useEffect(() => {
    if (!reduceMotion) return
    if (paintedAdvisoryRef.current === advisoryActive) return
    paintedAdvisoryRef.current = advisoryActive
    stillFrameRef.current?.()
  }, [advisoryActive, reduceMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
    />
  )
}
