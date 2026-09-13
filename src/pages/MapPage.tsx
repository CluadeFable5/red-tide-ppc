import { useMemo, useState } from 'react'
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
import type { ZoneStatus } from '../types'

/**
 * The public view: map first, then a tappable zone list for phones, then a
 * short plain-English explainer of what red tide actually is.
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

  function focusZone(zoneId: string) {
    selectZone(zoneId)
    setFocusToken((token) => token + 1)
  }

  return (
    <div className="min-h-full">
      <Header
        eyebrow="Puerto Princesa, Palawan"
        title="Red Tide Advisory Map"
        right={
          <Link
            to="/admin"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Admin
          </Link>
        }
      />
      <DemoBanner />

      <section className="relative h-[56vh] min-h-[340px] w-full border-b border-slate-200 sm:h-[60vh]">
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

        {!zonesReady && (
          <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-sm">
            <p className="text-sm font-medium text-slate-600">Loading zones…</p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
          <Legend counts={statusCounts} />
        </div>

        <button
          type="button"
          onClick={() => setResetToken((token) => token + 1)}
          className="pointer-events-auto absolute right-3 top-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md backdrop-blur transition hover:bg-white"
        >
          Reset view
        </button>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {advisoryCount > 0 ? (
          <div className="rounded-xl bg-red-50 p-4 ring-1 ring-inset ring-red-200">
            <h2 className="text-sm font-bold text-red-800">
              {advisoryCount} {advisoryCount === 1 ? 'zone is' : 'zones are'} under
              advisory
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-red-700">
              Do not gather, sell or eat shellfish or <em>alamang</em> from a zone
              marked <strong>Advisory</strong>. Fish, squid, shrimp and crab are
              still safe if they are fresh, cleaned and washed before cooking.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-green-50 p-4 ring-1 ring-inset ring-green-200">
            <h2 className="text-sm font-bold text-green-800">
              No advisories recorded right now
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-green-700">
              Nothing is currently flagged. Tap a zone on the map and report what
              you see — water colour, dead shellfish, or anyone feeling numb after
              eating seafood.
            </p>
          </div>
        )}

        <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">
          Zones ({zones.length})
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {zones.map((zone) => {
            const pending = pendingCounts[zone.id] ?? 0
            const isSelected = zone.id === selectedZoneId

            return (
              <li
                key={zone.id}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${
                  isSelected ? 'border-ocean ring-2 ring-ocean/20' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => focusZone(zone.id)}
                  className="block w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold leading-tight text-slate-900">
                      {zone.name}
                    </h3>
                    <ZoneStatusBadge status={zone.status} size="sm" />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
                    {zone.description}
                  </p>
                  {pending > 0 && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700">
                      {pending} pending {pending === 1 ? 'report' : 'reports'}
                    </p>
                  )}
                </button>
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => openReportForm(zone.id)}
                    className="text-xs font-semibold text-ocean hover:underline"
                  >
                    Report something here →
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        {zones.length === 0 && zonesReady && (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No zones found. Run <code className="font-mono">npm run seed</code> to
            load the Puerto Princesa zones.
          </p>
        )}

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">
            What is red tide? <span className="font-normal text-slate-400">/ “pula ang dagat”</span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            A <strong>red tide</strong> is a bloom of microscopic algae that can
            turn seawater reddish-brown, though the water does not always change
            colour. Some of these organisms produce <strong>saxitoxin</strong>.
            Shellfish — <em>tahong</em> (mussels), <em>talaba</em> (oysters),{' '}
            <em>halaan</em> (clams) and <em>alamang</em> — filter seawater to feed,
            so the toxin builds up inside them.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Eating contaminated shellfish causes <strong>Paralytic Shellfish
            Poisoning (PSP)</strong>. Cooking, boiling or vinegar does{' '}
            <strong>not</strong> destroy the toxin, and there is no antidote.
            Symptoms usually start within 30 minutes to 2 hours: tingling or
            numbness around the mouth, face and limbs, then difficulty breathing.
            Severe cases can stop breathing within 12 hours — get to a hospital
            immediately.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Fish, squid, shrimp and crab from the same water are generally safe to
            eat if they are fresh, have their gills and intestines removed, and are
            washed under running water before cooking.
          </p>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
            <p className="font-semibold text-slate-700">
              This app is a community early-warning tool, not an official advisory.
            </p>
            <p className="mt-1">
              Only the Bureau of Fisheries and Aquatic Resources (BFAR) can confirm
              a red tide through laboratory testing. Reports here are reviewed by a
              local admin and are meant to get a warning out faster, not to replace
              the BFAR shellfish bulletin.
            </p>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Zone outlines on this map are approximate and drawn for demonstration —
            they are not official fisheries boundaries.
          </p>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
          <p>Legend order: {ZONE_STATUS_ORDER.map((status) => status).join(' · ')}</p>
          <Link to="/admin" className="font-semibold text-slate-500 hover:underline">
            Admin review →
          </Link>
        </footer>
      </main>

      {reportZone && (
        <ReportForm zone={reportZone} onClose={closeReportForm} />
      )}

      <Notice />
    </div>
  )
}
