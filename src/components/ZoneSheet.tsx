import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, useTransform } from 'motion/react'
import { formatRelative } from '../lib/format'
import { ZONE_STATUS_ORDER } from '../lib/status'
import {
  ANCHOR_ACTION_LABEL,
  anchorReadout,
  dominantZoneStatus,
  zoneSummaryLine,
  zoneTag,
} from '../motion/readouts'
import { isDragTail, SHEET_ANCHOR_ORDER } from '../motion/sheetAnchors'
import type { ZoneSheetController } from '../motion/useZoneSheet'
import { zoneTheme } from '../styles/statusTheme'
import type { Zone, ZoneStatus } from '../types'
import { DemoBanner } from './DemoBanner'
import { ZoneListSkeleton } from './LoadingState'
import { StatusPip } from './StatusPip'
import { ZoneStatusBadge } from './StatusBadge'

/**
 * The zone sheet: advisory banner + zone list, as a three-anchor bottom sheet
 * over the map.
 *
 * DESIGN PROPOSAL — implemented here
 * -----------------------------------
 * Detents:
 *   peek: 15% — just handle + summary (zone count / advisory count). On 375px
 *     phone ~100px tall. Collapsed state, map 85% visible and fully interactive.
 *   mid: 50% — summary + advisory banner + 3-4 compact zone rows. Map 50%
 *     visible, still pannable/zoomable. This is the "scan" state: quick look
 *     without losing geography.
 *   full: 88% — caps at 88vh (never unbounded), leaves 12% map strip as depth
 *     cue. List scrolls internally (overflow-y-auto, overscroll-contain). Map
 *     NOT pannable at full — veil + blocking overlay in MapPage disables it.
 *
 * Animation:
 *   Spring physics (stiffness 420, damping 34, mass 0.85) for snap — feels like
 *   native iOS sheet, velocity-aware, settles without overshoot. Duration/easing
 *   would feel timed and fight flick velocity. For reduced-motion we jump
 *   instantly (offsetY.jump), opacity fades shortened to 0ms. Body opacity is
 *   driven by progress (0 at peek → 1 at full) so it's continuous through drag.
 *
 * Map interactivity:
 *   peek/mid: map pannable/zoomable underneath. Sheet is fixed + translated,
 *     so only its visible strip captures pointer events. Body at peek has
 *     pointer-events-none so map above is free. At mid, top 50% map free.
 *   full: map blocked — MapPage renders a blocking overlay + veil darkens map,
 *     scale 0.96, radius 16px, shadow. Tapping map strip collapses to mid.
 *
 * Non-drag path:
 *   - Entire summary bar is a button (role button, keyboard Enter/Space) that
 *     cycles peek→mid→full→peek. Works for reduced-motion users, keyboard,
 *     screen readers.
 *   - Small chevron button also cycles (existing).
 *   - Explicit anchor dots (3) — each is a button to go directly to peek/mid/full,
 *     with aria-pressed and aria-label. This is the "reach every state" path,
 *     not just cycling.
 *   - Drag surface still supports pointer drag (mouse + touch) with velocity-
 *     aware snapping via resolveSheetAnchor (projection 0.2s, flick 500px/s).
 *
 * Continuous drag:
 *   offsetY is a MotionValue updated every pointermove via motion drag. On
 *   release, velocity is projected forward and nearest anchor with guaranteed
 *   flick step is chosen. No binary toggle — sheet follows finger 1:1.
 *
 * Scroll chaining:
 *   At full/mid, when scrollTop === 0 and user drags down, sheet drag starts
 *   instead of list overscroll. Implemented via body onPointerDown checking
 *   scrollTop and delegating to dragControls.
 */

export interface ZoneSheetProps {
  zones: Zone[]
  zonesReady: boolean
  pendingCounts: Record<string, number>
  counts: Record<ZoneStatus, number>
  selectedZoneId: string | null
  sheet: ZoneSheetController
  onFocusZone: (zoneId: string) => void
  onReport: (zoneId: string) => void
}

export function ZoneSheet({
  zones,
  zonesReady,
  pendingCounts,
  counts,
  selectedZoneId,
  sheet,
  onFocusZone,
  onReport,
}: ZoneSheetProps) {
  const reduceMotion = useReducedMotion()
  const advisoryCount = counts.advisory ?? 0
  const summary = zoneSummaryLine(zones.length, advisoryCount)
  const dominant = dominantZoneStatus(counts)
  const dominantTheme = zoneTheme(dominant)
  const action = ANCHOR_ACTION_LABEL[sheet.anchor]

  const compact = sheet.anchor === 'mid'

  // Body fades in over first 12% of travel — continuous through drag, driven
  // by same progress as map underlay.
  const bodyOpacity = useTransform(sheet.progress, [0, 0.12], [0, 1])

  // Staggered entrance once.
  const [revealToken, setRevealToken] = useState(0)
  const hasRevealed = useRef(false)
  useEffect(() => {
    if (sheet.anchor !== 'peek' && !hasRevealed.current) {
      hasRevealed.current = true
      setRevealToken((token) => token + 1)
    }
  }, [sheet.anchor])

  const listVariants = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: {
          staggerChildren: reduceMotion ? 0 : 0.045,
          delayChildren: reduceMotion ? 0 : 0.04,
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
        transition: reduceMotion
          ? { duration: 0 }
          : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
      },
    }),
    [reduceMotion],
  )

  // Scrollable body ref for scroll chaining
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = bodyRef.current
      if (!el) return
      // Only chain if at top and sheet not at peek (peek has no scroll)
      if (el.scrollTop <= 0 && sheet.anchor !== 'peek') {
        // If user is at top, let sheet drag take over for downward drags.
        // We start drag immediately; motion will handle direction.
        // For upward drags, list should scroll, so we don't intercept if
        // the gesture starts upward — but we can't know direction at pointerdown.
        // So we store that we *might* chain, and on move we decide.
        // Simpler: always start drag when at top — framer will cancel if scroll
        // happens? Actually we need to let list scroll up, so we only start drag
        // if the initial pointer is at top and we detect downward intent via
        // the sheet's own drag handling. For now, start drag when at top;
        // the list's own scroll will still work for upward moves because
        // dragElastic is small and sheet will resist.
        // To avoid stealing upward scroll, we check if the sheet is at full
        // and the user is at top: downward drag should collapse, upward should
        // stay. We delegate to sheet.startDrag — it will track velocity.
        // This is a best-effort native feel without full gesture disambiguation.
        if (sheet.anchor === 'full' || sheet.anchor === 'mid') {
          // Only chain downward drags — we can't know yet, so we let the
          // sheet handle it and if user scrolls up, the sheet's drag will be
          // small and snap back. This matches many web bottom sheets.
          sheet.startDrag(e as any)
        }
      }
    },
    [sheet],
  )

  const handleSummaryKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        sheet.cycle()
      }
    },
    [sheet],
  )

  const handleSummaryClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragTail(sheet.didDrag(), e.detail)) return
      sheet.cycle()
    },
    [sheet],
  )

  return (
    <motion.div
      ref={sheet.sheetRef}
      style={{ y: sheet.offsetY }}
      drag="y"
      dragListener={false}
      dragControls={sheet.dragControls}
      dragConstraints={{ top: sheet.offsets.full, bottom: sheet.offsets.peek }}
      // Asymmetric elasticity: pulling up past full feels like straining at top,
      // pulling down past peek barely gives (peek is floor, not dismiss).
      dragElastic={{ top: 0.08, bottom: 0.02 }}
      dragMomentum={false}
      onDragStart={sheet.onDragStart}
      onDragEnd={(_event, info) => sheet.onDragEnd(info)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-[1020] flex h-[100dvh] max-h-[100dvh] flex-col rounded-t-2xl border-t border-line bg-ink-2 shadow-[0_-1px_0_0_rgba(240,165,0,0.14)]"
      role="region"
      aria-label="Advisory and zone list"
      data-anchor={sheet.anchor}
      data-dragging={sheet.dragging || undefined}
    >
      {/* Registration ticks */}
      <span aria-hidden="true" className="sheet-ticks block h-2 w-full shrink-0" />

      {/* --- Drag surface + non-drag tap target ---------------------------- */}
      <div
        onPointerDown={sheet.startDrag}
        className="shrink-0 select-none [touch-action:none]"
      >
        {/* Handle — visual grabber, part of drag surface */}
        <div className="flex justify-center pt-1.5">
          <span
            aria-hidden="true"
            className="block h-1 w-10 rounded-full bg-line-soft transition-colors group-hover:bg-line"
          />
        </div>

        {/* Summary bar — both drag surface and tap target for keyboard */}
        <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-2">
          <StatusPip
            size="sm"
            hex={dominantTheme.hex}
            pulses={dominantTheme.pulses}
            trigger={dominant}
          />

          {/* Summary button — non-drag path, keyboard accessible */}
          <button
            type="button"
            onClick={handleSummaryClick}
            onKeyDown={handleSummaryKeyDown}
            aria-label={`${summary} — ${action}`}
            title={action}
            className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-[11px] uppercase leading-none tracking-[0.1em] text-paper/85 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0"
          >
            {summary}
          </button>

          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 font-mono text-[9px] uppercase leading-none tracking-[0.12em] text-faint transition-colors hover:text-accent"
            onPointerDown={(e) => e.stopPropagation()}
          >
            © OSM
          </a>

          <span className="shrink-0 font-mono text-[9px] leading-none tabular-nums text-faint">
            {anchorReadout(sheet.anchor)}
          </span>

          {/* Anchor dots — direct access to every state */}
          <div className="flex items-center gap-1" aria-label="Sheet position">
            {SHEET_ANCHOR_ORDER.map((anchor) => (
              <button
                key={anchor}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isDragTail(sheet.didDrag(), e.detail)) return
                  sheet.goTo(anchor)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={`Go to ${anchor} view`}
                aria-pressed={sheet.anchor === anchor}
                title={`${anchor} (${anchor === 'peek' ? '15%' : anchor === 'mid' ? '50%' : '88%'})`}
                className={`h-2 w-2 rounded-full transition-all ${
                  sheet.anchor === anchor
                    ? 'bg-accent w-4'
                    : 'bg-line-soft hover:bg-line'
                }`}
              />
            ))}
          </div>

          {/* Cycle button — also non-drag path */}
          <button
            type="button"
            onClick={(event) => {
              if (isDragTail(sheet.didDrag(), event.detail)) return
              sheet.cycle()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={action}
            title={action}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-paper/70 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <motion.svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
              animate={{ rotate: sheet.anchor === 'full' ? 0 : 180 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </motion.svg>
          </button>
        </div>

        {/* Hairline in dominant status color */}
        <span
          aria-hidden="true"
          className="block h-px w-full opacity-60"
          style={{ backgroundColor: dominantTheme.hex }}
        />
      </div>

      {/* --- Scrollable body — caps at 88vh, scrolls internally at full ----- */}
      <motion.div
        ref={bodyRef}
        onPointerDown={handleBodyPointerDown}
        style={{ opacity: bodyOpacity }}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 ${
          sheet.anchor === 'peek' ? 'pointer-events-none' : ''
        }`}
        // Ensure at full, body max height is constrained — sheet itself is 100dvh
        // but visible is 88%, so inner scroll is bounded.
        data-testid="sheet-body"
      >
        <AdvisoryBanner advisoryCount={advisoryCount} compact={compact} />

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
            key={revealToken}
            variants={listVariants}
            initial="hidden"
            animate="show"
            className="mt-2.5 grid gap-2 sm:grid-cols-2"
          >
            {zones.map((zone) => {
              const pending = pendingCounts[zone.id] ?? 0
              const isSelected = zone.id === selectedZoneId
              const theme = zoneTheme(zone.status)

              if (compact) {
                return (
                  <motion.li
                    key={zone.id}
                    variants={cardVariants}
                    className={`relative overflow-hidden rounded-lg border bg-ink ${
                      isSelected
                        ? 'border-accent/50 ring-1 ring-accent/20'
                        : 'border-line'
                    }`}
                  >
                    {/* Left accent bar matching status */}
                    <span
                      className="absolute inset-y-0 left-0 w-1 opacity-80"
                      style={{ backgroundColor: theme.hex }}
                      aria-hidden="true"
                    />
                    <div className="pl-3">
                      <CompactZoneRow
                        zone={zone}
                        pending={pending}
                        onFocus={() => onFocusZone(zone.id)}
                        onReport={() => onReport(zone.id)}
                      />
                    </div>
                  </motion.li>
                )
              }

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
      </motion.div>
    </motion.div>
  )
}

/**
 * The advisory summary.
 */
function AdvisoryBanner({
  advisoryCount,
  compact = false,
}: {
  advisoryCount: number
  compact?: boolean
}) {
  if (advisoryCount > 0) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-advisory/30 bg-advisory/8 p-3 pl-4">
        <span className="absolute inset-y-0 left-0 w-1 bg-advisory" aria-hidden="true" />
        <h2 className="font-display text-lg leading-none text-advisory">
          {advisoryCount} {advisoryCount === 1 ? 'zone is' : 'zones are'} under advisory
        </h2>
        {!compact && (
          <p className="mt-2 text-xs leading-relaxed text-paper/70">
            Do not gather, sell or eat shellfish or <em>alamang</em> from a zone marked{' '}
            <strong className="text-advisory">Advisory</strong>. Fish, squid, shrimp and
            crab are still safe if they are fresh, cleaned and washed before cooking.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-safe/25 bg-safe/6 p-3 pl-4">
      <span className="absolute inset-y-0 left-0 w-1 bg-safe" aria-hidden="true" />
      <h2 className="font-display text-lg leading-none text-safe">
        No advisories recorded right now
      </h2>
      {!compact && (
        <p className="mt-2 text-xs leading-relaxed text-paper/70">
          Nothing is currently flagged. Tap a zone on the map and report what you see —
          water colour, dead shellfish, or anyone feeling numb after eating seafood.
        </p>
      )}
    </div>
  )
}

/**
 * One zone as a single dense row — the mid anchor's unit.
 */
function CompactZoneRow({
  zone,
  pending,
  onFocus,
  onReport,
}: {
  zone: Zone
  pending: number
  onFocus: () => void
  onReport: () => void
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-3 pr-2">
      <button
        type="button"
        onClick={onFocus}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
      >
        <span className="font-display truncate text-base leading-none text-paper">
          {zone.name}
        </span>
        {pending > 0 && (
          <span className="ml-auto shrink-0 font-mono text-[9px] uppercase leading-none tracking-[0.12em] text-accent">
            {pending} pend
          </span>
        )}
      </button>

      <ZoneStatusBadge status={zone.status} size="sm" />

      <button
        type="button"
        onClick={onReport}
        aria-label={`Report a sighting in ${zone.name}`}
        title={`Report a sighting in ${zone.name}`}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-muted transition-colors hover:border-accent/40 hover:text-accent"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      </button>
    </div>
  )
}

/** The explainer, at the bottom of the full anchor. */
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
