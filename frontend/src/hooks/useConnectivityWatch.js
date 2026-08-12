// Keeps the app's idea of "connected" honest.
//
// Ordinary reads cannot be used for this: the service worker answers them from
// its cache with a 200, so an app running entirely offline sees nothing but
// successful requests and would happily report itself online (see
// utils/probe.js). That leaves two gaps this fills.
//
// Coming back: nothing else would notice. A write or an error reply proves a
// connection, but a desk that is only looking at pages makes neither, so
// without a poll the bar would say offline until somebody typed something.
//
// Going away quietly: a machine still attached to a router with no line behind
// it — or a hotspot out of data — fails no request at all while the cache can
// answer, so the outage has to be found by asking rather than by waiting.

import { useEffect, useRef } from 'react'
import useNetStore from '../store/netStore'
import { isDemo } from '../demo'
import { probeServer } from '../utils/probe'

// While offline, how often to check whether that is still true. Short enough
// that the desk isn't left staring at a stale bar after the wifi comes back,
// long enough to be nothing on a metered connection — one small request every
// fifteen seconds, and only while there is something to find out.
const OFFLINE_POLL_MS = 15_000

// While online, the connection is re-checked only on the events below, never on
// a timer: a working desk should not be paying for a heartbeat.
const FOCUS_RECHECK_MS = 60_000

export default function useConnectivityWatch() {
  const online = useNetStore((s) => s.online)
  const lastProbe = useRef(0)

  const probe = useRef(async () => {
    lastProbe.current = Date.now()
    await probeServer()
  })

  // On mount, once, whatever the browser claims. This is the moment the answer
  // matters most and the moment we know least — the app has just opened and
  // every request it has made so far could have come out of the cache.
  useEffect(() => {
    if (isDemo()) return
    probe.current()
  }, [])

  useEffect(() => {
    if (isDemo() || online) return
    const timer = setInterval(() => probe.current(), OFFLINE_POLL_MS)
    return () => clearInterval(timer)
  }, [online])

  useEffect(() => {
    if (isDemo()) return

    // The browser's own event is only a hint that a network appeared; the probe
    // is what turns it into an answer.
    const onBrowserOnline = () => probe.current()

    // Coming back to the tab after a while is the other moment the desk is about
    // to trust what is on screen. Rate-limited so tabbing back and forth is free.
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastProbe.current < FOCUS_RECHECK_MS) return
      probe.current()
    }

    window.addEventListener('online', onBrowserOnline)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('online', onBrowserOnline)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])
}
