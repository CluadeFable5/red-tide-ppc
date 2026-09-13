import { formatDateTime, formatRelative } from '../lib/format'
import { zoneStatusMeta } from '../lib/status'
import type { Zone } from '../types'
import { ZoneStatusBadge } from './StatusBadge'

/** Content of the Leaflet popup shown when a zone polygon is tapped. */
export function ZonePopup({
  zone,
  pendingCount,
  onReport,
}: {
  zone: Zone
  pendingCount: number
  onReport: () => void
}) {
  const meta = zoneStatusMeta(zone.status)

  return (
    <div className="p-4">
      <h3 className="pr-6 text-sm font-bold leading-tight text-slate-900">
        {zone.name}
      </h3>

      <div className="mt-2">
        <ZoneStatusBadge status={zone.status} size="sm" />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-600">{meta.guidance}</p>

      {pendingCount > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          {pendingCount} {pendingCount === 1 ? 'report' : 'reports'} from the
          community waiting for review
        </p>
      )}

      <dl className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <div className="flex items-baseline justify-between gap-2">
          <dt>Last updated</dt>
          <dd className="font-medium text-slate-700">
            {formatRelative(zone.lastUpdated)}
          </dd>
        </div>
        <div className="mt-0.5 text-right text-[10px] text-slate-400">
          {formatDateTime(zone.lastUpdated)} PHT
        </div>
      </dl>

      <button
        type="button"
        onClick={onReport}
        className="mt-3 w-full rounded-lg bg-ocean px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean focus-visible:ring-offset-2 active:scale-[0.99]"
      >
        Report something here
      </button>
    </div>
  )
}
