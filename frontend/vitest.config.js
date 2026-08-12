import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.js on purpose: that file builds the service worker
// and the manifest, none of which a unit test wants to sit through.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    setupFiles: ['./src/test/setup.js'],
    restoreMocks: true,
  },
})
