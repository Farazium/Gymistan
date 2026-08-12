// Drains the offline write queue whenever there is a server to drain it to, and
// keeps the counts the UI shows in step with it.
//
// Mounted once by AppLayout, like the offline-session watchdog.

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import useNetStore from '../store/netStore'
import useAuthStore from '../store/authStore'
import { isDemo } from '../demo'
import { countFor, subscribe, replayQueue } from '../offline'
import { invalidateFinance } from '../utils/invalidateFinance'

export default function useReplayQueue() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const queryClient = useQueryClient()
  const [counts, setCounts] = useState({ pending: 0, failed: 0 })

  const refreshCounts = useCallback(() => {
    countFor(userId).then(setCounts).catch(() => { /* no queue, no counts */ })
  }, [userId])

  // Anything that changes the queue — a write being enqueued, a replay removing
  // one, the desk discarding one from the pending screen — announces it here.
  useEffect(() => {
    if (isDemo()) return
    refreshCounts()
    return subscribe(refreshCounts)
  }, [refreshCounts])

  const run = useCallback(async () => {
    if (isDemo() || !userId) return
    const summary = await replayQueue(userId)
    if (!summary || (!summary.sent && !summary.failed)) return

    if (summary.sent) {
      toast.success(
        summary.sent === 1
          ? '1 offline entry synced'
          : `${summary.sent} offline entries synced`
      )
      // What just landed is money and membership: the lists the desk is looking
      // at were assembled without it.
      invalidateFinance(queryClient)
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['members-list'] })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    }
    if (summary.failed) {
      toast.error(
        `${summary.failed} offline ${summary.failed === 1 ? 'entry was' : 'entries were'} rejected — open Pending sync to see why`,
        { duration: 8000 }
      )
    }
    refreshCounts()
  }, [userId, queryClient, refreshCounts])

  // Replay on the transition into "online", not on every render while online:
  // subscribing to the store's change means a desk that never went offline
  // never runs this at all.
  useEffect(() => {
    if (isDemo()) return
    // On mount too — the app may be opening for the first time since an outage,
    // with a queue already waiting and no transition to wait for.
    run()
    return useNetStore.subscribe((s, prev) => {
      if (s.online && !prev.online) run()
    })
  }, [run])

  return { ...counts, replayNow: run }
}
