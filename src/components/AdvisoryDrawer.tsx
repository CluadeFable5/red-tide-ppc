import { useCallback, useEffect, useRef } from 'react'
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import type { MotionValue } from 'motion/react'
import {
  advisoryShare,
  formatPercent,
  tideBaselinePath,
  tideWavePath,
} from '../motion/readouts'
import { isDragTail } from '../motion/sheetAnchors'
import { drawerWindowWidth } from '../motion/sidePanelAnchors'
import { useSidePanel } from '../motion/useSidePanel'

/**
 * The advisory-signal gauge card as a collapsible side drawer.
 *
 * WHAT IT IS
 * ----------
 * The "Advisory signal" card (the 0% gauge + 0/6 ADV · 0 PEND readout) sits
 * top-left under the fixed status key. On a phone it permanently covers that
 * corner of the map, so it tucks away left, leaving only a grab tab.
 *
 * This is the drawer half of the split from the old merged `StatusPanel`,
 * which incorrectly swept the pills row into the swipeable panel and shipped
 * a rendering bug: content visibly bleeding outside the panel bounds during
 * partial-open states. The pills row now lives in `StatusKey.tsx` — fixed,
 * never in this subtree — and this drawer is built so that bug class cannot
 * recur:
 *
 * CLIP ARCHITECTURE (why content can never bleed)
 * -----------------------------------------------
 * The old panel translated the whole `[card + tab]` row rigidly and relied
 * on the *viewport edge* to clip it mid-drag, with translucent blurred cards
 * inside the translated subtree. `backdrop-filter` inside a transformed
 * ancestor is a known-bad combination on mobile GPUs: the blurred backdrop
 * layer can detach from its element mid-gesture while the text keeps
 * painting — floating disconnected text outside the visible card.
 *
 * This drawer clips structurally instead:
 *
 *   1. The card track slides inside a dedicated clip window
 *      (`overflow-hidden`) whose width is derived from the SAME motion value
 *      as the track's position. At `open` the window fits the whole card, at
 *      `collapsed` it is 0, and mid-drag it is exactly the visible
 *      remainder — the card is continuously clipped by the window at every
 *      drag position, and the viewport edge is never load-bearing.
 *   2. Nothing inside the translated track uses `backdrop-blur`. The gauge
 *      card is a solid `bg-ink-2`, so there is no backdrop layer to detach.
 *      (The grab tab keeps its blur: it is a static sibling, never inside a
 *      transformed ancestor.)
 *   3. The window width is clamped at both ends (`drawerWindowWidth`), so
 *      elastic overshoot past either anchor still clips cleanly.
 *
 * States:
 *   open:      card fully visible (the resting position).
 *   collapsed: window at width 0; only the 32px grab tab shows. The collapsed
 *     drawer captures no pointer events, so pan/zoom/tap-zones work where the
 *     card used to sit.
 *
 * Animation:
 *   Same spring as the zone sheet (stiffness 420, damping 34, mass 0.85) for
 *   the snap, so the two gestures feel like one physics system. The card
 *   follows the finger 1:1 mid-drag; on release, velocity is projected
 *   forward (0.2s) and a flick always lands in the direction it was thrown.
 *   For reduced-motion the track jumps instantly (`offsetX.jump`), and the
 *   window follows through the same motion-value subscription.
 *
 * Drag surface (deliberately ONLY the tab):
 *   The gauge card stays `pointer-events-none` — it is a read-only instrument
 *   and map gestures pass through it. Giving it a drag surface would newly
 *   swallow map pans starting on that 172px card, which would be a regression
 *   for map interaction, not a feature.
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
 *   Like the old floating chrome, the whole drawer (tab included) fades out
 *   as the sheet rises — at mid/full the sheet is the readout and a floating
 *   tab would be a stray affordance. While faded, the tab also drops its
 *   pointer events, so invisible chrome can never swallow a map gesture.
 */

export interface AdvisoryDrawerProps {
  advisory: number
  zones: number
  pending: number
  /** Driven by the sheet's progress; the drawer fades, it does not shrink. */
  chromeOpacity: MotionValue<number>
}

const TAB_LABEL: Record<'open' | 'collapsed', string> = {
  open: 'Collapse advisory signal panel',
  collapsed: 'Expand advisory signal panel',
}

export function AdvisoryDrawer({
  advisory,
  zones,
  pending,
  chromeOpacity,
}: AdvisoryDrawerProps) {
  const panel = useSidePanel('open')
  const reduceMotion = useReducedMotion()
  const open = panel.state === 'open'
  const tabLabel = TAB_LABEL[panel.state]

  // The clip window's width, driven by the same motion value as the track's
  // position. A subscription rather than `useTransform` on purpose: the card
  // width can change independently of the offset (font load, rotation), and
  // this keeps the width correct through both without depending on how the
  // transform helper caches its closure.
  const cardWidth = -panel.offsets.collapsed
  const windowWidth = useMotionValue(cardWidth)
  const cardWidthRef = useRef(cardWidth)
  cardWidthRef.current = cardWidth
  useMotionValueEvent(panel.offsetX, 'change', (x) => {
    windowWidth.set(drawerWindowWidth(cardWidthRef.current, x))
  })
  useEffect(() => {
    windowWidth.set(drawerWindowWidth(cardWidth, panel.offsetX.get()))
  }, [cardWidth, panel.offsetX, windowWidth])

  // The tab re-enables pointer events only while the chrome is actually
  // visible — invisible chrome must never eat map gestures.
  const tabPointerEvents = useTransform(chromeOpacity, (value): string =>
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
      style={{ opacity: chromeOpacity }}
      className="pointer-events-none absolute left-3 top-[7rem] z-[1010] mt-[env(safe-area-inset-top)]"
      role="region"
      aria-label="Advisory signal"
      data-testid="advisory-drawer"
      data-state={panel.state}
      data-dragging={panel.dragging || undefined}
    >
      <div className="flex items-stretch gap-1.5">
        {/* --- Clip window -------------------------------------------------
            `overflow-hidden` is load-bearing: this is what clips the card
            mid-drag. Its width tracks the track position 1:1 (see above), so
            the visible card edge is always a clean cut — never floating
            text. `shrink-0` keeps flexbox from squeezing the window below
            the width the motion value sets. */}
        <motion.div
          style={{ width: windowWidth }}
          className="shrink-0 overflow-hidden"
          data-testid="advisory-drawer-window"
        >
          {/* --- Card track ------------------------------------------------
              The only translated element in the drawer. `w-max` is
              load-bearing: a block child would shrink to the window's width
              and corrupt the width measurement (and re-pin the drawer
              mid-drag); `max-content` keeps the track at the card's own
              width whatever the window is doing. */}
          <motion.div
            ref={panel.panelRef}
            id="advisory-drawer-body"
            style={{ x: panel.offsetX }}
            drag="x"
            dragListener={false}
            dragControls={panel.dragControls}
            dragConstraints={{ left: panel.offsets.collapsed, right: panel.offsets.open }}
            // Asymmetric elasticity: pulling right past open barely gives
            // (open is home), pulling left past collapsed gives a little —
            // the card straining at the window edge.
            dragElastic={{ left: 0.05, right: 0.02 }}
            dragMomentum={false}
            onDragStart={panel.onDragStart}
            onDragEnd={(_event, info) => panel.onDragEnd(info)}
            className="w-max"
          >
            <AdvisoryGauge advisory={advisory} zones={zones} pending={pending} />
          </motion.div>
        </motion.div>

        {/* --- Grab tab ----------------------------------------------------
            The vertical analogue of the sheet's handle: same pill-grabber
            language, rotated 90°. A static sibling of the window — it hugs
            the window's right edge as the window shrinks, and it is the 32px
            that stays on screen when collapsed (`w-8`). The drawer's only
            drag surface, `touch-action: none`. */}
        <motion.button
          type="button"
          style={{ pointerEvents: tabPointerEvents as unknown as 'auto' }}
          onPointerDown={panel.startDrag}
          onClick={handleTabClick}
          onKeyDown={handleTabKeyDown}
          aria-expanded={open}
          aria-controls="advisory-drawer-body"
          aria-label={tabLabel}
          title={tabLabel}
          data-testid="advisory-drawer-tab"
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
 * Advisory signal gauge. The same instrument as the old floating card: it
 * plots the share of zones under advisory — the waveform collapses to a flat
 * line when nothing is flagged and rises as the share grows. Explicitly NOT
 * a tide prediction.
 *
 * The card is a read-only instrument, pointer-transparent so the map beneath
 * stays interactive (pan/zoom/tap zones). Its background is deliberately
 * SOLID (`bg-ink-2`, no `backdrop-blur`): this card lives inside the drawer's
 * translated track, and translucent blurred layers inside a transformed
 * ancestor detach on mobile GPUs — that was the floating-text bleed the old
 * merged panel shipped. See the module doc above.
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
    <div
      className="pointer-events-none w-[172px] rounded-lg border border-line bg-ink-2 p-2.5"
      data-testid="advisory-gauge"
    >
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
