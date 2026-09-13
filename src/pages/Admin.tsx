import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminGate } from '../components/AdminGate'
import { DemoBanner } from '../components/DemoBanner'
import { Header } from '../components/Header'
import { Notice } from '../components/Notice'
import { ReportCard } from '../components/ReportCard'
import { ZoneStatusBadge } from '../components/StatusBadge'
import { ZONE_STATUS_META } from '../lib/status'
import {
  selectPendingCountByZone,
  selectPendingReports,
  selectReviewedReports,
  useAppStore,
  zoneNameFor,
} from '../store'
import type { ZoneStatus } from '../types'

type Tab = 'pending' | 'reviewed' | 'zones'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'zones', label: 'Zones' },
]

const ZONE_STATUS_CHOICES: ZoneStatus[] = ['safe', 'unconfirmed', 'advisory']

/**
 * /admin — passcode-gated review queue.
 *
 * Approving a report confirms it AND flips its zone to `advisory`. Rejecting
 * only marks the report; the zone is left exactly as it was.
 */
export function Admin() {
  const adminUnlocked = useAppStore((state) => state.adminUnlocked)
  return adminUnlocked ? <AdminDashboard /> : <AdminGate />
}

function AdminDashboard() {
  const zones = useAppStore((state) => state.zones)
  const reports = useAppStore((state) => state.reports)
  const busyReportId = useAppStore((state) => state.busyReportId)
  const busyZoneId = useAppStore((state) => state.busyZoneId)
  const approveReport = useAppStore((state) => state.approveReport)
  const rejectReport = useAppStore((state) => state.rejectReport)
  const setZoneStatus = useAppStore((state) => state.setZoneStatus)
  const lockAdmin = useAppStore((state) => state.lockAdmin)

  const [tab, setTab] = useState<Tab>('pending')

  const pendingReports = useMemo(() => selectPendingReports(reports), [reports])
  const reviewedReports = useMemo(() => selectReviewedReports(reports), [reports])
  const pendingCounts = useMemo(
    () => selectPendingCountByZone(reports),
    [reports],
  )
  const advisoryZones = zones.filter((zone) => zone.status === 'advisory')

  return (
    <div className="min-h-full">
      <Header
        eyebrow="Red Tide PPC"
        title="Report review"
        right={
          <>
            <Link
              to="/"
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Public map
            </Link>
            <button
              type="button"
              onClick={lockAdmin}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Lock
            </button>
          </>
        }
      />
      <DemoBanner />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pending" value={pendingReports.length} tone="amber" />
          <Stat label="Under advisory" value={advisoryZones.length} tone="red" />
          <Stat label="Total reports" value={reports.length} tone="slate" />
        </div>

        <div
          role="tablist"
          aria-label="Admin sections"
          className="mt-6 flex gap-1 rounded-xl bg-slate-200/70 p-1"
        >
          {TABS.map((entry) => {
            const isActive = entry.id === tab
            return (
              <button
                key={entry.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {entry.label}
                {entry.id === 'pending' && pendingReports.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                    {pendingReports.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {tab === 'pending' && (
          <section className="mt-5" aria-label="Pending reports">
            {pendingReports.length === 0 ? (
              <EmptyState
                title="Nothing waiting for review"
                body="New community reports will show up here as soon as they are submitted."
              />
            ) : (
              <>
                <p className="mb-3 text-xs leading-relaxed text-slate-500">
                  Approving confirms the report and puts its zone under advisory
                  immediately. Rejecting dismisses the report and leaves the zone
                  unchanged.
                </p>
                <ul className="space-y-3">
                  {pendingReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      zoneName={zoneNameFor(zones, report.zoneId)}
                      busy={busyReportId === report.id}
                      onApprove={() => approveReport(report.id)}
                      onReject={() => rejectReport(report.id)}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {tab === 'reviewed' && (
          <section className="mt-5" aria-label="Reviewed reports">
            {reviewedReports.length === 0 ? (
              <EmptyState
                title="No reviewed reports yet"
                body="Reports you approve or reject are archived here."
              />
            ) : (
              <ul className="space-y-3">
                {reviewedReports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    zoneName={zoneNameFor(zones, report.zoneId)}
                    busy={false}
                    onApprove={() => approveReport(report.id)}
                    onReject={() => rejectReport(report.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'zones' && (
          <section className="mt-5" aria-label="Zone status control">
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Zone status only changes here — there is no automatic expiry. Revert
              a zone to <strong>Safe</strong> yourself once the water is cleared.
            </p>
            <ul className="space-y-3">
              {zones.map((zone) => {
                const busy = busyZoneId === zone.id

                return (
                  <li
                    key={zone.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900">
                          {zone.name}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {pendingCounts[zone.id] ?? 0} pending · id{' '}
                          <span className="font-mono">{zone.id}</span>
                        </p>
                      </div>
                      <ZoneStatusBadge status={zone.status} size="sm" />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {ZONE_STATUS_CHOICES.map((status) => {
                        const meta = ZONE_STATUS_META[status]
                        const isActive = zone.status === status

                        return (
                          <button
                            key={status}
                            type="button"
                            disabled={busy}
                            onClick={() => setZoneStatus(zone.id, status)}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              isActive
                                ? meta.badgeClass
                                : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {isActive ? `● ${meta.label}` : meta.label}
                          </button>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <p className="mt-8 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 ring-1 ring-inset ring-slate-200">
          This view is protected by a client-side passcode only. Anyone with the
          page source can read it, so treat the passcode as a demo lock — not
          security. Replace it with Firebase Auth before this is used for real
          advisories.
        </p>
      </main>

      <Notice />
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'amber' | 'red' | 'slate'
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-600'
      : tone === 'red'
        ? 'text-advisory'
        : 'text-slate-700'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
        {body}
      </p>
    </div>
  )
}
