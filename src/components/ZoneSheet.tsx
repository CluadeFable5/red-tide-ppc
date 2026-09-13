import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { formatRelative } from '../lib/format'
import { ZONE_STATUS_ORDER } from '../lib/status'
import {
  ANCHOR_ACTION_LABEL,
  anchorReadout,
  dominantZoneStatus,
  zoneSummaryLine,
  zoneTag,
} from '../motion/readouts'
import type { ZoneSheetController } from '../motion/useZoneSheet'
import { zoneTheme } from '../styles/statusTheme'
import type { Zone, ZoneStatus } from '../types'
import { DemoBanner } from './DemoBanner'
import { ZoneListSkeleton } from './LoadingState'
import { StatusPip } from './StatusPip'
import { ZoneStatusBadge } from './StatusBadge'

/**
 * The zone sheet: advisory banner + zone list, as a three-anchor bottom sheet
 * over the map (peek ≈14% · mid ≈45% · full ≈85%).
 *
 * WHY A SHEET AND NOT SECTIONS
 * ----------------------------
 * Stacking the legend, the advisory banner and the zone list as vertical
 * siblings under a capped-height map meant the list lived below the fold and the
 * map was permanently a third of the screen. The sheet inverts that: the map
 * keeps the whole viewport, and the data comes up over it when it is asked for.
 * Peek is a summary, not an empty handle, so the sheet is still a status
 * readout when it is closed.
 *
 * WHAT IS *NOT* WRAPPED IN AN ANIMATION, AND WHY
 * ----------------------------------------------
 * The sheet is a `motion.div` translating on `y`; everything inside it is a
 * normal DOM subtree that never unmounts. That is deliberate: the scroll
 * position, the zone rows and their pending-report state all have to survive a
 * drag. Only two things animate inside — the staggered entrance of the zone
 * cards, and the pip pulses.
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

  // The zone cards stagger in the first time the sheet is actually opened.
  // Bumping the list `key` replays the stagger; it is done once, because a list
  // that re-animates every time it is scrolled back to is noise.
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

  return (
    <motion.div
      ref={sheet.sheetRef}
      style={{ y: sheet.offsetY }}
      drag="y"
      dragListener={false}
      dragControls={sheet.dragControls}
      dragConstraints={{ top: sheet.offsets.full, bottom: sheet.offsets.peek }}
      // Small, asymmetric elasticity: pulling *up* past full should feel like
      // it is straining at the top of the map, pulling down past peek should
      // barely give at all (peek is the floor, not a dismiss target).
      dragElastic={{ top: 0.06, bottom: 0.02 }}
      dragMomentum={false}
      onDragStart={sheet.onDragStart}
      onDragEnd={(_event, info) => sheet.onDragEnd(info)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-[1020] flex h-[100dvh] flex-col rounded-t-2xl border-t border-line bg-ink-2 shadow-[0_-1px_0_0_rgba(240,165,0,0.14)]"
      role="region"
      aria-label="Advisory and zone list"
      data-anchor={sheet.anchor}
      data-dragging={sheet.dragging || undefined}
    >
      {/* Registration ticks: the sheet edge reads as a measuring rail rather
          than a rounded card, which is the whole point of the dossier register. */}
      <span aria-hidden="true" className="sheet-ticks block h-2 w-full shrink-0" />

      {/* --- Drag surface ------------------------------------------------ */}
      <div
        onPointerDown={sheet.startDrag}
        className="shrink-0 cursor-grab select-none [touch-action:none] active:cursor-grabbing"
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-1.5 block h-1 w-10 rounded-full bg-line-soft"
        />

        <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-2">
          <StatusPip
            size="sm"
            hex={dominantTheme.hex}
            pulses={dominantTheme.pulses}
            trigger={dominant}
          />

          <p className="min-w-0 truncate font-mono text-[11px] uppercase leading-none tracking-[0.1em] text-paper/85">
            {summary}
          </p>

          <span className="ml-auto shrink-0 font-mono text-[9px] leading-none tabular-nums text-faint">
            {anchorReadout(sheet.anchor)}
          </span>

          <button
            type="button"
            // A drag that happens to end with a click on the handle must not
            // also advance the anchor — otherwise grabbing the handle and
            // putting the sheet back where it started would still move it.
            onClick={() => {
              if (sheet.didDrag()) return
              sheet.cycle()
            }}
            aria-label={action}
            title={action}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-paper/70 transition-colors hover:border-accent/40 hover:text-accent"
          >
            <motion.svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
              animate={{ rotate: sheet.anchor === 'full' ? 0 : 180 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </motion.svg>
          </button>
        </div>

        {/* Hairline in the most severe live status, so the closed sheet still
            states the situation in colour as well as in words. */}
        <span
          aria-hidden="true"
          className="block h-px w-full opacity-60"
          style={{ backgroundColor: dominantTheme.hex }}
        />
      </div>

      {/* --- Scrollable body -------------------------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <AdvisoryBanner advisoryCount={advisoryCount} />

        <div className="mt-5 flex items-baseline justify-between gap-2">
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

              return (
                <motion.li
                  key={zone.id}
                  variants={cardVariants}
                  className={`group overflow-hidden rounded-lg border bg-ink transition-colors duration-200 ${
                    isSelected
                      ? 'border-accent/50 ring-1 ring-accent/20'
                      : 'border-line hover:border-line-soft hover:bg-ink-3'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onFocusZone(zone.id)}
                    className="block w-full p-3.5 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-lg leading-none text-paper">
                        {zone.name}
                      </h3>
                      <ZoneStatusBadge status={zone.status} size="sm" />
                    </div>

                    {/* Machine-readable row: the same zone, in the register the
                        rest of the UI is drawn in. */}
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
                  <div className="flex items-center justify-between gap-2 border-t border-line/70 px-3.5 py-2">
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
                  <span
                    className="block h-0.5 w-full opacity-70"
                    style={{ backgroundColor: theme.hex }}
                    aria-hidden="true"
                  />
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
    </motion.div>
  )
}

/**
 * The advisory summary.
 *
 * Rendered at every anchor — at peek it is simply clipped by the sheet, so the
 * safety-critical sentence is never absent from the document. Auto-expanding to
 * it on load was considered and rejected: hijacking the sheet on every visit is
 * more annoying than the one extra gesture, and the peek line already carries
 * the count in the advisory colour.
 */
function AdvisoryBanner({ advisoryCount }: { advisoryCount: number }) {
  if (advisoryCount > 0) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-advisory/30 bg-advisory/8 p-3.5 pl-4">
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
    <div className="relative overflow-hidden rounded-lg border border-safe/25 bg-safe/6 p-3.5 pl-4">
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
