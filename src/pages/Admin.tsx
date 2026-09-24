import { LiveDataStatus } from '../components/LiveDataStatus'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { AdminGate } from '../components/AdminGate'
import { DemoBanner } from '../components/DemoBanner'
import { Header } from '../components/Header'
import { Notice } from '../components/Notice'
import { ReportQueueSkeleton } from '../components/LoadingState'
import { ReportCard } from '../components/ReportCard'
import { ZoneStatusBadge } from '../components/StatusBadge'
import { ZONE_STATUS_META } from '../lib/status'
import { zoneTheme } from '../styles/statusTheme'
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

const ADMIN_CONTAINER =
  'w-full max-w-3xl px-5 min-[400px]:px-6 md:max-w-4xl md:px-8 lg:max-w-6xl xl:max-w-7xl xl:px-10 2xl:max-w-[100rem] 2xl:px-12'
const REPORT_GRID = 'grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3'

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
  const reportsReady = useAppStore((state) => state.reportsReady)
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
      <LiveDataStatus admin />
      <Header
        containerClassName={ADMIN_CONTAINER}
        eyebrow="Red Tide PPC"
        title="Report review"
        right={
          <>
            <Link
              to="/map"
              className="rounded-md border border-line bg-ink-3 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/75 transition-colors hover:border-accent/40 hover:text-accent"
            >
              Public map
            </Link>
            <button
              type="button"
              onClick={lockAdmin}
              className="rounded-md border border-line bg-ink-3 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/75 transition-colors hover:border-advisory/40 hover:text-advisory"
            >
              Lock
            </button>
          </>
        }
      />
      <main className={`mx-auto pb-16 pt-5 sm:pt-7 ${ADMIN_CONTAINER}`}>
        <div className="mb-5"><DemoBanner /></div>
        <div className="mb-5 grid grid-cols-3 gap-3 md:gap-4">
          <Stat label="Pending" value={pendingReports.length} tone="amber" />
          <Stat label="Under advisory" value={advisoryZones.length} tone="red" />
          <Stat label="Total reports" value={reports.length} tone="slate" />
        </div>

        <div
          role="tablist"
          aria-label="Admin sections"
          className="flex gap-1 rounded-xl border border-line bg-ink-2 p-1"
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
                className={`flex-1 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-200 ${
                  isActive
                    ? 'bg-accent text-ink'
                    : 'text-muted hover:bg-white/5 hover:text-paper'
                }`}
              >
                {entry.label}
                {entry.id === 'pending' && pendingReports.length > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${isActive ? 'bg-ink/20 text-ink' : 'bg-accent text-ink'}`}>
                    {pendingReports.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {tab === 'pending' && (
          <section className="mt-5" aria-label="Pending reports">
            {!reportsReady ? (
              <ReportQueueSkeleton className={REPORT_GRID} />
            ) : pendingReports.length === 0 ? (
              <EmptyState
                title="Nothing waiting for review"
                body="New community reports will show up here as soon as they are submitted."
              />
            ) : (
              <>
                <p className="mb-3 text-xs leading-relaxed text-muted">
                  Approving confirms the report and puts its zone under advisory
                  immediately. Rejecting dismisses the report and leaves the zone
                  unchanged.
                </p>
                <AnimatePresence initial={false}>
                  <ul className={REPORT_GRID}>
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
                </AnimatePresence>
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
              <AnimatePresence initial={false}>
                <ul className={REPORT_GRID}>
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
              </AnimatePresence>
            )}
          </section>
        )}

        {tab === 'zones' && (
          <section className="mt-5" aria-label="Zone status control">
            <p className="mb-3 text-xs leading-relaxed text-muted">
              Zone status only changes here — there is no automatic expiry. Revert
              a zone to <strong>Safe</strong> yourself once the water is cleared.
            </p>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zones.map((zone) => {
                const busy = busyZoneId === zone.id

                return (
                  <li
                    key={zone.id}
                    className="min-w-0 rounded-xl border border-line bg-ink-2 p-4 lg:p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display text-lg leading-none text-paper">
                          {zone.name}
                        </h3>
                        <p className="mt-1 font-mono text-[10px] text-faint">
                          {pendingCounts[zone.id] ?? 0} pending · id{' '}
                          <span className="font-mono">{zone.id}</span>
                        </p>
                      </div>
                      <ZoneStatusBadge status={zone.status} size="sm" />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {ZONE_STATUS_CHOICES.map((status) => {
                        const meta = ZONE_STATUS_META[status]
                        const theme = zoneTheme(status)
                        const isActive = zone.status === status

                        return (
                          <button
                            key={status}
                            type="button"
                            disabled={busy}
                            onClick={() => setZoneStatus(zone.id, status)}
                            aria-pressed={isActive}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${
                              isActive
                                ? theme.solidClass
                                : 'border border-line text-muted hover:border-accent/40 hover:text-accent'
                            }`}
                          >
                            {isActive && (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-ink/45"
                                aria-hidden="true"
                              />
                            )}
                            {meta.label}
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

        <p className="mt-8 rounded-lg border border-line bg-ink-2 p-3 font-mono text-[10px] leading-relaxed text-faint">
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
      ? 'text-accent'
      : tone === 'red'
        ? 'text-advisory'
        : 'text-paper/80'

  return (
    <div className="min-w-0 rounded-xl border border-line bg-ink-2 p-3 lg:p-5">
      {/* Bebas Neue for the number: at a glance, the count is what an admin
          needs, and the condensed face reads larger in the same space. */}
      <p className={`font-display text-3xl leading-none tabular-nums lg:text-5xl ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-ink-2 p-8 text-center">
      <p className="font-display text-xl leading-none text-paper">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
        {body}
      </p>
    </div>
  )
}
