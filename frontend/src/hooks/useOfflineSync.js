// Getting this device level with the server, in both directions.
//
// Out: anything the desk entered while the line was down goes up.
// In:  the main lists come down, so the cache holds the gym's data rather than
//      a record of wherever somebody happened to click.
//
// In that order, and it matters: warming first would pull down a picture that
// does not yet contain this morning's queued payments, and then cache it.
//
// Mounted once by AppLayout.

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import useNetStore from '../store/netStore'
import useAuthStore from '../store/authStore'
import { isDemo } from '../demo'
import { countFor, subscribe, replayQueue, warmCache } from '../offline'
import { invalidateFinance } from '../utils/invalidateFinance'

// Don't re-warm on every reload. A desk that reloads three times while fixing a
// typo does not need forty-five requests down a hotspot to prove the cache is
// still there.
const WARM_EVERY_MS = 5 * 60 * 1000
const WARM_STAMP = 'last_cache_warm'

function warmedRecently() {
  try {
    const at = Number(localStorage.getItem(WARM_STAMP))
    return Number.isFinite(at) && at > 0 && Date.now() - at < WARM_EVERY_MS
  } catch {
    return false
  }
}

export default function useOfflineSync() {
  const user = useAuthStore((s) => s.user)
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const [counts, setCounts] = useState({ pending: 0, failed: 0 })
  const busy = useRef(false)

  const refreshCounts = useCallback(() => {
    countFor(userId).then(setCounts).catch(() => { /* no queue, no counts */ })
  }, [userId])

  // Anything that changes the queue — a write being enqueued, a replay removing
  // one, the desk discarding one — announces it here.
  useEffect(() => {
    if (isDemo()) return
    refreshCounts()
    return subscribe(refreshCounts)
  }, [refreshCounts])

  const run = useCallback(async (options = {}) => {
    if (isDemo() || !userId || busy.current) return
    busy.current = true

    try {
      const summary = await replayQueue(userId)

      if (summary?.sent) {
        toast.success(
          summary.sent === 1 ? '1 offline entry synced' : `${summary.sent} offline entries synced`
        )
        // What just landed is money and membership: the lists on screen were
        // assembled without it.
        invalidateFinance(queryClient)
        queryClient.invalidateQueries({ queryKey: ['payments'] })
        queryClient.invalidateQueries({ queryKey: ['members'] })
        queryClient.invalidateQueries({ queryKey: ['members-list'] })
        queryClient.invalidateQueries({ queryKey: ['expenses'] })
        queryClient.invalidateQueries({ queryKey: ['inventory'] })
      }
      if (summary?.failed) {
        toast.error(
          `${summary.failed} offline ${summary.failed === 1 ? 'entry was' : 'entries were'} rejected — open Pending sync to see why`,
          { duration: 8000 }
        )
      }
      refreshCounts()

      // Then fill the cache for the next outage. Skipped if the queue run was
      // cut short, because that means there is no server to fill it from.
      if (summary?.interrupted) return
      if (!options.force && warmedRecently()) return

      const { warmed } = await warmCache(user)
      if (warmed) {
        try { localStorage.setItem(WARM_STAMP, String(Date.now())) } catch { /* fine */ }
      }
    } finally {
      busy.current = false
    }
  }, [userId, user, queryClient, refreshCounts])

  useEffect(() => {
    if (isDemo()) return
    // On mount: the app may be opening for the first time since an outage, with
    // a queue already waiting and a cache that has never been filled.
    run()
    // ...and on the transition back to online, which is both the moment the
    // queue can go up and the moment the cache is worth refreshing.
    return useNetStore.subscribe((s, prev) => {
      if (s.online && !prev.online) run({ force: true })
    })
  }, [run])

  return { ...counts, syncNow: () => run({ force: true }) }
}
