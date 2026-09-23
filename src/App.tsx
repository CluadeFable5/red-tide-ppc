import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route } from 'react-router-dom'
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

/**
 * Which promise makes each lazy route renderable, keyed by pathname.
 *
 * `RouteTransition` holds an incoming route at opacity 0 until the promise for
 * it resolves, so the enter animation covers a *rendered* page instead of a
 * Suspense fallback. Only `/map` has one — everything else is eager. See the
 * header of `src/motion/RouteTransition.tsx`.
 */
const ROUTE_PREPARATION = { '/map': prefetchMapPage }

export function MapLoadingFallback() {
  /*
    Transparent, and deliberately empty.

    This fallback is shown in exactly one situation: `/map` is being entered and
    its chunk is not in memory yet. The route frame is already on screen by then,
    held at opacity 0 (see `RouteTransition`), so this window is *dark* — and dark
    is the right answer. A brand mark or a spinner appearing out of a dissolve
    and then handing over to the map is the one thing that makes a route
    transition look like a prototype, so there is nothing here to see.

    It keeps its box (`min-h-dvh`, on the ink ground) so the document does not
    collapse while the chunk loads, and keeps its `role`/label so assistive tech
    still hears that the map is loading.
  */
  return (
    <div
      role="status"
      aria-label="Loading map"
      className="min-h-dvh bg-ink opacity-0"
    />
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
      <RouteTransition prepare={ROUTE_PREPARATION}>
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
