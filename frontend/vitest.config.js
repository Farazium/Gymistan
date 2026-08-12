import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.js on purpose: that file builds the service worker
// and the manifest, none of which a unit test wants to sit through.
export default defineConfig({
  resolve: {
    alias: {
      // Provided by VitePWA at build time, and this config has no VitePWA in it.
      // Anything importing the registration path in a test gets a no-op.
      'virtual:pwa-register': '/src/test/pwa-register-stub.js',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    setupFiles: ['./src/test/setup.js'],
    restoreMocks: true,
  },
})
