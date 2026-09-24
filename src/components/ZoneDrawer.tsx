import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useReducedMotion, useTransform } from 'motion/react'
import { APP_SPRING } from '../motion/mapMotion'
import { MorphChevronIcon } from './MorphChevron'
import { formatRelative } from '../lib/format'
import { ZONE_STATUS_ORDER } from '../lib/status'
import {
  dominantZoneStatus,
  sidePanelReadout,
  zoneSummaryLine,
  zoneTag,
} from '../motion/readouts'
import { isDragTail, SIDE_PANEL_STATE_ORDER } from '../motion/sidePanelAnchors'
import type { SidePanelController } from '../motion/useSidePanel'
import { useClipWindowWidth } from '../motion/useSidePanel'
import { zoneTheme } from '../styles/statusTheme'
import type { Zone, ZoneStatus } from '../types'
import { DemoBanner } from './DemoBanner'
import { ZoneListSkeleton } from './LoadingState'
import { StatusPip } from './StatusPip'
import { ZoneStatusBadge } from './StatusBadge'

/**
 * The zone drawer: everything the bottom sheet held — advisory banner, zone
 * list, primer, OSM credit — as a two-state side drawer on the RIGHT edge.
 *
 * WHY THIS EXISTS
 * ---------------
 * The bottom sheet is gone (its files stay in the repo, unwired, per the
 * task's deletion hold). The screenshot markup pulled the bottom strip to
 * the top-right edge "behaving like the Advisory Signal drawer": swipe right
 * to tuck away leaving only a grab tab, swipe left or tap the tab to open.
 * This component is that drawer. It reuses the advisory drawer's proven
 * machinery rather than porting the sheet's anchor logic — same
 * `useSidePanel` hook, same clip-window technique (the window's width is
 * derived from the SAME motion value that positions the track, so content
 * can never render outside the visible bounds at any drag position), same
 * spring, same tap-after-drag guard, same reduced-motion jump. See
 * `AdvisoryDrawer.tsx` for the full architecture notes — mirrored here for
 * the right edge.
 *
 * GEOMETRY (the right-edge mirror)
 * --------------------------------
 * The drawer's row lives in the top-right control column
 * (`MapControlColumn`), under the zoom buttons and the advisory tab:
 * [tab][window], right-aligned, so the window's right edge is pinned and its
 * LEFT edge is the moving cut. The track is `justify-end`-aligned to the
 * pinned edge; `offsets.collapsed` is `+panelWidth` (the track slides right
 * to tuck). The controller is lifted into `MapPage` (like the sheet's was)
 * so zone focus can tuck the drawer on phones.
 *
 *   open:      the panel fills the rest of the column below its tab.
 *   collapsed: window at width 0; only the 44px grab tab stays on screen.
 *     The panel itself stays MOUNTED (screen readers and the report flow
 *     keep their DOM), and captures no pointer events outside the window.
 *
 * The panel is solid `bg-ink-2` — no `backdrop-blur` anywhere inside the
 * translated track, for the same mobile-GPU reason as the gauge card. The
 * tab keeps its blur: it is a static sibling, never inside a transformed
 * ancestor. Blur lives on static layers only.
 *
 * Non-drag paths (every state reachable without a swipe):
 *   - the grab tab: tap / Enter / Space toggles; ArrowRight collapses,
 *     ArrowLeft expands (directional pair for a right-edge drawer);
 *   - the summary line is a button that toggles;
 *   - two state dots jump directly to collapsed/open;
 *   - a chevron button toggles.
 *
 * Attribution: the always-visible licence credit is NOT in this drawer — it
 * is the persistent pill pinned bottom-left outside every clip window
 * (`map-attribution` in MapPage), so it survives the collapsed state. The
 * compact `© OSM` link in the header strip and the full credit in the footer
 * mirror what the sheet showed while open.
 *
 * Panel width: `min(100vw - 5rem, 23.75rem)` — the 5rem reserve keeps the
 * 44px tab + gap + page margin on screen at the narrowest audited width
 * (320px), so the tab is never pushed off the left edge.
 */

/** Fallback for the unmeasured panel (jsdom); matches the panel's max width. */
export const ZONE_PANEL_FALLBACK_WIDTH = 380

export interface ZoneDrawerProps {
  zones: Zone[]
  zonesReady: boolean
  pendingCounts: Record<string, number>
  counts: Record<ZoneStatus, number>
  selectedZoneId: string | null
  /** Lifted into MapPage so zone focus can tuck the drawer on phones. */
  panel: SidePanelController
  onFocusZone: (zoneId: string) => void
  onReport: (zoneId: string) => void
}

const ACTION_LABEL: Record<'open' | 'collapsed', string> = {
  open: 'Collapse the zone drawer',
  collapsed: 'Open the zone drawer',
}

/**
 * One scale on the header pip when the drawer opens from collapsed.
 *
 * Mount-open (desktop, ≥768) does not pulse — only a collapsed → open
 * transition. The pip's own `trigger` pulse (status change) is left alone;
 * this wrapper is the open cue. Reduced motion draws nothing. The wrapper
 * itself is never blurred: a transform plus backdrop-filter is the mobile
 * GPU trap this drawer already avoids.
 */
function HeaderPipPulse({
  state,
  children,
}: {
  state: 'open' | 'collapsed'
  children: React.ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(state)

  useEffect(() => {
    const opened = prev.current === 'collapsed' && state === 'open'
    prev.current = state
    if (!opened || reduceMotion) return
    const node = ref.current
    if (!node) return
    const controls = animate(
      node,
      { scale: [1, 1.4, 1] },
      { duration: 0.4, ease: 'easeOut' },
    )
    return () => controls.stop()
  }, [state, reduceMotion])

  return (
    <span ref={ref} className="inline-grid shrink-0 origin-center">
      {children}
    </span>
  )
}

export function ZoneDrawer({
  zones,
  zonesReady,
  pendingCounts,
  counts,
  selectedZoneId,
  panel,
  onFocusZone,
  onReport,
}: ZoneDrawerProps) {
  const reduceMotion = useReducedMotion()
  const open = panel.state === 'open'
  const advisoryCount = counts.advisory ?? 0
  const summary = zoneSummaryLine(zones.length, advisoryCount)
  const dominant = dominantZoneStatus(counts)
  const dominantTheme = zoneTheme(dominant)
  const action = ACTION_LABEL[panel.state]

  const windowWidth = useClipWindowWidth(panel.offsetX, panel.panelWidth, panel.edge)

  // The tab-to-window gap, derived from the same clip-window motion value: 0
  // when collapsed — so the tab sits flush with the column's right edge,
  // exactly like the zoom buttons — ramping to the full 6px as soon as the
  // window cracks open. A static `gap` on the row would persist while the
  // window is 0px wide and leave the collapsed tab 6px off the edge. This is
  // a margin, not a transform, so the tab keeps its backdrop blur on a
  // never-transformed layer.
  const tabGap = useTransform(windowWidth, [0, 8], [0, 6], { clamp: true })

  // Staggered entrance: the cards ride the drawer's own open/collapsed state,
  // driven by the same spring physics as the drag. The list renders `hidden`
  // for its first commit and flips to `show` on the next — a mount-time
  // `animate="show"` is exactly the case real Chrome mounts straight past,
  // while a state-driven hidden→show transition always plays (proven at
  // <768, where the first open drives the same flip).
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    setRevealed(true)
  }, [])

  const listVariants = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: {
          // 65ms per card: still restrained, but perceptible across the
          // seven-zone list while the drawer itself is opening.
          staggerChildren: reduceMotion ? 0 : 0.065,
          delayChildren: reduceMotion ? 0 : 0.065,
        },
      },
    }),
    [reduceMotion],
  )

  const cardVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: reduceMotion ? 0 : 10 },
      show: {
        opacity: 1,
        y: 0,
        // The app spring (420/34/0.85) — the same physics the drag snaps
        // with, so the reveal reads as part of the drawer, not an overlay.
        transition: reduceMotion ? { duration: 0 } : APP_SPRING,
      },
    }),
    [reduceMotion],
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
      // Enter/Space already toggle via the native button click; arrows are
      // the directional pair for a RIGHT-edge drawer.
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        panel.goTo('collapsed')
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        panel.goTo('open')
      }
    },
    [panel],
  )

  const handleSummaryClick = useCallback(
    (event: React.MouseEvent) => {
      if (isDragTail(panel.didDrag(), event.detail)) return
      panel.toggle()
    },
    [panel],
  )

  return (
    <div
      className="pointer-events-none flex min-h-0 flex-1 flex-row items-start justify-end"
      role="region"
      aria-label="Advisory and zone list"
      data-testid="zone-drawer"
      data-state={panel.state}
      data-dragging={panel.dragging || undefined}
    >
      {/* --- Grab tab -------------------------------------------------------
          The 44px that stays on screen when collapsed: a status pip (worst
          state anywhere on the map, never colour alone — the row also has a
          chevron), the grabber, and the directional chevron. A static sibling
          of the clip window, so it keeps its backdrop blur. One of the two
          drag surfaces (the other is the panel's header strip). */}
      <motion.button
        type="button"
        onPointerDown={panel.startDrag}
        onClick={handleTabClick}
        onKeyDown={handleTabKeyDown}
        aria-expanded={open}
        aria-controls="zone-drawer-body"
        aria-label={action}
        title={action}
        data-testid="zone-drawer-tab"
        style={{ marginRight: tabGap }}
        className="pointer-events-auto flex w-11 shrink-0 select-none flex-col items-center gap-2 self-start rounded-lg border border-line bg-ink-2/88 py-3 backdrop-blur-md transition-colors [touch-action:none] hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <StatusPip
          size="sm"
          hex={dominantTheme.hex}
          pulses={dominantTheme.pulses}
          trigger={dominant}
        />
        {/* Geometry morph, not a rotation: the arms fold through a vertical
            stroke between ‹ and › (see MorphChevron). */}
        <MorphChevronIcon open={open} className="h-3.5 w-3.5 text-paper/70" />
        <span
          aria-hidden="true"
          className="block h-8 w-1 rounded-full bg-line-soft"
        />
      </motion.button>

      {/* --- Clip window ----------------------------------------------------
          `overflow-hidden` + a width derived from the same motion value that
          positions the track: the structural guarantee that nothing renders
          outside the visible bounds at any drag position. `flex justify-end`
          pins the track to the anchored (right) edge so the left edge is the
          cut that tracks the drag. `h-full` fills the rest of the column. */}
      <motion.div
        style={{ width: windowWidth }}
        className="flex h-full min-h-0 shrink-0 justify-end overflow-hidden"
        data-testid="zone-drawer-window"
      >
        {/* --- Panel track --------------------------------------------------
            The only translated element in the drawer. `w-max` keeps it at the
            panel's own width whatever the window is doing (a block child
            would shrink to the window and corrupt the measurement). */}
        <motion.div
          ref={panel.panelRef}
          id="zone-drawer-body"
          style={{ x: panel.offsetX }}
          drag="x"
          dragListener={false}
          dragControls={panel.dragControls}
          dragConstraints={panel.constraints}
          // Pulling left past open barely gives (open is home); pulling right
          // past collapsed gives a little — the panel straining at the edge.
          dragElastic={{ left: 0.02, right: 0.05 }}
          dragMomentum={false}
          onDragStart={panel.onDragStart}
          onDragEnd={(_event, info) => panel.onDragEnd(info)}
          className="h-full w-max"
        >
          {/* The panel. Solid background — no backdrop-blur inside the
              translated track, for the same mobile-GPU reason as the gauge
              card. Width reserves 5rem for tab + gap + margins (see doc). */}
          <div
            className="pointer-events-auto relative isolate flex h-full w-[min(100vw_-_5rem,23.75rem)] flex-col overflow-hidden rounded-l-xl border-l border-line bg-ink-2 shadow-[-24px_0_48px_-24px_rgba(0,0,0,0.9)]"
            data-testid="zone-drawer-panel"
          >
            {/* Phase-3 ambient orb behind the panel content (isolate keeps
                the negative-z span above the panel fill, below the list). */}
            <span aria-hidden="true" className="orb orb--panel -z-10" />
            {/* Registration ticks, mirrored from the sheet's top edge to the
                panel's leading (left) edge. Static paint, never blurred. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-2"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(180deg, var(--color-line) 0 1px, transparent 1px 13px)',
              }}
            />

            {/* --- Header strip — drag surface + non-drag controls -------- */}
            <div
              onPointerDown={panel.startDrag}
              className="shrink-0 select-none [touch-action:none]"
            >
              {/* Handle — visual grabber, part of the drag surface */}
              <div className="flex justify-center pt-1.5">
                <span
                  aria-hidden="true"
                  className="block h-1 w-10 rounded-full bg-line-soft"
                />
              </div>

              <div className="px-3.5 pb-2 pt-2">
                {/* Row 1: pip + summary (toggle). The status line is data —
                    the one thing that must never truncate at 320px, so it
                    gets the full strip width... */}
                <div className="flex items-center gap-2.5">
                  <HeaderPipPulse state={panel.state}>
                    <StatusPip
                      size="sm"
                      hex={dominantTheme.hex}
                      pulses={dominantTheme.pulses}
                      trigger={dominant}
                    />
                  </HeaderPipPulse>
                  <button
                    type="button"
                    onClick={handleSummaryClick}
                    aria-label={`${summary} — ${action}`}
                    title={action}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-[11px] uppercase leading-none tracking-[0.1em] text-paper/85 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0"
                  >
                    {summary}
                  </button>
                </div>

                {/* Row 2: ...and the instruments get their own line below:
                    compact credit, two-state readout, direct state dots and
                    the toggle. */}
                <div className="mt-1.5 flex items-center gap-2.5">
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-mono text-[9px] uppercase leading-none tracking-[0.12em] text-faint transition-colors hover:text-accent"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    © OSM
                  </a>

                  <span className="ml-auto shrink-0 font-mono text-[9px] leading-none tabular-nums text-faint">
                    {sidePanelReadout(panel.state)}
                  </span>

                  {/* State dots — direct access to both states */}
                  <div className="flex items-center gap-1" aria-label="Drawer position">
                    {SIDE_PANEL_STATE_ORDER.map((state) => (
                      <button
                        key={state}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isDragTail(panel.didDrag(), e.detail)) return
                          panel.goTo(state)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label={
                          state === 'open'
                            ? 'Open the zone drawer'
                            : 'Collapse the zone drawer'
                        }
                        aria-pressed={panel.state === state}
                        title={state}
                        className={`h-2 w-2 rounded-full transition-all ${
                          panel.state === state
                            ? 'w-4 bg-accent'
                            : 'bg-line-soft hover:bg-line'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Toggle — also a non-drag path */}
                  <button
                    type="button"
                    onClick={(event) => {
                      if (isDragTail(panel.didDrag(), event.detail)) return
                      panel.toggle()
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={action}
                    title={action}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-paper/70 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <MorphChevronIcon open={open} className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Hairline in dominant status colour — under the strip, the
                  same place the sheet carried it. */}
              <span
                aria-hidden="true"
                className="block h-px w-full opacity-60"
                style={{ backgroundColor: dominantTheme.hex }}
              />
            </div>

            {/* --- Scrollable body -----------------------------------------
                Vertical scrolling only: it never chains into the horizontal
                drawer drag (the tab and the header strip are the only drag
                surfaces), which removes the whole scroll-chaining bug class
                the sheet had, by construction. Bottom padding clears the
                always-visible attribution pill that floats over the corner. */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-4"
              data-testid="zone-drawer-scroll"
            >
              <AdvisoryBanner advisoryCount={advisoryCount} />

              <div className="mt-4 flex items-baseline justify-between gap-2">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  Zones <span className="text-paper/70">[{zones.length}]</span>
                </h2>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                  {zones.length > 0 ? 'Tap a zone to locate' : 'No zones loaded'}
                </span>
              </div>

              {!zonesReady && <ZoneListSkeleton />}

              {zonesReady && (
                <motion.ul
                  variants={listVariants}
                  initial="hidden"
                  animate={open && revealed ? 'show' : 'hidden'}
                  className="mt-2.5 grid gap-2"
                >
                  {zones.map((zone) => {
                    const pending = pendingCounts[zone.id] ?? 0
                    const isSelected = zone.id === selectedZoneId
                    const theme = zoneTheme(zone.status)

                    return (
                      <motion.li
                        key={zone.id}
                        variants={cardVariants}
                        className={`group relative overflow-hidden rounded-lg border bg-ink transition-colors duration-200 ${
                          isSelected
                            ? 'border-accent/50 ring-1 ring-accent/20'
                            : 'border-line hover:border-line-soft hover:bg-ink-3'
                        }`}
                      >
                        {/* Left accent bar matching status */}
                        <span
                          className="absolute inset-y-0 left-0 w-1 opacity-80"
                          style={{ backgroundColor: theme.hex }}
                          aria-hidden="true"
                        />
                        <div className="pl-3">
                          <button
                            type="button"
                            onClick={() => onFocusZone(zone.id)}
                            className="block w-full p-3 text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="font-display text-lg leading-none text-paper">
                                {zone.name}
                              </h3>
                              <ZoneStatusBadge status={zone.status} size="sm" />
                            </div>

                            <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                              {zoneTag(zone.id)} · {formatRelative(zone.lastUpdated)}
                            </p>

                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
                              {zone.description}
                            </p>
                            {pending > 0 && (
                              <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-accent"
                                  aria-hidden="true"
                                />
                                {pending} pending {pending === 1 ? 'report' : 'reports'}
                              </p>
                            )}
                          </button>
                          <div className="flex items-center justify-between gap-2 border-t border-line/70 px-3 py-1.5">
                            <button
                              type="button"
                              onClick={() => onReport(zone.id)}
                              className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-accent"
                            >
                              Report something here →
                            </button>
                            <span className="font-mono text-[9px] tracking-[0.14em] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                              {zone.polygon.length} PT
                            </span>
                          </div>
                        </div>
                      </motion.li>
                    )
                  })}
                </motion.ul>
              )}

              {zones.length === 0 && zonesReady && (
                <p className="mt-3 rounded-lg border border-dashed border-line bg-ink p-6 text-center text-sm text-muted">
                  No zones found. Run <code className="font-mono text-accent">npm run seed</code>{' '}
                  to load the Puerto Princesa zones.
                </p>
              )}

              <Primer />

              <div className="mt-3">
                <DemoBanner />
              </div>

              <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <p>
                  Key order: {ZONE_STATUS_ORDER.map((status) => status).join(' · ')}
                </p>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-accent"
                >
                  © OpenStreetMap
                </a>
              </footer>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

/**
 * The advisory summary — same copy the sheet carried.
 */
function AdvisoryBanner({ advisoryCount }: { advisoryCount: number }) {
  if (advisoryCount > 0) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-advisory/30 bg-advisory/8 p-3 pl-4">
        <span className="absolute inset-y-0 left-0 w-1 bg-advisory" aria-hidden="true" />
        <h2 className="font-display text-lg leading-none text-advisory">
          {advisoryCount} {advisoryCount === 1 ? 'zone is' : 'zones are'} under advisory
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-paper/70">
          Do not gather, sell or eat shellfish or <em>alamang</em> from a zone marked{' '}
          <strong className="text-advisory">Advisory</strong>. Fish, squid, shrimp and
          crab are still safe if they are fresh, cleaned and washed before cooking.
        </p>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-safe/25 bg-safe/6 p-3 pl-4">
      <span className="absolute inset-y-0 left-0 w-1 bg-safe" aria-hidden="true" />
      <h2 className="font-display text-lg leading-none text-safe">
        No advisories recorded right now
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-paper/70">
        Nothing is currently flagged. Tap a zone on the map and report what you see —
        water colour, dead shellfish, or anyone feeling numb after eating seafood.
      </p>
    </div>
  )
}

/** The explainer, at the bottom of the open drawer. */
function Primer() {
  return (
    <section className="mt-6 rounded-lg border border-line bg-ink p-4">
      <h2 className="font-display text-xl leading-none text-paper">
        What is red tide?{' '}
        <span className="font-sans text-sm font-normal text-faint">
          / “pula ang dagat”
        </span>
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        A <strong className="text-paper/85">red tide</strong> is a bloom of microscopic
        algae that can turn seawater reddish-brown, though the water does not always
        change colour. Some of these organisms produce{' '}
        <strong className="text-paper/85">saxitoxin</strong>. Shellfish —{' '}
        <em>tahong</em> (mussels), <em>talaba</em> (oysters), <em>halaan</em> (clams)
        and <em>alamang</em> — filter seawater to feed, so the toxin builds up inside
        them.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Eating contaminated shellfish causes{' '}
        <strong className="text-paper/85">Paralytic Shellfish Poisoning (PSP)</strong>.
        Cooking, boiling or vinegar does <strong className="text-paper/85">not</strong>{' '}
        destroy the toxin, and there is no antidote. Symptoms usually start within 30
        minutes to 2 hours: tingling or numbness around the mouth, face and limbs, then
        difficulty breathing. Severe cases can stop breathing within 12 hours — get to
        a hospital immediately.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Fish, squid, shrimp and crab from the same water are generally safe to eat if
        they are fresh, have their gills and intestines removed, and are washed under
        running water before cooking.
      </p>

      <div className="mt-4 rounded-md border-l-2 border-accent/60 bg-ink-3 p-3">
        <p className="text-xs font-semibold text-paper/85">
          This app is a community early-warning tool, not an official advisory.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Only the Bureau of Fisheries and Aquatic Resources (BFAR) can confirm a red
          tide through laboratory testing. Reports here are reviewed by a local admin
          and are meant to get a warning out faster, not to replace the BFAR shellfish
          bulletin.
        </p>
      </div>

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-faint">
        Zone outlines on this map are approximate and drawn for demonstration — they
        are not official fisheries boundaries.
      </p>
    </section>
  )
}
