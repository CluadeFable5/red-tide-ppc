import { ZONE_STATUS_META, ZONE_STATUS_ORDER } from '../lib/status'
import type { ZoneStatus } from '../types'

/**
 * Floating map key. `counts` lets the map page show how many zones are in each
 * state at a glance.
 */
export function Legend({ counts }: { counts: Record<ZoneStatus, number> }) {
  return (
    <div className="pointer-events-auto w-44 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Zone status
      </p>
      <ul className="space-y-1.5">
        {ZONE_STATUS_ORDER.map((status) => {
          const meta = ZONE_STATUS_META[status]
          return (
            <li key={status} className="flex items-center gap-2 text-xs">
              <span
                className="h-3 w-4 shrink-0 rounded-[3px] ring-1 ring-black/10"
                style={{ backgroundColor: meta.hex }}
                aria-hidden="true"
              />
              <span className="flex-1 font-medium text-slate-700">{meta.label}</span>
              <span className="tabular-nums text-slate-400">{counts[status] ?? 0}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
