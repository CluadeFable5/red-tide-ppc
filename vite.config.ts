import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind to all interfaces so the app is reachable from the sandbox preview
    // proxy and from phones on the same network.
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Vite blocks unknown Host headers by default. Allow localhost plus the
    // Arena/E2B preview proxy subdomains so the live preview can load.
    allowedHosts: ['localhost', '127.0.0.1', '.e2b.app'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    // No production sourcemaps: keeps dist small and avoids the Tailwind
    // plugin's sourcemap warning. Use `vite build --sourcemap` when debugging.
    rollupOptions: {
      output: {
        // Keep the heavy third-party code out of the app chunk so the browser
        // can cache it separately between deploys.
        // Vite 8 (rolldown) only accepts the function form.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('leaflet')) return 'leaflet'
          if (id.includes('react-router')) return 'router'
          return 'vendor'
        },
      },
    },
  },
})
