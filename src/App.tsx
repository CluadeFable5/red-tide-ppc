import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
