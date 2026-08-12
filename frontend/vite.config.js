import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // A `urlPattern` function below is not called here — Workbox turns it into
  // source text and writes it into sw.js, where nothing from this file's scope
  // exists. Anything a matcher closes over arrives at the worker as an
  // undefined identifier and throws on the first request it looks at, which is
  // a failure that leaves no trace at build time and disables the cache
  // entirely at runtime. So the matchers below are self-contained, and they
  // match on the path rather than on VITE_API_URL: that variable is
  // `https://localhost:8000/api` in development and a bare `/api` in
  // production, and only one of those is a thing you can compare a full URL to.
  // The path is `/api/...` either way, cross-origin or not.

  return {
    // Which build is this? A service worker serves whatever it already has, so
    // an open tab can go on running last week's app long after a deploy — and
    // every symptom of that looks like a bug in the new code. Stamping the build
    // into the bundle makes the question answerable in one glance instead of by
    // deduction. Printed on boot; see src/main.jsx.
    define: {
      __BUILD_ID__: JSON.stringify(
        new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      ),
    },
    plugins: [
      react(),
      VitePWA({
        // The desk is a place where someone is mid-entry when a new build lands.
        // 'prompt' lets them finish and reload on their own; 'autoUpdate' would
        // swap the app out from under them. See OfflineBar for the prompt.
        registerType: 'prompt',
        injectRegister: null, // registered by hand in src/pwa.js

        // Files served from public/ that the app itself never fetches. Precaching
        // them would put a megabyte of link-preview art in every install, and the
        // search-console verification file must always be answered by the server.
        includeAssets: ['favicon.png', 'favicon.svg', 'icons.svg', 'Gym_BG.jpg', 'apple-touch-icon.png'],

        manifest: {
          name: 'Gymistan — gym management',
          short_name: 'Gymistan',
          description:
            'Members, fees, expenses, attendance and reports for your gym. Works when the internet does not.',
          // The product starts at the dashboard, not the marketing page: someone
          // who installed this has already bought it.
          start_url: '/dashboard',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#0b1220',
          theme_color: '#0b1220',
          lang: 'en',
          dir: 'ltr',
          categories: ['business', 'productivity'],
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },

        workbox: {
          globPatterns: ['**/*.{js,css,html,woff,woff2}'],
          // The app is one bundle plus its chunks; 3 MB leaves room to grow
          // without silently dropping a chunk out of the precache.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,

          // Every in-app URL is a client-side route, so a navigation to
          // /members/42 with the net down must be answered by the shell.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\//,           // same-origin API, when it is deployed that way
            /^\/media\//,
            /^\/static\//,
            /^\/admin\//,         // Django admin is a server-rendered page
            /^\/sitemap\.xml$/,
            /^\/robots\.txt$/,
            /\.txt$/,             // search-console verification files
          ],

          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,     // the user decides when to take the new build

          runtimeCaching: [
            {
              // The read cache: whatever the desk last saw is what it sees when
              // the line drops. Network first, so an online desk is never looking
              // at stale money — the cache is only reached for after the network
              // has actually failed (or taken longer than a person would wait).
              // `__probe` is the offline-session watchdog asking whether the
              // server is really there (see utils/offlineSession). It must never
              // be answered from the cache — a cached 200 would look exactly
              // like a reachable server and the leash would never run out.
              urlPattern: ({ url, request }) =>
                request.method === 'GET'
                && /^\/api\//.test(url.pathname)
                && !url.searchParams.has('__probe'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'gymistan-api',
                networkTimeoutSeconds: 6,
                expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [200] },
                matchOptions: { ignoreVary: true },
              },
            },
            {
              // Member photos and gym logos. Stale-while-revalidate because a
              // photo that is one edit old is not a correctness problem, and
              // waiting on the network for every avatar in a 300-row table is.
              urlPattern: ({ url, request }) =>
                request.method === 'GET' && url.pathname.startsWith('/media/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gymistan-media',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },

        devOptions: {
          // Off by default: a service worker in front of the dev server turns
          // every HMR oddity into a cache mystery. Set VITE_PWA_DEV=1 to test
          // offline behaviour with `npm run dev`.
          enabled: env.VITE_PWA_DEV === '1',
          type: 'module',
        },
      }),
    ],
  }
})
