import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route } from 'react-router-dom'
import { BrandMark } from './components/LoadingState'
import { RouteTransition } from './motion/RouteTransition'
import { Admin } from './pages/Admin'
import { Landing } from './pages/Landing'
import { useAppStore } from './store'

/**
 * The map is the app's heaviest tree — Leaflet, react-leaflet, the zone sheet
 * and the report form — so it is lazy-loaded: the landing page and /admin
 * never pay for it. The leaflet and firebase code lives in its own shared
 * chunks (vite.config manualChunks), so /map's extra download is just the
 * map-page code.
 */
let mapPageModule: Promise<typeof import('./pages/MapPage')> | null = null

/**
 * Start fetching the /map chunk without mounting anything.
 *
 * The map is lazy, and a lazy route behind a route transition has a specific
 * failure mode: the outgoing page fades out, then the browser spends the
 * round trip fetching the incoming chunk while the incoming frame sits at
 * opacity 0 — which reads as a dead beat in the middle of the animation. The
 * landing page calls this on pointer-enter/focus of either map CTA, so the
 * chunk is normally already in cache by the time the click lands and the
 * transition runs start to finish.
 *
 * Deliberately *not* called on load: the whole point of the lazy boundary is
 * that the landing page and /admin never download the map (see
 * vite.config.ts `manualChunks` and docs/design-references.md §14.3), and an
 * idle prefetch would spend that budget on people who never open the map.
 */
export function prefetchMapPage() {
  mapPageModule ??= import('./pages/MapPage')
  return mapPageModule
}

const MapPage = lazy(() =>
  prefetchMapPage().then((module) => ({ default: module.MapPage })),
)

function MapLoadingFallback() {
  return (
    <div
      role="status"
      aria-label="Loading map"
      className="grid min-h-dvh place-items-center bg-ink"
    >
      <BrandMark className="h-12 w-12 text-accent" />
    </div>
  )
}

export default function App() {
  // Subscribe to the live zone/report feeds once for the whole app — including
  // the landing page, whose figures are live. `init()` returns the
  // unsubscribe function, which is exactly the effect cleanup React expects.
  useEffect(() => useAppStore.getState().init(), [])

  return (
    <BrowserRouter>
      {/*
        `RouteTransition` renders the <Routes> itself, so it can pin the
        outgoing tree to the outgoing location while it fades out.
      */}
      <RouteTransition>
        <Route path="/" element={<Landing />} />
        <Route
          path="/map"
          element={
            <Suspense fallback={<MapLoadingFallback />}>
              <MapPage />
            </Suspense>
          }
        />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </RouteTransition>
    </BrowserRouter>
  )
}
