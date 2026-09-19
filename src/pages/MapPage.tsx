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
 *  4. The zone sheet, at peek / mid / full — detents 15% / 50% / 88%.
 *  5. Modals: the report form, then toasts.
 *
 * MAP INTERACTIVITY PER STATE
 * ---------------------------
 * peek (15%): map 85% visible, fully interactive — pan/zoom/tap zones.
 * mid (50%): map 50% visible, interactive in top half. User can scan list
 *   while still panning map.
 * full (88%): map NOT interactive — veil + scale + blocking overlay. List
 *   scrolls internally, sheet caps at 88vh. Tapping map strip collapses to mid.
 *   This matches native map apps: at full, focus is list, map is depth cue.
 *
 * There is no page scroll. Everything that used to live below the fold lives
 * in the sheet, which is why the zones are now two gestures away instead of a
 * scroll away, and why the map is no longer capped at a slice of the viewport.
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
  // Shipping-channel overlay (PCG PPTSS lines): OFF by default — a secondary
  // safety reference that must not compete with the advisory zones. Local UI
  // state on purpose: not app data, nothing to persist or sync.
  const [shippingLanesVisible, setShippingLanesVisible] = useState(false)
  // One-time discoverability hint for the overlay toggle: the ship glyph is
  // icon-only, and "PCG shipping lane" is not guessable from an icon. Shown
  // once (localStorage-gated), auto-dismisses, and toggling the layer
  // dismisses it too.
  const [shippingHintOpen, setShippingHintOpen] = useState(() => {
    try {
      return localStorage.getItem('red-tide-ppc:hint:shipping:v1') !== 'dismissed'
    } catch {
      return false // no storage — stay quiet rather than nag every load
    }
  })
  useEffect(() => {
    if (!shippingHintOpen) return
    const timer = window.setTimeout(() => dismissShippingHint(), 9_000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingHintOpen])

  function dismissShippingHint() {
    setShippingHintOpen(false)
    try {
      localStorage.setItem('red-tide-ppc:hint:shipping:v1', 'dismissed')
    } catch {
      // private mode / storage disabled — dismissal just won't persist
    }
  }

  function toggleShippingLanes() {
    setShippingLanesVisible((visible) => !visible)
    if (shippingHintOpen) dismissShippingHint()
  }

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

  const [heldZone, setHeldZone] = useState<Zone | null>(null)
  useEffect(() => {
    if (reportZone) setHeldZone(reportZone)
  }, [reportZone])

  function focusZone(zoneId: string) {
    selectZone(zoneId)
    setFocusToken((token) => token + 1)
    if (sheet.anchor !== 'peek') sheet.goTo('peek')
  }

  const isMapInteractive = sheet.anchor !== 'full'

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-ink">
      <LiveDataStatus />
      {/* ------------------------------------------------------------------
          Layer 1 + 2: the map and its underlay.
          The recede is driven entirely by the sheet's progress value — scale
          to 0.96, corner radius up to 16px, veil and inset shadow in — so the
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
          shippingLanesVisible={shippingLanesVisible}
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
        {/* Inset shadow: depth cue */}
        <motion.span
          aria-hidden="true"
          style={{ opacity: sheet.underlay.shadow }}
          className="pointer-events-none absolute inset-0 shadow-[inset_0_-36px_64px_-30px_rgba(0,0,0,0.95)]"
        />

        {/* Full-state blocking overlay — map NOT interactive at full */}
        {sheet.anchor === 'full' && (
          <button
            type="button"
            aria-label="Collapse sheet to mid — map is currently not interactive"
            onClick={() => sheet.goTo('mid')}
            className="absolute inset-0 z-10 cursor-pointer bg-transparent"
            style={{ touchAction: 'none' }}
          />
        )}
      </motion.div>

      {/* ------------------------------------------------------------------
          Layer 3: floating chrome.
          - Legend & gauge fade early (before mid) so nothing half-covered.
          - Header fades late (only at full) — visible at mid/peek, hidden at
            full. This avoids stale-chrome: when dragging down from full to
            mid/peek, header fades back in promptly by 70% progress (headerOpacity
            = 1 - (p-0.7)/0.3), so it's fully visible again at mid (p=0.48).
          - pointer-events disabled when faded out at full (via motion value),
            so invisible header can't be tapped, but re-enables once visible.
          ------------------------------------------------------------------ */}
      <motion.div
        style={{
          opacity: sheet.headerOpacity,
          pointerEvents: sheet.headerPointerEvents as any,
        }}
        data-testid="header-chrome"
        data-visible={sheet.anchor === 'full' ? 'false' : 'true'}
      >
        <Header
          overlay
          eyebrow="Puerto Princesa, Palawan"
          title="Red Tide"
          right={
            <>
              <DemoBanner variant="chip" />
              <span className="relative inline-flex">
                <button
                  type="button"
                  onClick={toggleShippingLanes}
                  aria-pressed={shippingLanesVisible}
                  aria-label="Shipping channel overlay — show or hide the port traffic lanes"
                  title="Shipping channel overlay (PCG TSS) — where boats meet ship traffic"
                  className={`grid h-8 min-w-8 place-items-center rounded-md border px-1.5 backdrop-blur-md transition-colors active:scale-95 ${
                    shippingLanesVisible
                      ? 'border-[#2e7cd6] bg-[#2e7cd6]/15 text-[#9cc4f7]'
                      : 'border-line bg-ink-2/85 text-paper/75 hover:border-accent/40 hover:text-accent'
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {/* ship: hull + cargo + waterline */}
                    <path d="M3 17c1.5 1.6 3 1.6 4.5 0s3-1.6 4.5 0 3 1.6 4.5 0 3-1.6 4.5 0" />
                    <path d="M5 13.5 6 8h12l1 5.5" />
                    <path d="M12 8V5m-3 3V6h6v2" />
                  </svg>
                </button>
                {shippingHintOpen && (
                  <span
                    role="status"
                    className="absolute right-0 top-[calc(100%+10px)] z-[1015] w-max max-w-[240px] rounded-lg border border-line bg-ink-2/92 px-3 py-2 text-left shadow-lg backdrop-blur-md"
                  >
                    <span className="block font-display text-[11px] font-semibold leading-snug tracking-[0.02em] text-[#9cc4f7]">
                      New: shipping lane lines
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-paper/75">
                      Where ships transit the port approach — worth knowing before
                      you drift.
                    </span>
                    <button
                      type="button"
                      onClick={dismissShippingHint}
                      className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-paper/60 underline-offset-2 hover:text-paper"
                    >
                      Got it
                    </button>
                  </span>
                )}
              </span>
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
      </motion.div>

      <Legend counts={statusCounts} style={{ opacity: sheet.chromeOpacity }} />

      <TideGauge
        advisory={statusCounts.advisory}
        zones={zones.length}
        pending={pendingTotal}
        style={{ opacity: sheet.chromeOpacity }}
      />

      {!zonesReady && <MapLoadingOverlay />}

      {/* Debug hint for map interactivity — not visible but for tests */}
      <span
        data-testid="map-interactivity"
        data-interactive={isMapInteractive ? 'true' : 'false'}
        className="sr-only"
        aria-hidden="true"
      />

      {/* ------------------------------------------------------------------
          Layer 4: the sheet itself — 15% / 50% / 88% detents.
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
