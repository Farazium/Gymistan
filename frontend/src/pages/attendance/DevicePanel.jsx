import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Wifi, WifiOff, Users, Check, UserPlus, Search, Loader2,
  Laptop, Copy, Eye, EyeOff, RotateCcw, Download, ChevronDown } from 'lucide-react'
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
  const [conn, setConn] = useState(null) // null | {online, message}
  const [showCode, setShowCode] = useState(false)
  const [showDirect, setShowDirect] = useState(false)
  const [copied, setCopied] = useState(false)
  // A ticking clock, so "Running" decays to "Stopped" on its own while the panel
  // is open rather than waiting for something else to trigger a re-render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const { data: cfg } = useQuery({
    queryKey: ['device-config'],
    queryFn: async () => (await api.get('/attendance/device/')).data,
    // The agent checks in every minute; refetch so its status is current while
    // someone is actually looking at this panel.
    refetchInterval: 30_000,
  })

  // Seed the editable form as soon as the config is known — whether it came from
  // the network or straight from the react-query cache on a reopen. Adjusting
  // state during render (guarded, so it runs once) is React's sanctioned pattern;
  // deriving it inside the queryFn meant a cached reopen never seeded the form, so
  // the panel sat on "Loading…" until a background refetch happened to run.
  if (cfg && form === null) {
    setForm({ name: cfg.name, ip: cfg.ip, port: cfg.port, password: cfg.password })
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(cfg.agent_token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy — select the code and copy it by hand')
    }
  }

  const resetToken = useMutation({
    mutationFn: () => api.post('/attendance/device/agent-token/'),
    onSuccess: () => {
      toast.success('New setup code issued')
      qc.invalidateQueries({ queryKey: ['device-config'] })
      setShowCode(true)
    },
    onError: () => toast.error('Could not issue a new code'),
  })

  const ping = useMutation({
    mutationFn: (body) => api.post('/attendance/device/ping/', body || {}),
    onMutate: () => setConn(null),
    onSuccess: (r) => { setConn(r.data); qc.invalidateQueries({ queryKey: ['device-ping'] }) },
    onError: (e) => setConn({ online: false, message: e.response?.data?.message || 'Could not reach device' }),
  })

  const save = useMutation({
    mutationFn: (body) => api.put('/attendance/device/', body),
    onSuccess: (_r, body) => {
      toast.success('Device settings saved')
      qc.invalidateQueries({ queryKey: ['device-config'] })
      // Test the just-saved connection so the status reflects these values.
      if ((body.ip || '').trim()) ping.mutate({ ip: body.ip, port: body.port, password: body.password })
      else setConn(null)
    },
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

  const { data: allMembers = [] } = useQuery({
    queryKey: ['members-for-map'],
    queryFn: async () => (await api.get('/members/')).data?.results || (await api.get('/members/')).data || [],
  })
  const { data: allTrainers = [] } = useQuery({
    queryKey: ['trainers-for-map'],
    queryFn: async () => (await api.get('/trainers/')).data?.results || (await api.get('/trainers/')).data || [],
  })
  const people = [...allMembers, ...allTrainers]
  const unpushed = people.filter((p) => !p.device_user_id).length
  const allPushed = people.length > 0 && unpushed === 0

  const push = useMutation({
    mutationFn: () => api.post('/attendance/device/push/'),
    onSuccess: (r) => {
      toast.success(r.data.message || 'Pushed to device')
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['members-for-map'] })
      qc.invalidateQueries({ queryKey: ['trainers'] })
      qc.invalidateQueries({ queryKey: ['trainers-for-map'] })
      qc.invalidateQueries({ queryKey: ['device-users'] })
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Push failed'),
  })

  if (!cfg || !form) return <div className="py-8 text-center text-gray-400">Loading…</div>

  const status = cfg.last_sync_status || ''
  const ok = status.startsWith('OK') || status.startsWith('Agent')

  // The agent checks in every minute, so anything inside three is comfortably
  // alive; beyond that it has stopped, and the gym needs to know rather than
  // wonder why today's attendance is empty.
  const seenAt = cfg.agent_last_seen ? new Date(cfg.agent_last_seen) : null
  const agentOnline = seenAt && (now - seenAt) < 3 * 60 * 1000
  // Either route counts: the agent (hosted) or a direct IP (backend on the
  // gym's own network). Gating these on the IP alone left the buttons dead for
  // every hosted gym, which is all of them.
  const reachable = agentOnline || !!cfg.ip

  return (
    <div className="space-y-6">
      {/* Gym PC agent — the only way a cloud-hosted Gymistan can read a device
          that sits on the gym's own network. Kept at the top because for every
          hosted gym this IS the connection; the IP fields below only do anything
          when the backend happens to share a network with the device. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Laptop size={15} /> Gym PC Agent
          </h3>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ring-1 ${
            agentOnline
              ? 'bg-green-500/15 text-green-300 ring-green-500/30'
              : seenAt
                ? 'bg-red-500/15 text-red-300 ring-red-500/30'
                : 'bg-gray-500/15 text-gray-400 ring-gray-500/30'
          }`}>
            {agentOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {agentOnline ? 'Running' : seenAt ? `Stopped — last seen ${timeAgo(cfg.agent_last_seen)}` : 'Not set up yet'}
          </span>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Your device sits on the gym's own network, which Gymistan cannot reach from
          the internet. A small program on any PC at the gym reads the device and sends
          attendance up. Nothing on the device changes, and nothing is exposed online.
        </p>

        <div>
          <label className="label">Setup code</label>
          <div className="flex items-center gap-2">
            <input
              className="input font-mono text-xs"
              readOnly
              type={showCode ? 'text' : 'password'}
              value={cfg.agent_token || ''}
              onFocus={(e) => e.target.select()}
            />
            <button onClick={() => setShowCode((v) => !v)} className="btn-secondary !px-2.5" title={showCode ? 'Hide' : 'Show'}>
              {showCode ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button onClick={copyCode} className="btn-secondary !px-2.5" title="Copy">
              {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
            </button>
            <button
              onClick={() => { if (confirm('Issue a new setup code? The agent already running at the gym will stop working until you paste the new code into it.')) resetToken.mutate() }}
              disabled={resetToken.isPending}
              className="btn-danger !px-2.5"
              title="Issue a new code"
            >
              <RotateCcw size={15} className={resetToken.isPending ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Treat this like a password — it lets a PC send attendance for your gym.
          </p>
        </div>

        <ol className="text-xs text-gray-400 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>On a PC at the gym that stays on, download and run <span className="text-gray-300 font-medium">GymistanAgent</span>.</li>
          <li>Paste the setup code above when it asks. It finds the device by itself.</li>
          <li>Leave it running. Attendance arrives here within a minute of each scan.</li>
        </ol>

        <div className="flex items-center gap-3 flex-wrap">
          <a href="/GymistanAgent.exe" className="btn-primary" download>
            <Download size={15} /> Download agent
          </a>
          {cfg.agent_serial && (
            <span className="text-[11px] text-gray-500">
              Reporting device: <span className="text-gray-400 font-mono">{cfg.agent_serial}</span>
              {cfg.agent_version && ` · agent v${cfg.agent_version}`}
            </span>
          )}
        </div>
      </div>

      {/* Direct connection — only meaningful when the backend shares a network
          with the device, which a hosted gym never does. Left in place for a
          gym-local install, but folded away behind a disclosure so its ping
          failing doesn't read as something being broken. */}
      <div className="border-t border-gray-700/60 pt-4 space-y-3">
        <button
          onClick={() => setShowDirect((v) => !v)}
          className="no-fx flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-200 transition"
        >
          <Wifi size={15} />
          Direct connection (advanced)
          <ChevronDown size={14} className={`transition-transform ${showDirect ? 'rotate-180' : ''}`} />
        </button>
        {!showDirect && (
          <p className="text-xs text-gray-500">
            Only works when Gymistan runs on the gym's own network. Hosted online it
            cannot reach your device — the agent above is what does.
          </p>
        )}
      </div>
      <div className={showDirect ? 'space-y-3' : 'hidden'}>
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
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleSave} disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          {(save.isPending || ping.isPending) ? (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" /> {save.isPending ? 'Saving…' : 'Connecting…'}
            </span>
          ) : conn ? (
            <span className={`flex items-center gap-1.5 text-xs ${conn.online ? 'text-green-400' : 'text-red-400'}`}
              title={conn.message}>
              {conn.online ? <Wifi size={14} /> : <WifiOff size={14} />}
              {conn.online ? 'Connected' : 'Unable to connect'}
            </span>
          ) : null}
        </div>
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
          <button onClick={() => sync.mutate()} disabled={sync.isPending || !reachable}
            className="btn-primary" title={!reachable ? 'Start the agent on the gym PC first' : ''}>
            <RefreshCw size={15} className={sync.isPending ? 'animate-spin' : ''} /> Sync Now
          </button>
        </div>
        {!cfg.ip && <p className="text-xs text-gray-500">Set the device IP above to enable syncing.</p>}
      </div>

      {/* Push members to device */}
      <div className="border-t border-gray-700/60 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><UserPlus size={15} /> Add people to device</h3>
        <p className="text-xs text-gray-500">
          Push every member’s and trainer’s name and ID onto the device from here — no typing on the
          keypad. Anyone without a device ID gets one automatically. Each person then just places their
          finger on the sensor once to enroll (or taps their card).
        </p>
        <button onClick={() => push.mutate()} disabled={push.isPending || !reachable || allPushed}
          className="btn-primary"
          title={!reachable ? 'Start the agent on the gym PC first'
            : allPushed ? 'Everyone is already on the device' : ''}>
          <UserPlus size={15} className={push.isPending ? 'animate-pulse' : ''} />
          {push.isPending ? 'Pushing…' : allPushed ? 'Everyone on device' : 'Push everyone to device'}
        </button>
        {allPushed && (
          <p className="text-xs text-green-400 flex items-center gap-1.5"><Check size={13} /> Everyone is on the device.</p>
        )}
      </div>

      {/* Enrollment mapping */}
      <div className="border-t border-gray-700/60 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><Users size={15} /> Enrollment</h3>
          <button onClick={() => setShowUsers(true)} disabled={!cfg.ip}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-200 disabled:opacity-40 [--btn-fill:55_65_81] [--btn-edge:31_41_55]">
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
  const [q, setQ] = useState('')
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
  const allUsers = data?.users || []
  const term = q.trim().toLowerCase()
  const users = term
    ? allUsers.filter((u) => (u.name || '').toLowerCase().includes(term) || String(u.user_id).includes(term))
    : allUsers

  return (
    <div className="mt-2 space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${allUsers.length} device users…`}
          className="input pl-9 py-1.5 text-sm"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-700/60 divide-y divide-gray-700/50">
        {users.map((u) => (
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
        {!allUsers.length && <p className="text-sm text-gray-400 px-3 py-3">No users on the device.</p>}
        {!!allUsers.length && !users.length && <p className="text-sm text-gray-400 px-3 py-3">No match for “{q}”.</p>}
      </div>
    </div>
  )
}
