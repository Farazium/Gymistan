// The watchdog that signs a desk out after too long with no server behind it.
//
// Mounted once, by AppLayout, so it runs for exactly as long as somebody is
// signed in. See utils/offlineSession for what the leash is and why.

import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { probeServer } from '../utils/probe'
import useAuthStore from '../store/authStore'
import { isDemo } from '../demo'
import { countFor } from '../offline'
import {
  ensureOfflineClock,
  offlineSessionExpired,
  OFFLINE_GRACE_MS,
  formatDuration,
} from '../utils/offlineSession'

// How often the leash is measured. A minute is far finer than a two-day limit
// needs, but it is what makes the countdown in the offline bar move at a
// believable rate, and it costs nothing.
const CHECK_MS = 60 * 1000

export default function useOfflineSession() {
  const logout = useAuthStore((s) => s.logout)
  const userId = useAuthStore((s) => s.user?.id ?? null)

  useEffect(() => {
    // The demo never talks to a server at all, so a leash would sign every
    // visitor out mid-tour after two days of tab-open — and there is nothing
    // cached on their machine worth protecting anyway.
    if (isDemo()) return

    // A session already running when this shipped has never been stamped. Give
    // it a full leash from now rather than reading its absence as two days.
    ensureOfflineClock()

    let stopped = false

    const check = async () => {
      if (stopped || !offlineSessionExpired()) return
      // Never cut the leash on the strength of the stamp alone. An old stamp
      // also describes a tab left open and idle on a perfectly good line, and
      // signing that desk out would be wrong. probeServer re-stamps on success.
      if (await probeServer()) return
      if (stopped || !offlineSessionExpired()) return

      // Anything still queued is not lost — it stays in IndexedDB against this
      // user and goes up when they sign back in. Saying so is the difference
      // between a security measure and an apparent loss of the day's takings.
      let waiting = 0
      try { waiting = (await countFor(userId)).pending } catch { /* no queue to report */ }

      logout()
      toast.error(
        `Signed out — this device has not reached the server for ${formatDuration(OFFLINE_GRACE_MS)}.` +
        (waiting
          ? ` ${waiting} offline ${waiting === 1 ? 'entry is' : 'entries are'} still saved here and will sync when you sign back in.`
          : ' Sign in again once you have a connection.'),
        { duration: 10000 }
      )
    }

    check()
    const timer = setInterval(check, CHECK_MS)

    // A laptop that was shut for three days wakes with the interval having
    // fired, at best, once and late — the timer stops with the machine. The
    // moment the tab is looked at again is the reliable point to re-measure.
    const onWake = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', check)

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', check)
    }
  }, [logout, userId])
}
