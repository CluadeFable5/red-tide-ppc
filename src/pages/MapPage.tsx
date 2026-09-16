import { LiveDataStatus } from '../components/LiveDataStatus'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { RegistrationMarks, Scanline, TideGauge } from '../components/Ambient'
import { DemoBanner } from '../components/DemoBanner'
import { Header } from '../components/Header'
import { Legend } from '../components/Legend'
import { MapLoadingOverlay } from '../components/LoadingState'
import { Map } from '../components/Map'
import { Notice } from '../components/Notice'
import { ReportForm } from '../components/ReportForm'
import { ZoneSheet } from '../components/ZoneSheet'
import { useZoneSheet } from '../motion/useZoneSheet'
import { selectPendingCountByZone, selectZoneById, useAppStore } from '../store'
import type { Zone, ZoneStatus } from '../types'

/**
 * The public view.
 *
 * LAYERS (back to front)
 * ----------------------
 *  1. The map, `fixed inset-0 h-[100dvh]` — the persistent base layer. It is
 *     never unmounted and never re-created; every other element floats over it.
 *  2. The map's *underlay* wrapper, which scales/rounds/darkens the map as the
 *     sheet rises. This is what makes the sheet read as a surface sliding over
 *     the map instead of a panel glued to the bottom of the screen.
 *  3. Floating chrome: the app bar, the status pill row, the advisory gauge.
 *  4. The zone sheet, at peek / mid / full.
 *  5. Modals: the report form, then toasts.
 *
 * There is no page scroll. Everything that used to live below the fold (the
 * advisory banner, the zone list, the red-tide primer, the demo notice) lives in
 * the sheet, which is why the zones are now two gestures away instead of a scroll
 * away, and why the map is no longer capped at a slice of the viewport.
 *
 * The store calls below are unchanged — this page still reads zones/reports and
 * calls the same actions. Only the presentation moved.
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

  // One controller for the sheet and the map underlay: they read the same
  // progress value, so they can never disagree mid-drag.
  const sheet = useZoneSheet('peek')

  const pendingCounts = useMemo(
    () => selectPendingCountByZone(reports),
    [reports],
  )

  const pendingTotal = useMemo(
    () => Object.values(pendingCounts).reduce((total, count) => total + count, 0),
    [pendingCounts],
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
    // Picking a zone from the list zooms the map out of sight under the sheet,
    // so drop the sheet back to peek to actually show it. Without this the list
    // is a dead end: you tap a zone and nothing appears to happen.
    if (sheet.anchor !== 'peek') sheet.goTo('peek')
  }

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-ink">
      <LiveDataStatus />
      {/* ------------------------------------------------------------------
          Layer 1 + 2: the map and its underlay.
          The recede is driven entirely by the sheet's progress value — scale
          to 0.96, corner radius up to 18px, veil and inset shadow in — so the
          whole thing is continuous through a drag rather than snapping at the
          end of it.
          ------------------------------------------------------------------ */}
      <motion.div
        style={{
          scale: sheet.underlay.scale,
          borderRadius: sheet.underlay.radius,
          transformOrigin: '50% 50%',
        }}
        className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-ink will-change-transform"
      >
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

        <Scanline />
        <RegistrationMarks />

        {/* Veil: pushes the map back rather than just shrinking it. */}
        <motion.span
          aria-hidden="true"
          style={{ opacity: sheet.underlay.veil }}
          className="pointer-events-none absolute inset-0 bg-ink"
        />
        {/* Inset shadow: the depth cue the veil cannot give — the sheet is
            casting onto the surface it is covering. Opacity-only, so this
            never repaints a shadow during a drag. */}
        <motion.span
          aria-hidden="true"
          style={{ opacity: sheet.underlay.shadow }}
          className="pointer-events-none absolute inset-0 shadow-[inset_0_-36px_64px_-30px_rgba(0,0,0,0.95)]"
        />
      </motion.div>

      {/* ------------------------------------------------------------------
          Layer 3: floating chrome. Unchanged controls, plus the legend and
          gauge, which fade out as the sheet rises instead of being covered.
          ------------------------------------------------------------------ */}
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

      <Legend counts={statusCounts} style={{ opacity: sheet.chromeOpacity }} />

      <TideGauge
        advisory={statusCounts.advisory}
        zones={zones.length}
        pending={pendingTotal}
        style={{ opacity: sheet.chromeOpacity }}
      />

      {!zonesReady && <MapLoadingOverlay />}

      {/* ------------------------------------------------------------------
          Layer 4: the sheet itself.
          ------------------------------------------------------------------ */}
      <ZoneSheet
        zones={zones}
        zonesReady={zonesReady}
        pendingCounts={pendingCounts}
        counts={statusCounts}
        selectedZoneId={selectedZoneId}
        sheet={sheet}
        onFocusZone={focusZone}
        onReport={openReportForm}
      />

      {/* ------------------------------------------------------------------
          Layer 5: modals.
          ------------------------------------------------------------------ */}
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
