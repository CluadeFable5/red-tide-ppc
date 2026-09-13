import { ZONE_STATUS_ORDER } from '../lib/status'
import { zoneLabel, zoneTheme } from '../styles/statusTheme'
import type { ZoneStatus } from '../types'

/**
 * Persistent map key.
 *
 * Deliberately NOT a modal or a toggle: the whole point is that a user glancing
 * at the map can always answer "what does amber mean?" without tapping
 * anything. It sits bottom-left over the map at every breakpoint.
 *
 * Layout notes for 375px:
 *  - three equal columns; the label uses Bebas Neue, which is condensed enough
 *    that "UNCONFIRMED" fits in a ~110px column without truncating
 *  - counts are JetBrains Mono so the digits stay column-aligned as they change
 *  - `pointer-events-none` on the wrapper and `auto` on the card, so the
 *    surrounding strip does not swallow map drags
 */
export function Legend({ counts }: { counts: Record<ZoneStatus, number> }) {
  // `bottom-6` on phones clears Leaflet's attribution strip, which is legally
  // required and sits at bottom-right.
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-6 z-[1010] flex justify-start sm:bottom-3">
      <div
        className="pointer-events-auto w-full overflow-hidden rounded-xl border border-line bg-ink-2/88 backdrop-blur-md sm:w-auto"
        role="group"
        aria-label="Zone status key"
      >
        <div className="grid grid-cols-3 divide-x divide-line/70">
          {ZONE_STATUS_ORDER.map((status) => (
            <LegendCell
              key={status}
              status={status}
              count={counts[status] ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LegendCell({ status, count }: { status: ZoneStatus; count: number }) {
  const theme = zoneTheme(status)
  const label = zoneLabel(status)

  return (
    <div className="flex items-center gap-2 px-3 py-2 sm:px-3.5">
      {/* The chip carries the pulse for `unconfirmed`, so the "keep watching"
          state draws the eye even when nobody is reading the labels. */}
      <span className="relative grid h-2.5 w-2.5 shrink-0 place-items-center">
        <span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: theme.hex }}
          aria-hidden="true"
        />
        {theme.pulses && (
          <span
            className="animate-status-pulse absolute inset-0 rounded-full"
            style={{ backgroundColor: theme.hex }}
            aria-hidden="true"
          />
        )}
      </span>

      <span className="min-w-0">
        <span
          className="block font-mono text-[13px] leading-none tabular-nums"
          style={{ color: theme.hex }}
        >
          {count}
        </span>
        <span className="font-display mt-0.5 block truncate text-[11px] leading-none text-muted">
          {label}
        </span>
      </span>
    </div>
  )
}
