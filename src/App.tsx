import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route } from 'react-router-dom'
import { RouteTransition } from './motion/RouteTransition'
import { Admin } from './pages/Admin'
import { MapPage } from './pages/MapPage'
import { useAppStore } from './store'

export default function App() {
  // Subscribe to the live zone/report feeds once for the whole app.
  // `init()` returns the unsubscribe function, which is exactly the effect
  // cleanup React expects.
  useEffect(() => useAppStore.getState().init(), [])

  return (
    <BrowserRouter>
      {/*
        The route table is unchanged — only wrapped. `RouteTransition` renders
        the <Routes> itself, so it can pin the outgoing tree to the outgoing
        location while it fades out.
      */}
      <RouteTransition>
        <Route path="/" element={<MapPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </RouteTransition>
    </BrowserRouter>
  )
}
