// Service-worker registration and the caches it owns.
//
// The worker is what lets the app open at all when the line is down: the shell is
// precached at build time and API reads are kept in `gymistan-api` (see
// vite.config.js). Registration is done by hand rather than injected, so the two
// things the app needs to react to — "a new build is waiting" and "the app is now
// running from cache" — arrive as plain callbacks the UI can subscribe to.

import { registerSW } from 'virtual:pwa-register'
import { isDemo } from './demo'

// Caches whose contents belong to whoever was signed in. Cleared on sign-out so
// the next person to use this machine can never be shown the last one's members
// or takings while offline. Keep in step with `runtimeCaching` in vite.config.js.
const USER_CACHES = ['gymistan-api', 'gymistan-media']

let updateSW = null
const updateListeners = new Set()

/** Subscribe to "a new build is installed and waiting". Returns an unsubscribe. */
export function onUpdateReady(fn) {
  updateListeners.add(fn)
  return () => updateListeners.delete(fn)
}

/** Activate the waiting build and reload. */
export function applyUpdate() {
  updateSW?.(true)
}

/**
 * Drop everything cached on this device for the signed-in user.
 *
 * Called on sign-out. Deliberately does NOT unregister the worker: the shell
 * precache is not user data, and keeping it means the sign-in page still opens
 * on a machine that is offline the next morning.
 */
export async function clearUserCaches() {
  if (!('caches' in window)) return
  try {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter((n) => USER_CACHES.some((prefix) => n.includes(prefix)))
        .map((n) => caches.delete(n))
    )
  } catch {
    // A browser that refuses to open the cache store is one that never wrote to
    // it either. Nothing to clean up, and sign-out must not fail over it.
  }
}

export function registerPWA() {
  // The demo answers every call from in-browser sample data and is a tab-scoped,
  // throwaway session. Installing a worker for it would leave the sample gym's
  // shell cached on the machine of someone who was only browsing the product.
  if (isDemo()) return

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateListeners.forEach((fn) => fn())
    },
  })
}
