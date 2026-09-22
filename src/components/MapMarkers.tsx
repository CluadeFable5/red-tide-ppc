import { useEffect, useMemo, useRef, useState } from 'react'
import { divIcon } from 'leaflet'
import type { DivIcon } from 'leaflet'
import { Marker, useMap } from 'react-leaflet'
import { polygonCentroid, INTRO_GLIDE_SECONDS, INTRO_GLIDE_SESSION_KEY, INTRO_GLIDE_WIDE_ZOOM } from '../motion/pins'
import { MAP_CENTER, MAP_DEFAULT_ZOOM } from '../data/zones'
import { zoneTheme } from '../styles/statusTheme'
import type { Report, Zone } from '../types'

/**
 * Phase 3 map markers: report pins at zone centroids, the user-location
 * dot, and the once-per-session intro glide.
 *
 * Everything here degrades to "simply not there" when its input is missing:
 * no geolocation permission → no dot; a session that already saw the glide
 * → a normal load; reduced motion → no glide, no drop, no ring.
 */

const PIN_COLORS: Record<Report['status'], string> = {
  pending: zoneTheme('unconfirmed').hex,
  confirmed: zoneTheme('safe').hex,
  rejected: '#8a8f98',
}

/**
 * Report pins. Reports carry only a `zoneId`, so each pin sits on the zone
 * polygon's centroid (computed, never stored).
 *
 * Pins that already existed when the map mounted render plain — a load is
 * not news. Only reports that ARRIVE after mount get the drop-with-overshoot
 * and the single expanding ring; both are one-shot CSS animations on the
 * inserted node, so they can never replay on a re-render (icons are cached
 * per report id — handing Leaflet a fresh DivIcon would reset its DOM).
 */
export function ReportPins({ reports, zones }: { reports: Report[]; zones: Zone[] }) {
  const centroids = useMemo(() => {
    const byZone = new Map<string, [number, number]>()
    for (const zone of zones) byZone.set(zone.id, polygonCentroid(zone.polygon))
    return byZone
  }, [zones])

  // The id set as of first mount — everything in it is "pre-existing".
  const knownAtMount = useRef<Set<string> | null>(null)
  if (knownAtMount.current === null) {
    knownAtMount.current = new Set(reports.map((report) => report.id))
  }

  // Icons cached per id so later report mutations never reset older pins'
  // DOM (a reset would replay the drop on pins that already landed).
  const iconCache = useRef<Map<string, DivIcon>>(new Map())
  const icons = useMemo(() => {
    for (const report of reports) {
      if (iconCache.current.has(report.id)) continue
      const fresh = !knownAtMount.current?.has(report.id)
      const color = PIN_COLORS[report.status]
      iconCache.current.set(
        report.id,
        divIcon({
          className: 'report-pin-wrap',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          html:
            `<span class="report-pin${fresh ? ' report-pin--fresh' : ''}" style="color:${color}">` +
            (fresh ? '<span class="report-ring" aria-hidden="true"></span>' : '') +
            '<span class="report-pin-body" aria-hidden="true"></span></span>',
        }),
      )
    }
    return iconCache.current
  }, [reports])

  return (
    <>
      {reports.map((report) => {
        const at = centroids.get(report.zoneId)
        const icon = icons.get(report.id)
        if (!at || !icon) return null
        return (
          <Marker
            key={report.id}
            position={at}
            icon={icon}
            interactive={false}
            keyboard={false}
            zIndexOffset={200}
          />
        )
      })}
    </>
  )
}

/**
 * The user's position, when — and only when — the browser hands one over.
 * `watchPosition` keeps the dot honest while the person moves; a denied or
 * missing geolocation simply leaves `pos` null and says nothing (no console
 * noise, which matters in the headless pass).
 */
export function UserLocationDot() {
  const [pos, setPos] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    let watchId: number | null = null
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => setPos([position.coords.latitude, position.coords.longitude]),
        () => {
          /* denied / unavailable: no dot, no error surface */
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
      )
    } catch {
      /* geolocation threw synchronously: same outcome as denied */
    }
    return () => {
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId)
        } catch {
          /* already gone */
        }
      }
    }
  }, [])

  const icon = useMemo(
    () =>
      divIcon({
        className: 'loc-wrap',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        html: '<span class="loc-dot"><span class="loc-halo" aria-hidden="true"></span></span>',
      }),
    [],
  )

  if (!pos) return null
  return <Marker position={pos} icon={icon} interactive={false} keyboard={false} zIndexOffset={400} />
}

/**
 * Once per browser session, the camera opens wide on Palawan and glides
 * into the Puerto Princesa bay default view. The sessionStorage flag is set
 * BEFORE the glide starts, so a reload mid-glide never replays it. Reduced
 * motion skips the whole thing — the map just loads at its normal view.
 */
export function IntroGlide() {
  const map = useMap()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    let seen = false
    try {
      seen = sessionStorage.getItem(INTRO_GLIDE_SESSION_KEY) === 'done'
      sessionStorage.setItem(INTRO_GLIDE_SESSION_KEY, 'done')
    } catch {
      /* storage unavailable (private mode quirks): skip the glide quietly */
      return
    }
    if (seen) return

    map.setView(MAP_CENTER, INTRO_GLIDE_WIDE_ZOOM, { animate: false })
    const frame = requestAnimationFrame(() => {
      map.flyTo(MAP_CENTER, MAP_DEFAULT_ZOOM, { duration: INTRO_GLIDE_SECONDS })
    })
    return () => cancelAnimationFrame(frame)
  }, [map])

  return null
}
