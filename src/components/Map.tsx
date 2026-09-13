import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Polygon, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import { MAP_CENTER, MAP_DEFAULT_ZOOM, MAP_MAX_BOUNDS, zonesBoundingBox } from '../data/zones'
import { zonePaint } from '../styles/statusTheme'
// `LatLng` here is our own [lat, lng] tuple, which Leaflet accepts directly.
import type { LatLng, Zone } from '../types'
import { ZonePopup } from './ZonePopup'

export interface MapProps {
  zones: Zone[]
  /** zoneId → number of pending reports, for the popup hint. */
  pendingCounts: Record<string, number>
  selectedZoneId: string | null
  /** Bump this to re-fit the view on every zone (the "Reset view" button). */
  resetToken: number
  /** Zone to zoom to when it is picked from the list below the map. */
  focusZoneId: string | null
  /** Bump this together with `focusZoneId` to trigger the zoom. */
  focusToken: number
  onSelectZone: (zoneId: string) => void
  onReport: (zoneId: string) => void
}

/** Fits the map to the zones the first time they arrive. */
function FitToBounds({
  box,
  resetToken,
}: {
  box: [LatLng, LatLng] | null
  resetToken: number
}) {
  const map = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (!box) return
    if (hasFitted.current && resetToken === 0) return
    hasFitted.current = true
    map.fitBounds(box, { padding: [28, 28], maxZoom: 12 })
  }, [box, map, resetToken])

  return null
}

/**
 * Zooms to a single zone, but only when a focus was explicitly requested
 * (the list below the map bumps `token`).
 *
 * Gating on the token matters: tapping a polygon on the map also sets
 * `selectedZoneId`, which changes the `zone` prop. Without the token guard
 * every map tap would re-fit the view and yank the popup out from under the
 * user's finger.
 */
function FocusZone({ zone, token }: { zone: Zone | null; token: number }) {
  const map = useMap()
  const lastToken = useRef(0)

  useEffect(() => {
    if (!zone || token === 0 || token === lastToken.current) return
    lastToken.current = token
    const focusBox = zonesBoundingBox([zone.polygon])
    if (focusBox) map.fitBounds(focusBox, { padding: [56, 56], maxZoom: 13 })
  }, [zone, token, map])

  return null
}

/**
 * Lights the polygon under the pointer from the moment the press starts.
 *
 * Thin SVG strokes have a slow `fill-opacity` ramp (200ms, see index.css), and
 * the whole point of that ramp is that it plays *before* the popup opens. On
 * mouse it does: `mouseover` arrives well ahead of `click`. On touch it does
 * not — Leaflet's container listens for mouse events only, so a tap is
 * delivered as a synthesised mouseover/mousedown/mouseup/click burst at
 * `touchend`, 110ms+ after the finger actually landed. Measured in this app:
 * touchdown t=18ms, the layer's first event t=131ms.
 *
 * So the press state comes from the native `pointerdown`, which does fire with
 * the touch. The listener is delegated on the map container and runs in the
 * capture phase, so it cannot be affected by — and cannot affect — Leaflet's
 * own event plumbing. It only toggles a class; the ramp stays in CSS.
 *
 * A press that turns into a pan is released as soon as the pointer travels past
 * the slop, so dragging the map across a polygon does not leave it lit.
 */
function ZonePressFeedback() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    let pressed: SVGPathElement | null = null
    let origin: { x: number; y: number } | null = null

    function cleanup() {
      pressed?.classList.remove('zone-path--pressed')
      pressed = null
      origin = null
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
    }

    function onPointerMove(event: PointerEvent) {
      if (!origin) return
      // A few pixels of finger jitter must not cancel the press; anything
      // further is a map pan, not a tap.
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) {
        cleanup()
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof SVGPathElement)) return
      if (!target.classList.contains('zone-path')) return
      cleanup()
      pressed = target
      origin = { x: event.clientX, y: event.clientY }
      target.classList.add('zone-path--pressed')
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', cleanup)
      window.addEventListener('pointercancel', cleanup)
    }

    container.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true })
      cleanup()
    }
  }, [map])

  return null
}

/**
 * The public map: one Leaflet polygon per zone, coloured by status, with a
 * popup that carries the "Report something here" call to action.
 *
 * THE BASE LAYER
 * --------------
 * This component is the map page's persistent base layer: it is mounted once,
 * behind the sheet, and never unmounts as the sheet moves. Leaflet measures its
 * container on mount and positions every pane with transforms, so the only thing
 * allowed to transform it is the *underlay wrapper* in MapPage — and that wrapper
 * deliberately starts at `scale(1)` at the peek anchor, so the initial
 * measurement happens on an untransformed box. Leaflet 1.9's `getScale()` reads
 * `getBoundingClientRect()` against `offsetWidth`, so a scaled container still
 * maps pointer coordinates correctly once it does recede.
 *
 * ATTRIBUTION
 * -----------
 * `attributionControl={false}`: the control is pinned to the bottom-right of the
 * map, which is underneath the sheet at every anchor. OSM attribution is a
 * licence requirement, so it lives on the sheet instead: a compact `© OSM` link
 * in the always-visible peek row, with the full credit in the sheet footer
 * (ZoneSheet.tsx).
 */
export function Map({
  zones,
  pendingCounts,
  selectedZoneId,
  resetToken,
  focusZoneId,
  focusToken,
  onSelectZone,
  onReport,
}: MapProps) {
  const box = useMemo(
    () => zonesBoundingBox(zones.map((zone) => zone.polygon)),
    [zones],
  )
  const focusZone = useMemo(
    () => zones.find((zone) => zone.id === focusZoneId) ?? null,
    [zones, focusZoneId],
  )

  // Hover drives the polygon's fill up a step so the popup lands on a lit
  // polygon. On a phone this alone is not enough: Leaflet forwards only *mouse*
  // events to layers, so a tap delivers mouseover, mousedown and click in one
  // batch when the finger lifts (measured within 4ms of each other, ~113ms after
  // touchdown) and the ramp has no head start. `<ZonePressFeedback/>` covers
  // that window from the native `pointerdown`.
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null)

  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={MAP_DEFAULT_ZOOM}
      maxBounds={MAP_MAX_BOUNDS}
      scrollWheelZoom
      // Zoom buttons are moved to the top-right and hidden on phones (see
      // index.css): the header overlay occupies the top of the screen, and
      // pinch-zoom is the expected gesture on a touch device anyway.
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <ZoomControl position="topright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitToBounds box={box} resetToken={resetToken} />
      <FocusZone zone={focusZone} token={focusToken} />
      <ZonePressFeedback />

      {zones.map((zone) => {
        const paint = zonePaint(zone.status)
        const isSelected = zone.id === selectedZoneId
        const isHovered = zone.id === hoveredZoneId

        return (
          <Polygon
            key={zone.id}
            positions={zone.polygon}
            pathOptions={{
              color: paint.hex,
              fillColor: paint.hex,
              weight: isSelected ? paint.weightSelected : paint.weight,
              opacity: 0.95,
              // The ramp itself. Leaflet writes these as attributes and the
              // transition on `.zone-path` does the interpolating — see
              // `zonePaint` in styles/statusTheme.ts for why it is a sequence.
              fillOpacity: isSelected
                ? paint.fillSelected
                : isHovered
                  ? paint.fillHover
                  : paint.fill,
              dashArray: paint.dashArray,
              // Hooks for the CSS transition and press feedback, plus a stable
              // class for tests. The `--selected` modifier exists so the CSS
              // press rule can exempt the current selection: pressing an
              // already-selected polygon must never dim it below its selected
              // fill, least of all for an advisory.
              className: isSelected
                ? 'zone-path zone-path--selected'
                : 'zone-path',
            }}
            eventHandlers={{
              click: () => onSelectZone(zone.id),
              mouseover: () => setHoveredZoneId(zone.id),
              mouseout: () =>
                setHoveredZoneId((current) => (current === zone.id ? null : current)),
            }}
          >
            <Popup
              // The class lands on Leaflet's `.leaflet-popup` container and is
              // what lets index.css tint the card, tip and glow per status.
              className={`zone-popup zone-popup--${zone.status}`}
              maxWidth={340}
              minWidth={260}
              autoPanPadding={[16, 16]}
            >
              <ZonePopup
                zone={zone}
                pendingCount={pendingCounts[zone.id] ?? 0}
                onReport={() => onReport(zone.id)}
              />
            </Popup>
          </Polygon>
        )
      })}
    </MapContainer>
  )
}
