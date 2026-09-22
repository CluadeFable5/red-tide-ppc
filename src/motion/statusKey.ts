import { ZONE_STATUS_ORDER } from '../lib/status'
import type { ZoneStatus } from '../types'

/**
 * Which status the shared pill indicator should sit on.
 *
 * The selection wins: when a zone is picked, the key lights the status that
 * zone is in — the pill row doubles as "where is my selection on this scale".
 * Otherwise the worst status that actually exists on the map owns the
 * highlight (one advisory anywhere is the thing worth pointing at); and an
 * all-clear map rests on `safe`.
 *
 * Pure function, unit-tested — same policy as `mapMotion.ts`.
 */
export function resolveActiveStatus(
  selectedZoneStatus: ZoneStatus | null,
  counts: Record<ZoneStatus, number>,
): ZoneStatus {
  if (selectedZoneStatus) return selectedZoneStatus
  // ZONE_STATUS_ORDER is worst-first (advisory, unconfirmed, safe).
  for (const status of ZONE_STATUS_ORDER) {
    if ((counts[status] ?? 0) > 0) return status
  }
  return 'safe'
}
