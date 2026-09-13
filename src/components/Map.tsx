import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Polygon, Popup, TileLayer, useMap } from 'react-leaflet'
import { MAP_CENTER, MAP_DEFAULT_ZOOM, MAP_MAX_BOUNDS, zonesBoundingBox } from '../data/zones'
import { zoneStatusMeta } from '../lib/status'
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

/** Zooms to a single zone when it is picked from the list below the map. */
function FocusZone({ zone, token }: { zone: Zone | null; token: number }) {
  const map = useMap()

  useEffect(() => {
    if (!zone || token === 0) return
    const focusBox = zonesBoundingBox([zone.polygon])
    if (focusBox) map.fitBounds(focusBox, { padding: [56, 56], maxZoom: 13 })
  }, [zone, token, map])

  return null
}

/**
 * The public map: one Leaflet polygon per zone, coloured by status, with a
 * popup that carries the "Report something here" call to action.
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

  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={MAP_DEFAULT_ZOOM}
      maxBounds={MAP_MAX_BOUNDS}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitToBounds box={box} resetToken={resetToken} />
      <FocusZone zone={focusZone} token={focusToken} />

      {zones.map((zone) => {
        const meta = zoneStatusMeta(zone.status)
        const isSelected = zone.id === selectedZoneId

        return (
          <Polygon
            key={zone.id}
            positions={zone.polygon}
            pathOptions={{
              color: meta.hex,
              fillColor: meta.hex,
              weight: isSelected ? 4 : 2,
              opacity: 0.95,
              fillOpacity: isSelected ? 0.5 : 0.28,
              dashArray: zone.status === 'unconfirmed' ? '6 5' : undefined,
            }}
            eventHandlers={{
              click: () => onSelectZone(zone.id),
            }}
          >
            <Popup maxWidth={320} minWidth={250} autoPanPadding={[16, 16]}>
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
