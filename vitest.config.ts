import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the React/Tailwind plugins are not
// loaded for the (DOM-free) store tests.
export default defineConfig({
  test: {
    environment: 'node',
    // Needed so @testing-library/react's automatic DOM cleanup runs.
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
