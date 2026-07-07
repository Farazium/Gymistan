import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Wifi, Users, Check } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'

function timeAgo(iso) {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-GB')
}

export default function DevicePanel() {
  const qc = useQueryClient()
  const [form, setForm] = useState(null)
  const [showUsers, setShowUsers] = useState(false)

  const { data: cfg } = useQuery({
    queryKey: ['device-config'],
    queryFn: async () => {
      const { data } = await api.get('/attendance/device/')
      setForm((f) => f ?? { name: data.name, ip: data.ip, port: data.port, password: data.password })
      return data
    },
  })

  const save = useMutation({
    mutationFn: (body) => api.put('/attendance/device/', body),
    onSuccess: () => { toast.success('Device settings saved'); qc.invalidateQueries({ queryKey: ['device-config'] }) },
    onError: () => toast.error('Could not save settings'),
  })

  const handleSave = () => {
    const ip = (form.ip || '').trim()
    if (ip) {
      const valid = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) &&
        ip.split('.').every((n) => Number(n) <= 255)
      if (!valid) { toast.error('Enter a valid IP address (e.g. 192.168.1.201)'); return }
    }
    const port = Number(form.port)
    if (form.port !== '' && form.port != null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      toast.error('Port must be between 1 and 65535'); return
    }
    save.mutate(form)
  }

  const sync = useMutation({
    mutationFn: () => api.post('/attendance/device/sync/'),
    onSuccess: (r) => { toast.success(r.data.message || 'Synced'); qc.invalidateQueries({ queryKey: ['device-config'] }); qc.invalidateQueries({ queryKey: ['attendance'] }) },
    onError: (e) => toast.error(e.response?.data?.message || 'Sync failed'),
  })

  if (!cfg || !form) return <div className="py-8 text-center text-gray-400">Loading…</div>

  const ok = (cfg.last_sync_status || '').startsWith('OK')

  return (
    <div className="space-y-6">
      {/* Connection settings */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><Wifi size={15} /> Connection</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Device Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Front Door" />
          </div>
          <div>
            <label className="label">IP Address</label>
            <input className="input" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.1.201" />
          </div>
          <div>
            <label className="label">Port</label>
            <input className="input" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
          </div>
          <div>
            <label className="label">Comm Password</label>
            <input className="input" type="number" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        </div>
        <button onClick={handleSave} disabled={save.isPending} className="btn-primary">
          {save.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Sync */}
      <div className="border-t border-gray-700/60 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">Sync</h3>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <p className="text-gray-300">
              Last sync: <span className="text-gray-100">{timeAgo(cfg.last_sync_at)}</span>
            </p>
            {cfg.last_sync_status && (
              <p className={`text-xs mt-0.5 ${ok ? 'text-green-400' : 'text-red-400'}`}>{cfg.last_sync_status}</p>
            )}
          </div>
          <button onClick={() => sync.mutate()} disabled={sync.isPending || !cfg.ip}
            className="btn-primary" title={!cfg.ip ? 'Set an IP first' : ''}>
            <RefreshCw size={15} className={sync.isPending ? 'animate-spin' : ''} /> Sync Now
          </button>
        </div>
        {!cfg.ip && <p className="text-xs text-gray-500">Set the device IP above to enable syncing.</p>}
      </div>

      {/* Enrollment mapping */}
      <div className="border-t border-gray-700/60 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><Users size={15} /> Enrollment</h3>
          <button onClick={() => setShowUsers(true)} disabled={!cfg.ip}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-200 hover:bg-gray-700 disabled:opacity-40">
            Load device users
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Enroll a fingerprint on the device (it gives a User ID), then map that ID to a member/trainer here —
          or type it into the member's “Device ID” field.
        </p>
        {showUsers && <DeviceUsers />}
      </div>
    </div>
  )
}

function DeviceUsers() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['device-users'],
    queryFn: async () => (await api.get('/attendance/device/users/')).data,
    retry: false,
  })
  const { data: members = [] } = useQuery({
    queryKey: ['members-for-map'],
    queryFn: async () => (await api.get('/members/')).data?.results || (await api.get('/members/')).data || [],
  })

  const map = useMutation({
    mutationFn: ({ memberId, deviceId }) => api.patch(`/members/${memberId}/`, { device_user_id: String(deviceId) }),
    onSuccess: () => { toast.success('Mapped'); qc.invalidateQueries({ queryKey: ['device-users'] }); qc.invalidateQueries({ queryKey: ['members'] }) },
    onError: (e) => toast.error(e.response?.data?.device_user_id || 'Could not map'),
  })

  if (isLoading) return <p className="text-sm text-gray-400 py-2">Reading device…</p>
  if (error) return <p className="text-sm text-red-400 py-2">{error.response?.data?.message || 'Could not read device'}</p>

  const unmapped = members.filter((m) => !m.device_user_id)

  return (
    <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-gray-700/60 divide-y divide-gray-700/50">
      {(data?.users || []).map((u) => (
        <div key={u.user_id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="w-14 text-gray-400">#{u.user_id}</span>
          <span className="flex-1 text-gray-200 truncate">{u.name || <span className="text-gray-500">—</span>}</span>
          {u.mapped_to ? (
            <span className="flex items-center gap-1 text-green-400 text-xs"><Check size={13} /> {u.mapped_to.name}</span>
          ) : (
            <select
              className="input py-1 text-xs w-40"
              defaultValue=""
              onChange={(e) => e.target.value && map.mutate({ memberId: e.target.value, deviceId: u.user_id })}
            >
              <option value="">Map to member…</option>
              {unmapped.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </div>
      ))}
      {!(data?.users || []).length && <p className="text-sm text-gray-400 px-3 py-3">No users on the device.</p>}
    </div>
  )
}
