import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as LeafletMap, Polygon as LeafletPolygon } from 'leaflet'
import { useReducedMotion } from 'motion/react'
import { MapContainer, Pane, Polygon, Popup, TileLayer, useMap } from 'react-leaflet'
import { MAP_CENTER, MAP_DEFAULT_ZOOM, MAP_MAX_BOUNDS, zonesBoundingBox } from '../data/zones'
import {
  FOCUS_FLIGHT_SECONDS,
  focusPaddingFor,
  zoneLoadDelayMs,
} from '../motion/mapMotion'
import { ZONE_CASING, zonePaint } from '../styles/statusTheme'
import { IntroGlide, ReportPins, UserLocationDot } from './MapMarkers'
import '../styles/map-motion.css'
// `LatLng` here is our own [lat, lng] tuple, which Leaflet accepts directly.
import type { LatLng, Report, Zone } from '../types'
import { ShippingLayer } from './ShippingLayer'
import { ZonePopup } from './ZonePopup'

export interface MapProps {
  zones: Zone[]
  /** Live report feed — pins land on zone centroids (see MapMarkers.tsx). */
  reports: Report[]
  /** zoneId → number of pending reports, for the popup hint. */
  pendingCounts: Record<string, number>
  selectedZoneId: string | null
  /** Bump this to re-fit the view on every zone (the "Reset view" button). */
  resetToken: number
  /** Zone to zoom to when it is picked from the list below the map. */
  focusZoneId: string | null
  /** Bump this together with `focusZoneId` to trigger the zoom. */
  focusToken: number
  /**
   * Show the shipping-channel (PCG PPTSS) navigation-hazard overlay. Off by
   * default: it is a secondary safety reference, not the app's purpose.
   */
  shippingLanesVisible?: boolean
  /**
   * Right-edge reservation (px) the focus flight must keep clear — the open
   * zone drawer on desktop. MapPage owns the drawer state and passes the
   * matching constant from `motion/mapMotion.ts`.
   */
  focusReserveRight?: number
  /**
   * Hands the live Leaflet instance up once mounted, so the control column
   * can drive zoom from its own buttons (Leaflet's zoom control is not
   * rendered — see below).
   */
  onMapReady?: (map: LeafletMap) => void
  onSelectZone: (zoneId: string) => void
  onReport: (zoneId: string) => void
}

/**
 * Pane for the zone boundary casings. Leaflet's default `overlayPane` sits at
 * z-index 400; this one is created just below it so every casing stroke is
 * painted under every zone fill and status stroke, never over a neighbour's.
 * (Custom panes get their own SVG root, so `.leaflet-overlay-pane path` still
 * selects exactly the interactive zone polygons — the tests rely on that.)
 */
const ZONE_CASING_PANE = 'zoneCasingPane'

/** Publishes the Leaflet instance to the page chrome once the map mounts. */
function MapReadyBridge({
  onMapReady,
}: {
  onMapReady?: (map: LeafletMap) => void
}) {
  const map = useMap()

  useEffect(() => {
    onMapReady?.(map)
  }, [map, onMapReady])

  return null
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
 *
 * CAMERA FLIGHT
 * -------------
 * The move is a `flyToBounds` glide (0.9s) rather than a hard fit: the
 * travel reads as "the map took you there". Padding comes from
 * `focusPaddingFor` — at ≥768px it reserves the right edge for the zone
 * drawer (`reserveRightPx`), so the focused zone never hides behind the
 * panel; on phones the drawer tucks itself on focus (see MapPage), so only
 * the header strip and the attribution pill need clearance. Reduced motion
 * jumps with `fitBounds` instead of flying.
 */
function FocusZone({
  zone,
  token,
  reserveRightPx,
}: {
  zone: Zone | null
  token: number
  reserveRightPx: number
}) {
  const map = useMap()
  const reduceMotion = useReducedMotion()
  const lastToken = useRef(0)

  useEffect(() => {
    if (!zone || token === 0 || token === lastToken.current) return
    lastToken.current = token
    const focusBox = zonesBoundingBox([zone.polygon])
    if (!focusBox) return

    const { paddingTopLeft, paddingBottomRight } = focusPaddingFor(
      map.getSize().x,
      reserveRightPx,
    )
    const fitOptions = {
      paddingTopLeft,
      paddingBottomRight,
      maxZoom: 13,
    }
    if (reduceMotion) {
      map.fitBounds(focusBox, fitOptions)
    } else {
      map.flyToBounds(focusBox, {
        ...fitOptions,
        duration: FOCUS_FLIGHT_SECONDS,
      })
    }
  }, [zone, token, map, reserveRightPx, reduceMotion])

  return null
}

/**
 * The loop gate: pauses every looping map animation while the camera moves.
 *
 * Decorative loops (the advisory stroke pulse, the dash march — and in later
 * phases the location halo) must not compete with pan/zoom for paint time,
 * and freezing them mid-flight is what makes the map feel composed instead
 * of busy. Implementation is a single class on the Leaflet container that
 * CSS's `animation-play-state: paused` keys off (`map-motion.css`): play
 * state — not `animation: none` — so a resumed loop continues from its
 * current phase instead of restarting with a visible jump.
 */
function MapLoopGate() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    const pause = () => {
      container.classList.add('map-motion-paused')
      // Chrome loops (the legend pips' pulse, the advisory drawer's tide
      // trace) live OUTSIDE the Leaflet container, so they key off the same
      // class mirrored on <body> — one gate, every loop.
      document.body.classList.add('map-motion-paused')
    }
    const resume = () => {
      container.classList.remove('map-motion-paused')
      document.body.classList.remove('map-motion-paused')
    }

    map.on('movestart', pause)
    map.on('zoomstart', pause)
    map.on('moveend', resume)
    map.on('zoomend', resume)

    return () => {
      map.off('movestart', pause)
      map.off('zoomstart', pause)
      map.off('moveend', resume)
      map.off('zoomend', resume)
      resume()
    }
  }, [map])

  return null
}

/**
 * Is `target` an SVG `<path>` in the SVG namespace?
 *
 * Duck-typed instead of `instanceof SVGPathElement` — jsdom (where the
 * regression tests run) does not define that global, while `namespaceURI`
 * and `tagName` are spec'd and stable in every environment.
 */
function isZonePath(target: EventTarget | null): target is SVGPathElement {
  return (
    target instanceof Element &&
    target.namespaceURI === 'http://www.w3.org/2000/svg' &&
    target.tagName === 'path'
  )
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
      if (!isZonePath(target)) return
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
 * One zone polygon, with its modifier classes kept in sync imperatively.
 *
 * WHY THE CLASS APPLICATION IS SPLIT IN TWO
 * -----------------------------------------
 * `className="zone-path"` is a *constructor* prop: Leaflet's SVG renderer
 * reads `options.className` exactly once, in `_initPath`, when the path node
 * is created as the layer is added to the map. It never re-applies it — and
 * react-leaflet applies `pathOptions` via `setStyle` *after* the layer exists,
 * and `setStyle` only writes stroke/fill presentation attributes, never the
 * class. So `pathOptions.className` (the old code) silently never reached the
 * DOM in a production single-pass render: it only appeared in dev because
 * StrictMode's double effect invocation re-added the layer, re-running
 * `_initPath` against options that the first `setStyle` had already stored.
 * That is the regression `Map.test.tsx` guards.
 *
 * The runtime modifiers can't be constructor props (they change over the
 * layer's life), so they are toggled on the path element directly from a
 * layer ref. In the normal single pass the path already exists by the time
 * this component's effect runs (children's effects commit before the
 * parent's), but on StrictMode remounts — and any map remount — Leaflet
 * creates a fresh path node: the base class comes back from the constructor
 * options, the imperative modifiers do not, so the `add` subscription
 * re-applies them.
 *
 * THE MODIFIERS
 * -------------
 *  - `--selected`  the current selection (stroke thickens via pathOptions);
 *  - `--dimmed`    every NON-selected polygon while a selection exists —
 *                  element opacity 0.6, so the chosen zone stands out;
 *  - `--advisory`  advisory polygons: slow stroke pulse + marching dash
 *                  (pure CSS, `map-motion.css` — strokes only, never fills);
 *  - `--loading`   the one-shot load-in fade, added when the layer enters
 *                  the map and removed on `animationend` so its `both` fill
 *                  can never pin a stale fill-opacity over a later status
 *                  change. The per-zone stagger arrives as a custom property
 *                  (`--zone-delay`), not a per-zone selector.
 */
function ZonePolygon({
  zone,
  isSelected,
  isDimmed,
  isHovered,
  staggerIndex,
  onSelectZone,
  onHover,
  onLeave,
  pendingCount,
  onReport,
}: {
  zone: Zone
  isSelected: boolean
  isDimmed: boolean
  isHovered: boolean
  /** Position in the zone list; drives the load-in stagger delay. */
  staggerIndex: number
  onSelectZone: (zoneId: string) => void
  onHover: (zoneId: string) => void
  onLeave: (zoneId: string) => void
  pendingCount: number
  onReport: (zoneId: string) => void
}) {
  const layerRef = useRef<LeafletPolygon | null>(null)
  const modifiersRef = useRef({
    selected: isSelected,
    dimmed: isDimmed,
    advisory: zone.status === 'advisory',
  })
  modifiersRef.current = {
    selected: isSelected,
    dimmed: isDimmed,
    advisory: zone.status === 'advisory',
  }

  const syncModifierClasses = () => {
    const el = layerRef.current?.getElement()
    if (!el) return
    el.classList.toggle('zone-path--selected', modifiersRef.current.selected)
    el.classList.toggle('zone-path--dimmed', modifiersRef.current.dimmed)
    el.classList.toggle('zone-path--advisory', modifiersRef.current.advisory)
  }

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    // Path not created yet (map not added) — the `add` listener applies it
    // the moment it is.
    syncModifierClasses()
    layer.on('add', syncModifierClasses)
    return () => {
      layer.off('add', syncModifierClasses)
    }
  }, [])

  useEffect(() => {
    syncModifierClasses()
  }, [isSelected, isDimmed, zone.status])

  // One-shot load-in fade, staggered per zone. Applied on the layer's `add`
  // (fresh path node) as well as first mount, for the same StrictMode-remount
  // reason as the modifiers above.
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const applyLoadIn = () => {
      // Leaflet types the element as the DOM `Element`; zone paths are
      // always SVG `<path>` nodes created by the SVG renderer.
      const el = layer.getElement() as SVGPathElement | undefined
      if (!el || el.classList.contains('zone-path--loading')) return
      el.style.setProperty('--zone-delay', `${zoneLoadDelayMs(staggerIndex)}ms`)
      el.classList.add('zone-path--loading')
      el.addEventListener(
        'animationend',
        () => el.classList.remove('zone-path--loading'),
        { once: true },
      )
    }

    applyLoadIn()
    layer.on('add', applyLoadIn)
    return () => {
      layer.off('add', applyLoadIn)
    }
    // The stagger index is fixed for the life of a zone layer.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const paint = zonePaint(zone.status)
  const weight = isSelected ? paint.weightSelected : paint.weight

  return (
    <>
      {/* Boundary casing — see `ZONE_CASING` in styles/statusTheme.ts. A
          non-interactive copy of the ring in the pane *under* the zone
          polygons, stroked in the ground colour and slightly wider than the
          status stroke, so every outline is flanked by a dark halo. Two
          touching same-status zones share one teal seam, but each now has its
          own dark edge on its side of it, so the seam reads as a boundary
          instead of dissolving into one continuous fill. */}
      <Polygon
        positions={zone.polygon}
        pane={ZONE_CASING_PANE}
        className="zone-casing"
        interactive={false}
        pathOptions={{
          color: ZONE_CASING.hex,
          weight: weight + ZONE_CASING.extraWeight,
          opacity: ZONE_CASING.opacity,
          fill: false,
          lineJoin: 'round',
        }}
      />
    <Polygon
      ref={layerRef}
      positions={zone.polygon}
      // Constructor prop — applied by Leaflet when the path is created.
      className="zone-path"
      pathOptions={{
        color: paint.hex,
        fillColor: paint.hex,
        weight,
        // Per-status outline strength (see `strokeOpacity` in statusTheme.ts):
        // `safe` recedes, everything else holds the default 0.95.
        opacity: paint.strokeOpacity ?? 0.95,
        // The ramp itself. Leaflet writes these as attributes and the
        // transition on `.zone-path` does the interpolating — see
        // `zonePaint` in styles/statusTheme.ts for why it is a sequence.
        fillOpacity: isSelected
          ? paint.fillSelected
          : isHovered
            ? paint.fillHover
            : paint.fill,
        dashArray: paint.dashArray,
      }}
      eventHandlers={{
        click: () => onSelectZone(zone.id),
        mouseover: () => onHover(zone.id),
        mouseout: () => onLeave(zone.id),
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
          pendingCount={pendingCount}
          onReport={() => onReport(zone.id)}
        />
      </Popup>
    </Polygon>
    </>
  )
}

/**
 * The public map: one Leaflet polygon per zone, coloured by status, with a
 * popup that carries the "Report something here" call to action.
 *
 * THE BASE LAYER
 * --------------
 * This component is the map page's persistent base layer: it is mounted once,
 * behind all the floating chrome, and never unmounts. Leaflet measures its
 * container on mount and positions every pane with transforms, so the
 * container itself is never transformed (the old sheet's recede underlay is
 * gone with the sheet — the drawers clip inside their own windows instead).
 *
 * ZOOM CONTROL
 * ------------
 * `zoomControl={false}` and no `<ZoomControl>` child: Leaflet's control
 * renders 30px links and the app CSS hid it below 640px. Zoom now lives in
 * the top-right control column as 44px buttons on every viewport
 * (`MapControlColumn.tsx`), wired to this instance via `onMapReady`.
 *
 * ATTRIBUTION
 * -----------
 * `attributionControl={false}`: OSM attribution is a licence requirement and
 * must be visible in every state, so it is a persistent credit outside every
 * clip window — the always-visible pill pinned bottom-left in MapPage
 * (`map-attribution`), with the full credit also inside the zone drawer
 * (ZoneDrawer.tsx footer) as before.
 */
export function Map({
  zones,
  reports,
  pendingCounts,
  selectedZoneId,
  resetToken,
  focusZoneId,
  focusToken,
  shippingLanesVisible = false,
  focusReserveRight = 0,
  onMapReady,
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
      // Zoom lives in the control column (see module doc); Leaflet's own
      // control is never rendered.
      zoomControl={false}
      attributionControl={false}
      // Tile fade-in is ours, not Leaflet's 200ms JS loop: the map is created
      // with its fade disabled and tiles fade via CSS instead
      // (`map-motion.css`, 0.3s opacity on `.leaflet-tile-loaded`).
      fadeAnimation={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapReadyBridge onMapReady={onMapReady} />
      <FitToBounds box={box} resetToken={resetToken} />
      {/* After FitToBounds: on a session's first load the glide overrides the
          initial fit with the wide-to-bay establishing shot (MapMarkers). */}
      <IntroGlide />
      <FocusZone zone={focusZone} token={focusToken} reserveRightPx={focusReserveRight} />
      <ZonePressFeedback />
      <MapLoopGate />
      <ReportPins reports={reports} zones={zones} />
      <UserLocationDot />

      {/* Navigation-hazard lines sit UNDER the advisory polygons: secondary
          reference, never competing with the status colours. */}
      {shippingLanesVisible && <ShippingLayer />}

      {/* Zone boundary casings live one step below the overlay pane (400). */}
      <Pane name={ZONE_CASING_PANE} style={{ zIndex: 399 }} />

      {zones.map((zone, index) => (
        <ZonePolygon
          key={zone.id}
          zone={zone}
          isSelected={zone.id === selectedZoneId}
          // Everything except the current selection recedes while a
          // selection exists (element opacity 0.6 in `map-motion.css`).
          isDimmed={selectedZoneId !== null && zone.id !== selectedZoneId}
          isHovered={zone.id === hoveredZoneId}
          staggerIndex={index}
          onSelectZone={onSelectZone}
          onHover={setHoveredZoneId}
          onLeave={(zoneId) =>
            setHoveredZoneId((current) => (current === zoneId ? null : current))
          }
          pendingCount={pendingCounts[zone.id] ?? 0}
          onReport={onReport}
        />
      ))}
    </MapContainer>
  )
}
