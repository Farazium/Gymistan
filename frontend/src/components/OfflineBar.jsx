/* The strip that tells the desk what the connection is doing.

   Two things share it, because both are "the app is not quite what you think it
   is right now" and neither deserves a second bar:

   * Offline — the last request found no server. What is on screen is the last
     thing this machine saw, and the accountant needs to know that before they
     read a figure off it.
   * A new build is installed and waiting. Never applied on its own: reloading
     mid-entry loses whatever is half-typed, so the reload is a button.
   * Work entered offline that the server has not taken yet — and, louder,
     anything it refused. A rejected entry is money the books do not have, so it
     gets its own red strip that stays until somebody deals with it.

   It sits above the page, below the mobile header, in the same place the demo
   strip does. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudOff, RefreshCw, Wifi, UploadCloud, AlertTriangle } from 'lucide-react'
import useNetStore from '../store/netStore'
import { onUpdateReady, applyUpdate } from '../pwa'
import { msLeftOffline, formatDuration } from '../utils/offlineSession'

// How long "Back online" stays up after the server answers again. Long enough to
// be read on the way past, short enough not to become furniture.
const BACK_ONLINE_MS = 4000

export default function OfflineBar({ pending = 0, failed = 0 }) {
  const online = useNetStore((s) => s.online)
  const [showBack, setShowBack] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const backTimer = useRef(null)
  // Only exists to re-render the countdown. Nothing reads the value itself.
  const [tick, setTick] = useState(0)

  useEffect(() => onUpdateReady(() => setUpdateReady(true)), [])

  // "Back online" is a moment, not a state, so it is driven by the store's
  // transition rather than by rendering on `reconnectedAt` — the reconnect is
  // what starts the clock, and a re-render for any other reason must not.
  useEffect(() => {
    const stop = useNetStore.subscribe((s, prev) => {
      if (!s.reconnectedAt || s.reconnectedAt === prev.reconnectedAt) return
      setShowBack(true)
      clearTimeout(backTimer.current)
      backTimer.current = setTimeout(() => setShowBack(false), BACK_ONLINE_MS)
    })
    return () => {
      stop()
      clearTimeout(backTimer.current)
    }
  }, [])

  // How long this device may go on working from the cache before the session is
  // dropped (utils/offlineSession). Ticked only while offline — a healthy desk
  // runs no timer at all.
  useEffect(() => {
    if (online) return
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [online])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock
  const graceLeft = useMemo(() => (online ? null : msLeftOffline()), [online, tick])

  if (online && !showBack && !updateReady && !pending && !failed) return null

  return (
    <>
      {!online && (
        <div
          role="status"
          className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 backdrop-blur-md"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-200">
            <CloudOff size={15} />
            Offline
          </span>
          <span className="text-xs text-gray-300">
            No connection to the server. You are looking at the last data this
            device loaded — it may have changed since.
          </span>
          {graceLeft !== null && (
            <span className="text-xs text-amber-200/80">
              Signing out in {formatDuration(graceLeft)} if the connection does
              not come back.
            </span>
          )}
        </div>
      )}

      {online && showBack && (
        <div
          role="status"
          className="relative z-20 flex items-center gap-2 border-b border-green-500/30 bg-green-500/10 px-4 py-2 backdrop-blur-md"
        >
          <Wifi size={15} className="text-green-300" />
          <span className="text-sm font-semibold text-green-200">Back online</span>
          <span className="text-xs text-gray-300">Data is live again.</span>
        </div>
      )}

      {failed > 0 && (
        <div className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 backdrop-blur-md">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-200">
            <AlertTriangle size={15} />
            {failed} {failed === 1 ? 'entry was' : 'entries were'} rejected
          </span>
          <span className="text-xs text-gray-300">
            Recorded here but refused by the server — these are not in the books.
          </span>
          <Link to="/pending-sync" className="btn-secondary ml-auto !px-3 !py-1 text-xs">
            Review
          </Link>
        </div>
      )}

      {pending > 0 && (
        <div className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-sky-500/25 bg-sky-500/10 px-4 py-2 backdrop-blur-md">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-200">
            <UploadCloud size={15} />
            {pending} waiting to sync
          </span>
          <span className="text-xs text-gray-300">
            Entered on this device. {online
              ? 'Sending now.'
              : 'They will be sent as soon as the connection returns.'}
          </span>
          <Link to="/pending-sync" className="btn-secondary ml-auto !px-3 !py-1 text-xs">
            View
          </Link>
        </div>
      )}

      {updateReady && (
        <div className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-500/25 bg-primary-500/10 px-4 py-2 backdrop-blur-md">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-200">
            <RefreshCw size={15} />
            Update ready
          </span>
          <span className="text-xs text-gray-300">
            A newer version of Gymistan is installed. Reload when you have finished
            what you are typing.
          </span>
          <button onClick={applyUpdate} className="btn-primary ml-auto !px-3 !py-1 text-xs">
            Reload
          </button>
        </div>
      )}
    </>
  )
}
