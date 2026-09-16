import { useEffect, useMemo, useRef, useState } from 'react'
import { advisoryShare, formatPercent } from '../motion/readouts'
import { selectPendingCountByZone, useAppStore } from '../store'
import { zoneLabel } from '../styles/statusTheme'

/**
 * One announcement channel per page for the same live feeds repeated in stats,
 * legend, gauge, sheet, popup and admin tabs. Do NOT put aria-live on each copy:
 * that repeats the same change many times, and CountUp would announce frames.
 *
 * Mount empty before data arrives (including a cached/synchronous demo feed).
 * Keep the region outside the map's fading chrome and remounted sheet lists.
 * Coalesce the report + zone snapshots of one approval into one polite update.
 * Per-zone changes are included even when aggregate counts stay unchanged.
 */
export function LiveDataStatus({ admin = false }: { admin?: boolean }) {
  const zones = useAppStore((state) => state.zones)
  const reports = useAppStore((state) => state.reports)
  const zonesReady = useAppStore((state) => state.zonesReady)
  const reportsReady = useAppStore((state) => state.reportsReady)
  const [message, setMessage] = useState('')

  const snapshot = useMemo(() => {
    const pendingCounts = selectPendingCountByZone(reports)
    const advisory = zones.filter((zone) => zone.status === 'advisory').length
    const unconfirmed = zones.filter((zone) => zone.status === 'unconfirmed').length
    const safe = zones.filter((zone) => zone.status === 'safe').length
    const pending = Object.values(pendingCounts).reduce((sum, count) => sum + count, 0)
    return {
      summary: [
        zonesReady
          ? `${zones.length} zones watched. ${advisory} under advisory. ${unconfirmed} unconfirmed. ${safe} safe.`
          : 'Zone data loading.',
        reportsReady ? `${pending} pending reports.` : 'Report data loading.',
        zonesReady ? `Advisory signal ${formatPercent(advisoryShare(advisory, zones.length))}.` : '',
        admin && reportsReady ? `${reports.length} total reports. ${reports.length - pending} reviewed reports.` : '',
      ].filter(Boolean).join(' '),
      zones: Object.fromEntries((zonesReady ? zones : []).map((zone) => [zone.id,
        `${zone.name}: ${zoneLabel(zone.status)}. ` +
          (reportsReady ? `${pendingCounts[zone.id] ?? 0} pending reports.` : 'Report data loading.'),
      ])),
    }
  }, [zones, reports, zonesReady, reportsReady, admin])
  const announced = useRef<typeof snapshot | null>(null)

  useEffect(() => {
    if (!zonesReady && !reportsReady) return
    const timer = window.setTimeout(() => {
      const previous = announced.current
      const details: string[] = []
      if (previous) {
        for (const [id, detail] of Object.entries(snapshot.zones)) {
          if (previous.zones[id] !== detail) details.push(detail)
        }
        for (const [id, detail] of Object.entries(previous.zones)) {
          if (!(id in snapshot.zones)) details.push(`Zone removed from watch: ${detail.split(':')[0]}.`)
        }
      }
      // Timestamp/description-only changes must not repeat the last announcement.
      if (!previous || previous.summary !== snapshot.summary || details.length > 0) {
        setMessage([snapshot.summary, ...details].join(' '))
      }
      announced.current = snapshot
    }, 250)
    return () => window.clearTimeout(timer)
  }, [snapshot, zonesReady, reportsReady])

  return (
    <p role="status" aria-live="polite" aria-atomic="true" aria-label="Live coastal data" className="sr-only">
      {message}
    </p>
  )
}
