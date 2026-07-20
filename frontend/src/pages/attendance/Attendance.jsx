import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Users, Dumbbell, ChevronLeft, ChevronRight, Check, X, Settings, Download, CalendarDays, Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import api from '../../api/axios'
import { exportToExcel } from '../../utils/exportExcel'
import { initAudio } from '../../utils/entranceSound'
import useLiveStore from '../../store/liveStore'
import Modal from '../../components/ui/Modal'
import DevicePanel from './DevicePanel'
import toast from 'react-hot-toast'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function shiftDate(date, scope, dir) {
  const d = new Date(date + 'T00:00:00')
  if (scope === 'daily') d.setDate(d.getDate() + dir)
  else if (scope === 'weekly') d.setDate(d.getDate() + dir * 7)
  else d.setMonth(d.getMonth() + dir)
  return iso(d)
}

function rangeLabel(data) {
  if (!data) return ''
  const { scope, date, range } = data
  const opts = { day: '2-digit', month: 'short', year: 'numeric' }
  if (scope === 'daily')
    return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', ...opts })
  if (scope === 'monthly')
    return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const s = new Date(range.start + 'T00:00:00'), e = new Date(range.end + 'T00:00:00')
  return `${s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString('en-GB', opts)}`
}

function StatTile({ label, value, tone = 'gray' }) {
  const tones = {
    gray: 'text-gray-100', green: 'text-green-400', red: 'text-red-400', blue: 'text-primary-400',
  }
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value}</p>
    </div>
  )
}

function Dot({ status }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold mx-auto'
  if (status === 'present') return <div className={`${base} bg-[#368239] text-white`}><Check size={13} /></div>
  if (status === 'absent') return <div className={`${base} bg-[#990F02] text-white`}><X size={12} /></div>
  return <div className={`${base} bg-gray-700/40 text-gray-600`}>·</div>
}

export default function Attendance() {
  const qc = useQueryClient()
  const [type, setType] = useState('member')
  const [scope, setScope] = useState('daily')
  const [date, setDate] = useState(iso(new Date()))
  const [showDevice, setShowDevice] = useState(false)
  // Live runs app-wide (see LiveEntrance in AppLayout) so it survives page changes;
  // this page just toggles it.
  const { live, setLive } = useLiveStore()

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', type, scope, date],
    queryFn: async () => {
      const { data } = await api.get('/attendance/', { params: { type, scope, date } })
      return data
    },
    placeholderData: keepPreviousData,
  })

  const sync = useMutation({
    mutationFn: () => api.post('/attendance/device/sync/'),
    onSuccess: (r) => {
      toast.success(r.data.message || 'Synced')
      qc.invalidateQueries({ queryKey: ['attendance'] })
      qc.invalidateQueries({ queryKey: ['device-config'] })
      qc.invalidateQueries({ queryKey: ['device-ping'] })
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Sync failed'),
  })

  // Device reachability, shown as a Wi-Fi badge in the header. Only polled once a
  // device IP is configured; each ping is capped server-side (5s) so an offline
  // device can't hang the poll. Refreshed on an interval and on window focus.
  const { data: devCfg } = useQuery({
    queryKey: ['device-config'],
    queryFn: async () => (await api.get('/attendance/device/')).data,
  })
  const hasDevice = !!devCfg?.ip
  const { data: pingData, isFetching: pinging } = useQuery({
    queryKey: ['device-ping'],
    queryFn: async () => (await api.post('/attendance/device/ping/')).data,
    enabled: hasDevice,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 20000,
    retry: false,
  })
  const deviceOnline = !!pingData?.online
  const checkingDevice = pinging && !pingData

  const stats = data?.stats || {}
  const rows = data?.rows || []
  const days = data?.days || []

  const exportSheet = () => {
    const data = rows.map((r) => {
      const base = { Name: r.name, Code: r.code || '' }
      if (scope === 'daily') {
        const c = r.days[days[0]] || {}
        return { ...base, 'Check In': c.check_in || '',
                 Status: c.status === 'present' ? 'Present' : 'Absent' }
      }
      const perDay = {}
      days.forEach((d) => {
        const st = (r.days[d] || {}).status
        perDay[d.slice(5)] = st === 'present' ? 'P' : st === 'absent' ? 'A' : ''
      })
      return { ...base, ...perDay, Present: r.present, 'Total Days': r.total, 'Rate %': r.rate }
    })
    exportToExcel(data, `Attendance_${type}_${scope}_${date}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Attendance</h1>
          <p className="text-gray-500 text-sm mt-1">Biometric check-ins synced from your ZKTeco device.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportSheet} disabled={!rows.length}
            className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 disabled:opacity-40 transition" title="Export">
            <Download size={18} />
          </button>
          {hasDevice && (
            <span className="relative flex items-center p-2"
              title={pingData?.message || (checkingDevice ? 'Checking device…' : deviceOnline ? 'Device connected' : 'Device offline')}>
              {deviceOnline
                ? <Wifi size={18} className="text-green-400" />
                : <WifiOff size={18} className="text-gray-500" />}
              <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                checkingDevice ? 'bg-amber-400 animate-pulse'
                  : deviceOnline ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
            </span>
          )}
          <button onClick={() => sync.mutate()} disabled={sync.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 disabled:opacity-40 transition text-sm"
            title="Pull the latest punches from the device now">
            <RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} /> {sync.isPending ? 'Syncing…' : 'Sync'}
          </button>
          <button onClick={() => { const nv = !live; if (nv) initAudio(); setLive(nv) }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition text-sm ${
              live
                ? 'bg-green-500/20 text-green-300 border-green-400/40 hover:text-white [--btn-fill:34_197_94] [--btn-edge:21_128_61]'
                : 'bg-primary-500/20 text-primary-300 border-primary-400/30 hover:text-white hover:border-primary-500'}`}
            title="Play a sound on each entrance scan — ting for active, buzzer for expired">
            <Radio size={16} className={live ? 'animate-pulse' : ''} /> {live ? 'Live · On' : 'Live'}
          </button>
          <button onClick={() => setShowDevice(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 transition text-sm">
            <Settings size={16} /> Device
          </button>
        </div>
      </div>

      {/* Member / Trainer tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'rgb(var(--surface) / 0.6)' }}>
        {[['member', 'Members', Users], ['trainer', 'Trainers', Dumbbell]].map(([val, label, Icon]) => (
          <button key={val} onClick={() => setType(val)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition ${
              type === val ? 'bg-primary-500/80 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Scope switch + date nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'rgb(var(--surface) / 0.6)' }}>
          {['daily', 'weekly', 'monthly'].map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition ${
                scope === s ? 'bg-primary-500/80 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setDate(shiftDate(date, scope, -1))}
            className="p-1.5 rounded-lg bg-primary-500/15 text-primary-300 hover:text-white transition">
            <ChevronLeft size={15} />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 rounded-lg min-w-[11rem] justify-center">
            <CalendarDays size={13} className="text-primary-400" />
            <span className="text-sm font-medium text-gray-100">{rangeLabel(data)}</span>
          </div>
          <button onClick={() => setDate(shiftDate(date, scope, 1))}
            className="p-1.5 rounded-lg bg-primary-500/15 text-primary-300 hover:text-white transition">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => setDate(iso(new Date()))}
            className="ml-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600/20 text-primary-400 hover:text-white transition">
            Today
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {scope === 'daily' ? (
          <>
            <StatTile label="Total" value={stats.total ?? '—'} />
            <StatTile label="Present" value={stats.present ?? '—'} tone="green" />
            <StatTile label="Absent" value={stats.absent ?? '—'} tone="red" />
            <StatTile label="Attendance" value={`${stats.rate ?? 0}%`} tone="blue" />
          </>
        ) : (
          <>
            <StatTile label={type === 'trainer' ? 'Trainers' : 'Members'} value={stats.total ?? '—'} />
            <StatTile label="Present Today" value={stats.present_today ?? '—'} tone="green" />
            <StatTile label="Avg / Day" value={stats.avg_daily ?? '—'} tone="blue" />
            <StatTile label={scope === 'weekly' ? 'Week Rate' : 'Month Rate'} value={`${stats.rate ?? 0}%`} tone="blue" />
          </>
        )}
      </div>

      {/* Sheet */}
      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : !rows.length ? (
        <div className="card py-16 text-center text-gray-400">No {type}s to show.</div>
      ) : scope === 'daily' ? (
        <DailySheet rows={rows} day={days[0]} />
      ) : (
        <MatrixSheet rows={rows} days={days} scope={scope} />
      )}

      <Modal isOpen={showDevice} onClose={() => setShowDevice(false)} title="Biometric Device">
        <DevicePanel />
      </Modal>
    </div>
  )
}

function DailySheet({ rows, day }) {
  return (
    <div className="card divide-y divide-gray-700/60">
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <span className="flex-1">Name</span>
        <span className="w-20 text-center">Check In</span>
        <span className="w-28 text-center">Status</span>
      </div>
      {rows.map((r) => {
        const cell = r.days[day] || { status: 'absent' }
        const present = cell.status === 'present'
        return (
          <div key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-700/30 transition">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-100 truncate">{r.name}</p>
              {r.code && <p className="text-xs text-gray-500">#{r.code}</p>}
            </div>
            <span className="w-20 text-center text-sm text-gray-300">{cell.check_in || '—'}</span>
            <div className="w-28 flex justify-center">
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                present ? 'bg-[#368239] text-white' : 'bg-[#990F02] text-white'}`}>
                {present ? 'Present' : 'Absent'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MatrixSheet({ rows, days, scope }) {
  const head = days.map((d) => {
    const dt = new Date(d + 'T00:00:00')
    return scope === 'weekly'
      ? { key: d, top: WEEKDAYS[(dt.getDay() + 6) % 7], bottom: dt.getDate() }
      : { key: d, top: dt.getDate(), bottom: null }
  })
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="sticky left-0 surface z-10 text-left font-semibold uppercase tracking-wider px-4 py-3 min-w-[10rem]">Name</th>
            {head.map((h) => (
              <th key={h.key} className="px-1 py-2 font-medium text-center min-w-[2.2rem]">
                <div>{h.top}</div>
                {h.bottom != null && <div className="text-gray-600">{h.bottom}</div>}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-center min-w-[4rem]">Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-700/50 hover:bg-gray-700/20">
              <td className="sticky left-0 surface z-10 px-4 py-2">
                <p className="font-medium text-gray-100 text-sm truncate">{r.name}</p>
                {r.code && <p className="text-[10px] text-gray-500">#{r.code}</p>}
              </td>
              {days.map((d) => {
                const cell = r.days[d] || { status: 'absent' }
                return (
                  <td key={d} className="px-1 py-1.5 text-center">
                    <Dot status={cell.status} />
                  </td>
                )
              })}
              <td className="px-3 text-center">
                <span className={`text-sm font-semibold ${r.rate >= 75 ? 'text-green-400' : r.rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {r.rate}%
                </span>
                <div className="text-[10px] text-gray-500">{r.present}/{r.total}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
