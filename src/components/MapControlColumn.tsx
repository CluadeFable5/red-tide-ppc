import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Map as LeafletMap } from 'leaflet'

/**
 * The top-right control column: one vertical stack holding every floating
 * map control that used to scatter across the edges — zoom, then the two
 * drawer tabs (advisory signal, then zone drawer).
 *
 * LAYOUT
 * ------
 *  ┌──────────────┐
 *  │  +  /  −     │  ZoomControls — 44×44px hit areas on every viewport,
 *  ├──────────────┤  including phones (the old Leaflet control hid < 640px).
 *  │ [tab][gauge] │  AdvisoryDrawer — right-edge drawer, tucks right.
 *  ├──────────────┤
 *  │ [tab][panel] │  ZoneDrawer — right-edge drawer, fills the rest of the
 *  │      …       │  column's height (`min-h-0 flex-1`, so its clip window
 *  └──────────────┘  and scroll body resolve against a definite height).
 *
 * The column is pinned with safe-area insets on all three free sides (top,
 * right, bottom), sits just under the header chrome (top matches the pills
 * row's 4.5rem + inset), and is `pointer-events-none` — only the actual
 * controls re-enable events, so the strip of map it covers stays pannable.
 *
 * It deliberately does NOT fade with any sheet progress: the sheet is gone,
 * and floating chrome that invisibly eats gestures was the failure mode the
 * fade existed to prevent. Static layers only here, so the zoom cluster and
 * the tabs keep their translucent blurred chips — nothing in this subtree is
 * ever translated by a motion value (the drawer tracks live inside their
 * clip windows, and their panels are solid).
 */
export function MapControlColumn({
  map,
  children,
}: {
  /** Leaflet instance once the map has mounted; zoom stays disabled until then. */
  map: LeafletMap | null
  children: ReactNode
}) {
  return (
    <aside
      className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(4.5rem+env(safe-area-inset-top))] z-[1010] flex flex-col items-end gap-2"
      aria-label="Map controls"
      data-testid="map-control-column"
    >
      <ZoomControls map={map} />
      {children}
    </aside>
  )
}

/**
 * Zoom controls, as two explicit 44px buttons rather than Leaflet's
 * `ZoomControl`: the plugin renders 30px links and is hidden below 640px by
 * the app's CSS, and a drag-and-zoom UI must not be desktop-only. These are
 * wired to the live map instance (`zoomIn`/`zoomOut` are Leaflet's own
 * animated zooms) and mirror its disabled states at the zoom limits.
 */
export function ZoomControls({ map }: { map: LeafletMap | null }) {
  const [limits, setLimits] = useState({ canZoomIn: false, canZoomOut: false })
  // The live zoom level, republished as a data attribute so the real-browser
  // pass can prove the buttons actually drive the map (a DOM value, not a
  // pixel comparison).
  const [zoom, setZoom] = useState<number | null>(null)

  useEffect(() => {
    if (!map) {
      setLimits({ canZoomIn: false, canZoomOut: false })
      setZoom(null)
      return
    }
    const update = () => {
      setLimits({
        canZoomIn: map.getZoom() < map.getMaxZoom(),
        canZoomOut: map.getZoom() > map.getMinZoom(),
      })
      setZoom(map.getZoom())
    }
    update()
    map.on('zoomend', update)
    return () => {
      map.off('zoomend', update)
    }
  }, [map])

  const buttonClass =
    'grid h-11 w-11 place-items-center text-paper/75 transition-colors hover:text-accent disabled:cursor-default disabled:opacity-35 disabled:hover:text-paper/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'

  return (
    <div
      role="group"
      aria-label="Map zoom"
      data-testid="zoom-controls"
      data-zoom={zoom ?? undefined}
      className="pointer-events-auto flex shrink-0 flex-col overflow-hidden rounded-md border border-line bg-ink-2/85 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => map?.zoomIn()}
        disabled={!limits.canZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
        className={buttonClass}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <span aria-hidden="true" className="block h-px w-full bg-line" />
      <button
        type="button"
        onClick={() => map?.zoomOut()}
        disabled={!limits.canZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
        className={buttonClass}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" d="M5 12h14" />
        </svg>
      </button>
    </div>
  )
}
