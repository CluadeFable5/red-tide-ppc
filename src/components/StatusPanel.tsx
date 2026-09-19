import { useCallback } from 'react'
import { motion, useReducedMotion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { ZONE_STATUS_ORDER } from '../lib/status'
import {
  advisoryShare,
  formatPercent,
  tideBaselinePath,
  tideWavePath,
} from '../motion/readouts'
import { isDragTail } from '../motion/sheetAnchors'
import { useSidePanel } from '../motion/useSidePanel'
import { zoneLabel, zoneTheme } from '../styles/statusTheme'
import type { ZoneStatus } from '../types'
import { StatusPip } from './StatusPip'

/**
 * The status panel: count pills + advisory-signal gauge, as a collapsible
 * side drawer over the map.
 *
 * WHAT IT IS
 * ----------
 * The top-left chrome — the ADVISORY / UNCONFIRMED / SAFE count pills and the
 * "Advisory signal" card beneath them — used to sit fixed over the map,
 * permanently covering that corner on a phone. It is now one panel that tucks
 * left off-screen, leaving only a grab tab at the edge.
 *
 * States:
 *   open:      fully visible at the left edge (the resting position).
 *   collapsed: tucked off-screen left; only the 32px grab tab shows. Frees
 *     the map area underneath — the collapsed card captures no pointer
 *     events, so pan/zoom/tap-zones work where the panel used to sit.
 *
 * Animation:
 *   Same spring as the zone sheet (stiffness 420, damping 34, mass 0.85) for
 *   the snap, so the two gestures feel like one physics system. The panel
 *   follows the finger 1:1 mid-drag; on release, velocity is projected forward
 *   (0.2s) and a flick always lands in the direction it was thrown. For
 *   reduced-motion the panel jumps instantly (`offsetX.jump`).
 *
 * Drag surfaces (deliberately NOT the whole panel):
 *   - the grab tab — the primary surface, `touch-action: none`;
 *   - the pills row — small, already pointer-owning, and a natural swipe
 *     target; making it a drag surface turns an otherwise dead gesture into
 *     the collapse.
 *   The gauge card stays `pointer-events-none` — it is a read-only instrument
 *   (see `Ambient.tsx`), and map gestures pass through it today. Giving it a
 *   drag surface would newly swallow map pans starting on that 172px card,
 *   which would be a regression for map interaction, not a feature.
 *
 * Non-drag path (accessibility is load-bearing, not optional):
 *   - the grab tab is a real `<button>`: tap / Enter / Space toggles;
 *   - ArrowLeft collapses and ArrowRight expands when the tab is focused, so
 *     keyboard users get the same directional control as swipe users;
 *   - `aria-expanded` + `aria-controls` expose the state to assistive tech.
 *   - on desktop/non-touch there is no separate path to learn: the same tab
 *     is a click toggle and a mouse-drag handle. No swipe simulation.
 *
 * Chrome fade:
 *   Like the old floating chrome, the whole panel (tab included) fades out as
 *   the sheet rises — at mid/full the sheet is the readout and a floating tab
 *   would be a stray affordance. While faded, pills and tab also drop their
 *   pointer events, so the invisible chrome can never swallow a map gesture.
 */

export interface StatusPanelProps {
  counts: Record<ZoneStatus, number>
  advisory: number
  zones: number
  pending: number
  /** Driven by the sheet's progress; the panel fades, it does not shrink. */
  chromeOpacity: MotionValue<number>
}

const TAB_LABEL: Record<'open' | 'collapsed', string> = {
  open: 'Collapse status panel',
  collapsed: 'Expand status panel',
}

export function StatusPanel({
  counts,
  advisory,
  zones,
  pending,
  chromeOpacity,
}: StatusPanelProps) {
  const panel = useSidePanel('open')
  const reduceMotion = useReducedMotion()
  const open = panel.state === 'open'
  const tabLabel = TAB_LABEL[panel.state]

  // Interactive children re-enable pointer events only while the chrome is
  // actually visible — invisible chrome must never eat map gestures.
  const chromePointerEvents = useTransform(chromeOpacity, (value): string =>
    value < 0.1 ? 'none' : 'auto',
  )

  const handleTabClick = useCallback(
    (event: React.MouseEvent) => {
      if (isDragTail(panel.didDrag(), event.detail)) return
      panel.toggle()
    },
    [panel],
  )

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Enter/Space already toggle via the native button click; arrows give
      // keyboard users the same directional control swipe users have.
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        panel.goTo('collapsed')
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        panel.goTo('open')
      }
    },
    [panel],
  )

  return (
    <motion.div
      ref={panel.panelRef}
      style={{ x: panel.offsetX, opacity: chromeOpacity }}
      drag="x"
      dragListener={false}
      dragControls={panel.dragControls}
      dragConstraints={{ left: panel.offsets.collapsed, right: panel.offsets.open }}
      // Asymmetric elasticity: pulling right past open barely gives (open is
      // home), pulling left past collapsed gives a little — the tab straining
      // at the screen edge.
      dragElastic={{ left: 0.05, right: 0.02 }}
      dragMomentum={false}
      onDragStart={panel.onDragStart}
      onDragEnd={(_event, info) => panel.onDragEnd(info)}
      className="pointer-events-none absolute left-3 top-[4.5rem] z-[1010] mt-[env(safe-area-inset-top)]"
      role="region"
      aria-label="Zone status summary"
      data-testid="status-panel"
      data-state={panel.state}
      data-dragging={panel.dragging || undefined}
    >
      <div className="flex items-stretch gap-1.5">
        {/* --- Card body ------------------------------------------------- */}
        <div
          id="status-panel-body"
          className="flex min-w-0 max-w-[calc(100vw-4.5rem)] flex-col gap-4"
        >
          {/* Pills — also a drag surface (see module doc). */}
          <motion.div
            role="group"
            aria-label="Zone status key"
            style={{ pointerEvents: chromePointerEvents as unknown as 'auto' }}
            onPointerDown={panel.startDrag}
            className="flex select-none flex-wrap items-center gap-1.5 [touch-action:none]"
          >
            {ZONE_STATUS_ORDER.map((status) => (
              <StatusChip key={status} status={status} count={counts[status] ?? 0} />
            ))}
          </motion.div>

          {/* Gauge — a read-only instrument, pointer-transparent so the map
              beneath stays interactive (pan/zoom/tap zones). */}
          <AdvisoryGauge advisory={advisory} zones={zones} pending={pending} />
        </div>

        {/* --- Grab tab ----------------------------------------------------
            The vertical analogue of the sheet's handle: same pill-grabber
            language, rotated 90°. Always reachable — it is the 32px that
            stays on screen when collapsed (see SIDE_PANEL_TAB_VISIBLE). */}
        <motion.button
          type="button"
          style={{ pointerEvents: chromePointerEvents as unknown as 'auto' }}
          onPointerDown={panel.startDrag}
          onClick={handleTabClick}
          onKeyDown={handleTabKeyDown}
          aria-expanded={open}
          aria-controls="status-panel-body"
          aria-label={tabLabel}
          title={tabLabel}
          data-testid="status-panel-tab"
          className="flex w-8 shrink-0 select-none flex-col items-center justify-center gap-2 rounded-lg border border-line bg-ink-2/88 py-3 backdrop-blur-md transition-colors [touch-action:none] hover:border-accent/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <motion.svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-paper/70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
            animate={{ rotate: open ? 0 : 180 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 34 }
            }
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </motion.svg>
          <span
            aria-hidden="true"
            className="block h-8 w-1 rounded-full bg-line-soft"
          />
        </motion.button>
      </div>
    </motion.div>
  )
}

/**
 * One status count pill. Same chip as the old floating legend — moved into
 * the drawer unchanged, so the visual language is identical.
 */
function StatusChip({ status, count }: { status: ZoneStatus; count: number }) {
  const theme = zoneTheme(status)
  const label = zoneLabel(status)

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-2/88 py-1 pl-2 pr-2 backdrop-blur-md">
      {/* The pip pops whenever the count changes — a legend that only re-colours
          is a legend nobody notices going from 0 to 1. */}
      <StatusPip
        size="xs"
        hex={theme.hex}
        pulses={theme.pulses}
        glowClass={theme.glowClass}
        trigger={count}
      />
      <span className="font-display text-[11px] leading-none tracking-[0.03em] text-paper/85">
        {label}
      </span>
      <span
        className="font-mono text-[10px] leading-none tabular-nums"
        style={{ color: theme.hex }}
      >
        {count}
      </span>
    </span>
  )
}

/**
 * Advisory signal gauge. Same instrument as the old floating card — moved into
 * the drawer unchanged. It plots the share of zones under advisory: the
 * waveform collapses to a flat line when nothing is flagged and rises as the
 * share grows. Explicitly NOT a tide prediction.
 */
function AdvisoryGauge({
  advisory,
  zones,
  pending,
}: {
  advisory: number
  zones: number
  pending: number
}) {
  const share = advisoryShare(advisory, zones)
  const wave = tideWavePath({ scale: share })
  const baseline = tideBaselinePath()

  return (
    <div className="pointer-events-none w-[172px] rounded-lg border border-line bg-ink-2/85 p-2.5 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
          Advisory signal
        </span>
        <span className="font-mono text-[10px] leading-none tabular-nums text-accent">
          {formatPercent(share)}
        </span>
      </div>

      <svg
        viewBox="0 0 120 18"
        preserveAspectRatio="none"
        className="mt-1.5 block h-4 w-full overflow-hidden"
        aria-hidden="true"
      >
        <path
          d={baseline}
          stroke="var(--color-line)"
          strokeWidth="1"
          strokeDasharray="2 3"
          fill="none"
        />
        {/* Two tiles, drifted -50% on a loop: seamless because the wave is
            periodic. The trace is amber until something is actually flagged. */}
        <g className="animate-tide-drift" style={{ color: share > 0 ? 'var(--color-advisory)' : 'var(--color-line)' }}>
          <path d={wave} stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path
            d={wave}
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            transform="translate(120 0)"
          />
        </g>
      </svg>

      <p className="mt-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-muted">
        {advisory}/{zones} adv · {pending} pend
      </p>
    </div>
  )
}
