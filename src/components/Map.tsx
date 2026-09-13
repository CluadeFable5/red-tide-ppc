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

  // Hover drives the polygon's fill up a step *before* the click opens the
  // popup, so the popup lands on a lit polygon. Leaflet synthesises `mouseover`
  // ahead of `click` on touch too, which is what makes this work on a phone.
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
              // Hooks for the CSS transition, and a stable class for tests.
              className: 'zone-path',
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
