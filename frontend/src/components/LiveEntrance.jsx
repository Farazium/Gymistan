import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import api from '../api/axios'
import { initAudio, playForStatus } from '../utils/entranceSound'
import useLiveStore from '../store/liveStore'
import toast from 'react-hot-toast'

// Big card that flashes up on each scan while Live is on.
function LiveCard({ scan }) {
  if (!scan) return null
  const map = {
    active:  { ring: 'border-green-500/60', bg: 'from-green-500/25', text: 'text-green-300', Icon: CheckCircle2, label: 'ACTIVE', sub: scan.expiry ? `Valid till ${new Date(scan.expiry + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Membership active' },
    trainer: { ring: 'border-green-500/60', bg: 'from-green-500/25', text: 'text-green-300', Icon: CheckCircle2, label: 'TRAINER', sub: 'Welcome' },
    expired: { ring: 'border-red-500/60', bg: 'from-red-500/25', text: 'text-red-300', Icon: XCircle, label: 'EXPIRED', sub: scan.expiry ? `Expired ${new Date(scan.expiry + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Membership expired' },
    unknown: { ring: 'border-yellow-500/60', bg: 'from-yellow-500/25', text: 'text-yellow-300', Icon: XCircle, label: 'NOT REGISTERED', sub: 'Unknown device ID' },
  }
  const s = map[scan.status] || map.unknown
  const { Icon } = s
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
      <div key={scan._t} className="live-pop w-full max-w-md">
        <div className={`rounded-2xl border ${s.ring} bg-gradient-to-b ${s.bg} to-slate-900/95 backdrop-blur-xl shadow-2xl p-8 text-center`}>
          <Icon size={56} className={`mx-auto ${s.text}`} />
          <p className="mt-4 text-2xl font-bold text-white">{scan.name}</p>
          <span className={`inline-block mt-3 px-3 py-1 rounded-full text-sm font-semibold ${s.text} bg-white/5 border ${s.ring}`}>{s.label}</span>
          <p className="mt-3 text-sm text-gray-300">{s.sub}</p>
          <p className="mt-1 text-xs text-gray-500">Checked in at {scan.time}</p>
        </div>
      </div>
    </div>
  )
}

// Mounted once at the app root so the entrance feed survives page changes.
export default function LiveEntrance() {
  const qc = useQueryClient()
  const { live, setLive } = useLiveStore()
  const [scan, setScan] = useState(null)
  const seqRef = useRef(null)   // last seq we've seen; null until the first poll syncs
  const scanTimer = useRef(null)

  useEffect(() => {
    if (!live) { seqRef.current = null; return }
    initAudio()
    let stopped = false

    const showScan = (ev) => {
      playForStatus(ev.status)
      setScan({ ...ev, _t: Date.now() })
      clearTimeout(scanTimer.current)
      scanTimer.current = setTimeout(() => setScan(null), 4500)
    }

    const poll = async () => {
      try {
        const after = seqRef.current ?? 0
        const { data } = await api.get('/attendance/device/live/', { params: { after } })
        if (stopped) return
        if (!data.enabled) {
          toast.error(data.error || 'Device not available for live mode')
          setLive(false)
          return
        }
        if (data.error) toast.error(data.error)
        if (seqRef.current === null) {
          seqRef.current = data.seq            // first poll: sync, don't replay history
        } else if (data.events?.length) {
          for (const ev of data.events) {
            seqRef.current = Math.max(seqRef.current, ev.seq)
            showScan(ev)
          }
          qc.invalidateQueries({ queryKey: ['attendance'] })
        }
      } catch {
        /* transient network error — next tick retries */
      }
    }

    poll()
    const id = setInterval(poll, 1600)
    return () => { stopped = true; clearInterval(id); clearTimeout(scanTimer.current) }
  }, [live, qc, setLive])

  return live ? <LiveCard scan={scan} /> : null
}
