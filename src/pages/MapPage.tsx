import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoBanner } from '../components/DemoBanner'
import { Header } from '../components/Header'
import { Legend } from '../components/Legend'
import { Map } from '../components/Map'
import { Notice } from '../components/Notice'
import { ReportForm } from '../components/ReportForm'
import { ZoneStatusBadge } from '../components/StatusBadge'
import { ZONE_STATUS_ORDER } from '../lib/status'
import { selectPendingCountByZone, selectZoneById, useAppStore } from '../store'
import { zoneTheme } from '../styles/statusTheme'
import type { Zone, ZoneStatus } from '../types'

/**
 * The public view.
 *
 * Layout intent: on a phone the map IS the hero — it fills the first viewport
 * edge to edge, with the title, admin entry point, legend and demo marker drawn
 * on top of it. There is deliberately no separate banner section above the map,
 * because on a 375×667 screen a banner plus a legend costs ~150px of the ~600px
 * that matter.
 *
 * Everything explanatory (the advisory summary, the tappable zone list, the
 * "what is red tide" primer) lives below the fold, where it can be read at
 * leisure rather than crowding the thing people actually came for.
 */
export function MapPage() {
  const zones = useAppStore((state) => state.zones)
  const reports = useAppStore((state) => state.reports)
  const zonesReady = useAppStore((state) => state.zonesReady)
  const selectedZoneId = useAppStore((state) => state.selectedZoneId)
  const reportZoneId = useAppStore((state) => state.reportZoneId)
  const selectZone = useAppStore((state) => state.selectZone)
  const openReportForm = useAppStore((state) => state.openReportForm)
  const closeReportForm = useAppStore((state) => state.closeReportForm)

  const [resetToken, setResetToken] = useState(0)
  const [focusToken, setFocusToken] = useState(0)

  const pendingCounts = useMemo(
    () => selectPendingCountByZone(reports),
    [reports],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<ZoneStatus, number> = {
      safe: 0,
      unconfirmed: 0,
      advisory: 0,
    }
    for (const zone of zones) counts[zone.status] += 1
    return counts
  }, [zones])

  const reportZone = selectZoneById(zones, reportZoneId)
  const advisoryCount = statusCounts.advisory

  // Presentation latch.
  //
  // `submitReport` clears `reportZoneId` the instant the write succeeds, which
  // would unmount the sheet before it could show its success state or play its
  // exit animation. Holding the zone object here keeps the sheet mounted and
  // hands `ReportForm` an `open` flag to animate against instead.
  //
  // This changes nothing about the data flow: the store still decides when the
  // form is open, and `open` is derived straight from it.
  const [heldZone, setHeldZone] = useState<Zone | null>(null)
  useEffect(() => {
    if (reportZone) setHeldZone(reportZone)
  }, [reportZone])

  function focusZone(zoneId: string) {
    selectZone(zoneId)
    setFocusToken((token) => token + 1)
  }

  return (
    <div className="min-h-full">
      {/* ------------------------------------------------------------------
          Hero: the map itself, full-bleed.
          `100svh` (small viewport height) rather than `100dvh` so the section
          does not resize as mobile browser chrome hides and re-shows, which
          would make the map jitter mid-drag.
          ------------------------------------------------------------------ */}
      <section className="relative h-[100svh] min-h-[460px] w-full sm:h-[64vh] sm:min-h-[440px]">
        <Map
          zones={zones}
          pendingCounts={pendingCounts}
          selectedZoneId={selectedZoneId}
          resetToken={resetToken}
          focusZoneId={selectedZoneId}
          focusToken={focusToken}
          onSelectZone={selectZone}
          onReport={openReportForm}
        />

        <Header
          overlay
          eyebrow="Puerto Princesa, Palawan"
          title="Red Tide"
          right={
            <>
              <DemoBanner variant="chip" />
              <button
                type="button"
                onClick={() => setResetToken((token) => token + 1)}
                aria-label="Reset view"
                title="Reset view"
                className="grid h-8 w-8 place-items-center rounded-md border border-line bg-ink-2/85 text-paper/75 backdrop-blur-md transition-colors hover:border-accent/40 hover:text-accent active:scale-95"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="7" />
                  <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
              </button>
              <Link
                to="/admin"
                className="rounded-md border border-line bg-ink-2/85 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/75 backdrop-blur-md transition-colors hover:border-accent/40 hover:text-accent"
              >
                Admin
              </Link>
            </>
          }
        />

        <Legend counts={statusCounts} />

        {!zonesReady && (
          <div className="absolute inset-0 z-[1005] grid place-items-center bg-ink/85 backdrop-blur-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              Loading zones…
            </p>
          </div>
        )}
      </section>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5 sm:pt-7">
        {/* Advisory summary. Kept below the fold with real weight, because when
            there IS an advisory this is the single most important sentence on
            the page. */}
        {advisoryCount > 0 ? (
          <div className="relative overflow-hidden rounded-xl border border-advisory/30 bg-advisory/8 p-4 pl-5">
            <span
              className="absolute inset-y-0 left-0 w-1 bg-advisory"
              aria-hidden="true"
            />
            <h2 className="font-display text-xl leading-none text-advisory">
              {advisoryCount} {advisoryCount === 1 ? 'zone is' : 'zones are'} under
              advisory
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-paper/70">
              Do not gather, sell or eat shellfish or <em>alamang</em> from a zone
              marked <strong className="text-advisory">Advisory</strong>. Fish,
              squid, shrimp and crab are still safe if they are fresh, cleaned and
              washed before cooking.
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-safe/25 bg-safe/6 p-4 pl-5">
            <span
              className="absolute inset-y-0 left-0 w-1 bg-safe"
              aria-hidden="true"
            />
            <h2 className="font-display text-xl leading-none text-safe">
              No advisories recorded right now
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-paper/70">
              Nothing is currently flagged. Tap a zone on the map and report what
              you see — water colour, dead shellfish, or anyone feeling numb after
              eating seafood.
            </p>
          </div>
        )}

        <h2 className="font-display mt-8 text-2xl text-paper">
          Zones{' '}
          <span className="font-mono text-sm text-faint">({zones.length})</span>
        </h2>

        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {zones.map((zone, index) => {
            const pending = pendingCounts[zone.id] ?? 0
            const isSelected = zone.id === selectedZoneId
            const theme = zoneTheme(zone.status)

            return (
              <li
                key={zone.id}
                className={`animate-rise-in stagger-item group overflow-hidden rounded-xl border bg-ink-2 transition-colors duration-200 ${
                  isSelected
                    ? 'border-accent/50 ring-1 ring-accent/20'
                    : 'border-line hover:border-line-soft hover:bg-ink-3'
                }`}
                style={{ ['--stagger' as string]: index }}
              >
                <button
                  type="button"
                  onClick={() => focusZone(zone.id)}
                  className="block w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg leading-none text-paper">
                      {zone.name}
                    </h3>
                    <ZoneStatusBadge status={zone.status} size="sm" />
                  </div>
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
                <div className="border-t border-line/70 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => openReportForm(zone.id)}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-accent"
                  >
                    Report something here →
                  </button>
                </div>
                {/* A hairline in the status colour, so the list can be scanned
                    by state without reading a single label. */}
                <span
                  className="block h-0.5 w-full opacity-70"
                  style={{ backgroundColor: theme.hex }}
                  aria-hidden="true"
                />
              </li>
            )
          })}
        </ul>

        {zones.length === 0 && zonesReady && (
          <p className="mt-3 rounded-xl border border-dashed border-line bg-ink-2 p-6 text-center text-sm text-muted">
            No zones found. Run{' '}
            <code className="font-mono text-accent">npm run seed</code> to load the
            Puerto Princesa zones.
          </p>
        )}

        <section className="mt-8 rounded-xl border border-line bg-ink-2 p-5">
          <h2 className="font-display text-2xl leading-none text-paper">
            What is red tide?{' '}
            <span className="font-sans text-sm font-normal text-faint">
              / “pula ang dagat”
            </span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            A <strong className="text-paper/85">red tide</strong> is a bloom of
            microscopic algae that can turn seawater reddish-brown, though the
            water does not always change colour. Some of these organisms produce{' '}
            <strong className="text-paper/85">saxitoxin</strong>. Shellfish —{' '}
            <em>tahong</em> (mussels), <em>talaba</em> (oysters), <em>halaan</em>{' '}
            (clams) and <em>alamang</em> — filter seawater to feed, so the toxin
            builds up inside them.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Eating contaminated shellfish causes{' '}
            <strong className="text-paper/85">
              Paralytic Shellfish Poisoning (PSP)
            </strong>
            . Cooking, boiling or vinegar does{' '}
            <strong className="text-paper/85">not</strong> destroy the toxin, and
            there is no antidote. Symptoms usually start within 30 minutes to 2
            hours: tingling or numbness around the mouth, face and limbs, then
            difficulty breathing. Severe cases can stop breathing within 12 hours —
            get to a hospital immediately.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Fish, squid, shrimp and crab from the same water are generally safe to
            eat if they are fresh, have their gills and intestines removed, and are
            washed under running water before cooking.
          </p>

          <div className="mt-4 rounded-lg border-l-2 border-accent/60 bg-ink-3 p-3">
            <p className="text-xs font-semibold text-paper/85">
              This app is a community early-warning tool, not an official advisory.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Only the Bureau of Fisheries and Aquatic Resources (BFAR) can confirm
              a red tide through laboratory testing. Reports here are reviewed by a
              local admin and are meant to get a warning out faster, not to replace
              the BFAR shellfish bulletin.
            </p>
          </div>

          <p className="mt-4 font-mono text-[10px] leading-relaxed text-faint">
            Zone outlines on this map are approximate and drawn for demonstration —
            they are not official fisheries boundaries.
          </p>
        </section>

        <div className="mt-3">
          <DemoBanner />
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          <p>Legend order: {ZONE_STATUS_ORDER.map((status) => status).join(' · ')}</p>
          <Link to="/admin" className="transition-colors hover:text-accent">
            Admin review →
          </Link>
        </footer>
      </main>

      {heldZone && (
        <ReportForm
          key={heldZone.id}
          zone={heldZone}
          open={Boolean(reportZone)}
          onClose={closeReportForm}
          onDismissed={() => setHeldZone(null)}
        />
      )}

      <Notice />
    </div>
  )
}
