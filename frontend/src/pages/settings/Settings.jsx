import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, Eye, Image as ImageIcon, ImageUp, Check, ChevronRight, FileText, Mail, MessageCircle, MoreVertical, Sparkles, Trash2, Upload } from 'lucide-react'
import Cropper from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import api, { API_ORIGIN } from '../../api/axios'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import TermsContent from '../auth/TermsContent'
import AnimatedBackground from '../../components/AnimatedBackground'
import { getCroppedBlob } from '../../utils/cropImage'
import { mediaUrl } from '../../utils/mediaUrl'
import { applyTheme, applySurface, PRESETS, SURFACE_PRESETS, DEFAULT_THEME, DEFAULT_SURFACE } from '../../utils/theme'
import { isPrintingEnabled, setPrintingEnabled, getPaperWidth, setPaperWidth } from '../../utils/printReceipt'
import { CREDIT_TONES } from '../../utils/waCredits'
import { SUPPORT_EMAIL } from '../../utils/contact'
import EmailLink from '../../components/ui/EmailLink'

// One settings row: label (+ optional hint) on the left, control on the right.
function Row({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <div className="w-64 flex-shrink-0 flex justify-end">{children}</div>
    </div>
  )
}

// Row control that shows the current color + name and opens the picker modal.
function ColorTrigger({ preset, onClick, bordered }) {
  return (
    <button
      onClick={onClick}
      className="no-fx inline-flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-lg border border-gray-600 hover:bg-primary-500/10 transition"
    >
      <span
        className={`w-5 h-5 rounded-full ${bordered ? 'border border-gray-500' : ''}`}
        style={{ backgroundColor: preset.swatch }}
      />
      <span className="text-sm text-gray-200">{preset.name}</span>
      <ChevronRight size={15} className="text-gray-500" />
    </button>
  )
}

// Grid of named color options shown inside the picker modal.
function ColorGrid({ presets, current, onSelect, bordered }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`no-fx flex items-center gap-2.5 p-2.5 rounded-lg border transition ${
            current === p.id ? 'border-primary-500 bg-primary-500/10' : 'border-gray-700 hover:border-primary-500/50 hover:bg-primary-500/10'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${bordered ? 'border border-gray-500' : ''}`}
            style={{ backgroundColor: p.swatch }}
          >
            {current === p.id && <Check size={13} className="text-white" />}
          </span>
          <span className="text-sm text-gray-200">{p.name}</span>
        </button>
      ))}
    </div>
  )
}

// App background: pick between the packaged image, the animated starfield, or
// a gym-uploaded picture. 'Upload' always opens the picker so a new image can
// be chosen and cropped.
const BG_MODES = [
  { id: 'default', label: 'Default', Icon: ImageIcon },
  { id: 'animated', label: 'Animated', Icon: Sparkles },
  { id: 'upload', label: 'Upload', Icon: Upload },
]
// One selectable background option with a live preview thumbnail.
function BgOption({ active, label, disabled, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`no-fx group relative rounded-xl overflow-hidden border-2 text-left transition disabled:opacity-60 ${
        active ? 'border-primary-500' : 'border-gray-700 hover:border-primary-500/50'
      }`}
    >
      <div className="relative aspect-video bg-slate-900">{children}</div>
      <div className="flex items-center justify-between px-3 py-2 bg-black/40">
        <span className="text-sm text-gray-200">{label}</span>
        {active && (
          <span className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
            <Check size={12} className="text-white" />
          </span>
        )}
      </div>
    </button>
  )
}

// Background picker modal: three options with live previews (Default image,
// Animated starfield, your Upload). Default/Animated apply instantly; Upload
// opens the cropper in the same modal.
function BackgroundModal({ isOpen, onClose, mode, currentUrl, busy, onSelectMode, onApplyUpload }) {
  const [view, setView] = useState('choose') // 'choose' | 'crop'
  const [src, setSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const areaRef = useRef(null)
  const fileRef = useRef(null)

  // Reset to the chooser each time the modal closes.
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (!isOpen) { setView('choose'); setSrc(null); setZoom(1); setCrop({ x: 0, y: 0 }) }
  }

  const onCropComplete = useCallback((_area, areaPixels) => { areaRef.current = areaPixels }, [])

  const pickFile = (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('Image must be under 8 MB'); return }
    const reader = new FileReader()
    reader.onload = () => { setSrc(reader.result); setZoom(1); setCrop({ x: 0, y: 0 }); setView('crop') }
    reader.readAsDataURL(file)
  }

  const setBackground = async () => {
    const blob = await getCroppedBlob(src, areaRef.current)
    try { await onApplyUpload(blob); setView('choose'); setSrc(null) } catch { /* mutation toasts */ }
  }

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title="Background" size="lg">
      {view === 'crop' ? (
        <>
          <p className="text-xs text-gray-500 mb-3">Drag to reposition and zoom to fit — cropped to the screen’s 16:9 shape.</p>
          <div className="relative w-full h-72 rounded-xl overflow-hidden bg-black">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={16 / 9}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-gray-400 w-10">Zoom</span>
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary-500"
            />
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => { setView('choose'); setSrc(null) }} disabled={busy} className="btn-secondary">Back</button>
            <button onClick={setBackground} disabled={busy} className="btn-primary">
              {busy ? 'Setting…' : 'Set background'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-4">Pick what shows behind the app. Default and Animated apply instantly; Upload lets you crop your own picture.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <BgOption active={mode === 'default'} label="Default" disabled={busy} onClick={() => onSelectMode('default')}>
              <img src="/Gym_BG.jpg" alt="" className="w-full h-full object-cover" />
            </BgOption>
            <BgOption active={mode === 'animated'} label="Animated" disabled={busy} onClick={() => onSelectMode('animated')}>
              <AnimatedBackground />
            </BgOption>
            <BgOption active={mode === 'upload'} label="Upload" disabled={busy} onClick={() => fileRef.current?.click()}>
              {currentUrl
                ? <img src={currentUrl} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1"><Upload size={20} /><span className="text-xs">Choose…</span></div>}
            </BgOption>
          </div>
          <div className="flex justify-end mt-5">
            <button onClick={onClose} className="btn-primary">Done</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        </>
      )}
    </Modal>
  )
}

// A titled group of setting rows.
function Section({ title, description, children, as = 'div', ...props }) {
  const Tag = as
  return (
    <Tag {...props}>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="card p-5 divide-y divide-gray-700/60">{children}</div>
    </Tag>
  )
}

// Money arrives from the API as a decimal string. The public demo deliberately
// withholds the real per-message price and sends a placeholder instead, so
// anything non-numeric is printed as-is rather than rendering "PKR NaN".
const fmtMoney = (n) => (Number.isFinite(Number(n))
  ? `PKR ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
  : `PKR ${n}`)

const fmtFull = (d) => d ? new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// Prepaid message balance + top-up history, shown at the top of Settings for
// WhatsApp-tier gyms.
function WhatsAppBillingCard() {
  const [showHistory, setShowHistory] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['wa-billing'],
    queryFn: async () => { const { data } = await api.get('/gyms/whatsapp-billing/'); return data },
  })

  if (isLoading || !data?.credits) return null

  const c = data.credits
  const topups = data.topups || []
  const tone = CREDIT_TONES[c.alert_level] || CREDIT_TONES.ok

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <MessageCircle size={15} className="text-primary-400" />
        <h2 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">WhatsApp Billing</h2>
      </div>
      <div className="card p-5 space-y-4 relative">
        {/* Balance: used out of the current pack, with the bar carrying the warning tone */}
        <div className={`rounded-xl border p-4 ${tone.bg} ${tone.border}`}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400">Messages used</p>
              <p className={`text-2xl font-bold mt-1 ${tone.text}`}>
                {c.used.toLocaleString('en-PK')}
                <span className="text-gray-500 font-semibold text-lg"> / {c.allowance.toLocaleString('en-PK')}</span>
              </p>
            </div>
            <p className={`text-sm font-semibold ${tone.text}`}>
              {c.remaining.toLocaleString('en-PK')} left
            </p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-700/60 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${tone.bar}`}
                 style={{ width: `${c.allowance ? c.percent_used : 100}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {c.allowance === 0
              ? 'No messages bought yet — contact Gymistan to buy a pack.'
              : c.exhausted
                ? 'Pack finished — WhatsApp messaging is paused until you top up.'
                : `@ ${fmtMoney(c.rate)}/msg · unused messages carry over to your next top-up`}
          </p>
        </div>

        {/* Footer: top-up count on the left, history menu (3 dots) on the right */}
        <div className="flex items-center justify-between pt-1">
          {topups.length > 0 ? (
            <p className="text-xs text-primary-400/70">
              {topups.length} {topups.length === 1 ? 'top-up' : 'top-ups'} on record
            </p>
          ) : <span />}
          <button
            onClick={() => setShowHistory(true)}
            className="no-fx p-1.5 rounded-lg text-primary-400/70 hover:text-primary-200 hover:bg-primary-500/20 transition"
            title="View top-up history"
            aria-label="View top-up history"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Top-up History" size="xl">
        {topups.length > 0 ? (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium text-right">Bought</th>
                  <th className="py-2 px-3 font-medium text-right">Carried over</th>
                  <th className="py-2 px-3 font-medium text-right">New balance</th>
                  <th className="py-2 px-3 font-medium text-right">Rate/msg</th>
                  <th className="py-2 pl-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {topups.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/50 last:border-0">
                    <td className="py-2.5 pr-3 text-gray-200 whitespace-nowrap">{fmtFull(t.created_at)}</td>
                    <td className="py-2.5 px-3 text-gray-300 text-right">+{t.messages}</td>
                    <td className="py-2.5 px-3 text-gray-400 text-right">{t.carried_over || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-300 text-right">{t.allowance_after}</td>
                    <td className="py-2.5 px-3 text-gray-400 text-right">{fmtMoney(t.rate)}</td>
                    <td className="py-2.5 pl-3 font-semibold text-gray-100 text-right">{fmtMoney(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-600 mt-3">
              Unused messages from your previous pack are added to each new top-up.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-6 text-center">No top-ups yet — contact Gymistan to buy a message pack.</p>
        )}
      </Modal>
    </div>
  )
}

export default function Settings() {
  const { user, setUser } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const [gymName, setGymName] = useState(user?.gym_name || '')
  const [gymPhone, setGymPhone] = useState(user?.gym_phone || '')
  const [gymAddress, setGymAddress] = useState(user?.gym_address || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [theme, setTheme] = useState(user?.gym_theme || DEFAULT_THEME)
  const [surface, setSurface] = useState(user?.gym_card || DEFAULT_SURFACE)
  const [colorModal, setColorModal] = useState(null) // 'accent' | 'card' | null
  const [showTerms, setShowTerms] = useState(false)
  // Superadmin has no gym to persist appearance on, so their theme/card/background
  // are saved device-locally (localStorage) and mirrored onto the user in-session.
  const isSA = user?.role === 'SUPERADMIN'
  // Receipt printing — persisted per-device in localStorage (the thermal printer
  // is physically attached to this machine).
  const [printable, setPrintable] = useState(isPrintingEnabled())
  const [paperWidth, setPaperWidthState] = useState(getPaperWidth())
  const logoRef = useRef(null)

  const togglePrinting = () => {
    const next = !printable
    setPrintable(next)
    setPrintingEnabled(next)
    toast.success(next ? 'Receipt printing enabled' : 'Receipt printing disabled')
  }

  const changePaperWidth = (w) => { setPaperWidthState(w); setPaperWidth(w) }

  const gymLogoUrl = user?.gym_logo ? `${API_ORIGIN}${user.gym_logo}` : null

  // Logo actions sit behind the same three-dot menu the member and trainer
  // photos use, so a logo is managed the same way everywhere.
  const logoMenuRef = useRef(null)
  const [showLogoMenu, setShowLogoMenu] = useState(false)
  const [viewLogo, setViewLogo] = useState(false)
  useEffect(() => {
    if (!showLogoMenu) return
    const onClick = (e) => {
      if (logoMenuRef.current && !logoMenuRef.current.contains(e.target)) setShowLogoMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showLogoMenu])

  const profileMutation = useMutation({
    mutationFn: () => api.patch('/auth/me/', { name }),
    onSuccess: ({ data }) => setUser(data),
    onError: () => toast.error('Failed to update name'),
  })

  const gymMutation = useMutation({
    mutationFn: ({ name: n, phone, address, logo }) => {
      const form = new FormData()
      if (n !== undefined) form.append('name', n)
      if (phone !== undefined) form.append('phone', phone)
      if (address !== undefined) form.append('address', address)
      if (logo) form.append('logo', logo)
      return api.patch(`/gyms/${user.gym}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: ({ data }) => setUser({
      ...user,
      gym_name: data.name,
      gym_phone: data.phone,
      gym_address: data.address,
      gym_logo: data.logo || user.gym_logo,
    }),
    onError: () => toast.error('Failed to update gym'),
  })

  const themeMutation = useMutation({
    mutationFn: (color) => api.patch(`/gyms/${user.gym}/`, { theme_color: color }),
    onSuccess: ({ data }) => { setUser({ ...user, gym_theme: data.theme_color }); toast.success('Theme updated') },
    onError: () => { setTheme(user?.gym_theme || DEFAULT_THEME); applyTheme(user?.gym_theme); toast.error('Failed to update theme') },
  })

  const selectTheme = (color) => {
    setTheme(color)
    applyTheme(color)          // instant preview
    if (isSA) { localStorage.setItem('sa_theme', color); setUser({ ...user, gym_theme: color }); toast.success('Theme updated') }
    else themeMutation.mutate(color) // persist to the gym
  }

  const surfaceMutation = useMutation({
    mutationFn: (color) => api.patch(`/gyms/${user.gym}/`, { card_color: color }),
    onSuccess: ({ data }) => { setUser({ ...user, gym_card: data.card_color }); toast.success('Card color updated') },
    onError: () => { setSurface(user?.gym_card || DEFAULT_SURFACE); applySurface(user?.gym_card); toast.error('Failed to update card color') },
  })

  const selectSurface = (color) => {
    setSurface(color)
    applySurface(color)
    if (isSA) { localStorage.setItem('sa_card', color); setUser({ ...user, gym_card: color }); toast.success('Card color updated') }
    else surfaceMutation.mutate(color)
  }

  // App background mode + upload/crop (Upload opens a modal to pick/reposition).
  const [bgMode, setBgMode] = useState(user?.gym_background_mode || 'default')
  const [bgModalOpen, setBgModalOpen] = useState(false)
  const gymBgUrl = mediaUrl(user?.gym_background_image)

  const bgMutation = useMutation({
    mutationFn: ({ mode, blob }) => {
      // Mode-only changes go as JSON; an upload rides a multipart form.
      if (!blob) return api.patch(`/gyms/${user.gym}/`, { background_mode: mode })
      const form = new FormData()
      form.append('background_mode', mode)
      form.append('background_image', blob, 'background.jpg')
      return api.patch(`/gyms/${user.gym}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: ({ data }) => {
      setBgMode(data.background_mode)
      setUser({
        ...user,
        gym_background_mode: data.background_mode,
        gym_background_image: data.background_image ?? user.gym_background_image,
      })
      toast.success('Background updated')
    },
    onError: () => { setBgMode(user?.gym_background_mode || 'default'); toast.error('Failed to update background') },
  })

  const chooseBgMode = (m) => {
    setBgMode(m)
    if (isSA) { localStorage.setItem('sa_bg_mode', m); setUser({ ...user, gym_background_mode: m }); toast.success('Background updated') }
    else bgMutation.mutate({ mode: m })
  }
  const applyBgUpload = async (blob) => {
    if (!isSA) return bgMutation.mutateAsync({ mode: 'upload', blob })
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
    localStorage.setItem('sa_bg_mode', 'upload')
    localStorage.setItem('sa_bg_image', dataUrl)
    setBgMode('upload')
    setUser({ ...user, gym_background_mode: 'upload', gym_background_image: dataUrl })
    toast.success('Background updated')
  }
  const currentBgLabel = BG_MODES.find((m) => m.id === bgMode)?.label || 'Default'

  const passwordMutation = useMutation({
    mutationFn: () => api.post('/auth/change-password/', { current_password: currentPw, new_password: newPw }),
    onSuccess: () => { toast.success('Password changed'); setCurrentPw(''); setNewPw(''); setConfirmPw('') },
    onError: (err) => toast.error(err.response?.data?.current_password?.[0] || err.response?.data?.non_field_errors?.[0] || 'Failed to change password'),
  })

  const nameChanged = name.trim() && name !== user?.name
  const gymChanged = !!user?.gym && (
    (gymName.trim() && gymName !== user?.gym_name) ||
    gymPhone !== (user?.gym_phone || '') ||
    gymAddress !== (user?.gym_address || '')
  )

  const handleSave = async () => {
    if (!nameChanged && !gymChanged) return
    try {
      if (nameChanged) await profileMutation.mutateAsync()
      if (gymChanged) await gymMutation.mutateAsync({ name: gymName, phone: gymPhone, address: gymAddress })
      toast.success('Settings saved')
    } catch { /* per-mutation onError already toasted */ }
  }

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return }
    if (newPw.length < 6) { toast.error('Password must be at least 6 characters'); return }
    passwordMutation.mutate()
  }

  // Clearing needs its own mutation: the shared gym one keeps the old logo when
  // the response carries none, which is right for a name/phone save but would
  // undo a removal.
  const removeLogoMutation = useMutation({
    mutationFn: () => api.patch(`/gyms/${user.gym}/`, { logo: null }),
    onSuccess: () => { setUser({ ...user, gym_logo: null }); toast.success('Logo removed') },
    onError: () => toast.error('Failed to remove logo'),
  })

  const handleLogoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); e.target.value = ''; return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2 MB'); e.target.value = ''; return }
    gymMutation.mutate({ logo: file })
    toast.success('Logo updated')
  }

  const saving = profileMutation.isPending || gymMutation.isPending
  const currentAccent = PRESETS.find((p) => p.id === theme) || PRESETS[0]
  const currentSurface = SURFACE_PRESETS.find((p) => p.id === surface) || SURFACE_PRESETS[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account and gym preferences</p>
      </div>

      {/* WhatsApp usage billing — only for WhatsApp-enabled gyms */}
      {['TIER2_WA', 'TIER3'].includes(user?.gym_tier) && <WhatsAppBillingCard />}

      {/* Details */}
      <Section title="Details" description="Your account and gym information">
        <Row label="Email" hint="Sign-in email — can't be changed">
          <input className="input opacity-60 cursor-not-allowed" value={user?.email || ''} readOnly />
        </Row>

        <Row label="Display Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Row>

        {user?.gym && (
          <Row label="Gym Name">
            <input className="input" value={gymName} onChange={(e) => setGymName(e.target.value)} />
          </Row>
        )}

        {user?.gym && (
          <Row label="Phone" hint="Your gym's contact — printed on payment slips">
            <input className="input" value={gymPhone} onChange={(e) => setGymPhone(e.target.value)} placeholder="e.g. 0300 1234567" />
          </Row>
        )}

        {user?.gym && (
          <Row label="Address" hint="Printed on payment slips">
            <input className="input" value={gymAddress} onChange={(e) => setGymAddress(e.target.value)} placeholder="Gym address" />
          </Row>
        )}

        {user?.gym && (
          <Row label="Gym Logo" hint="Shown on payment slips">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gray-700 overflow-hidden flex items-center justify-center">
                  {gymLogoUrl
                    ? <img src={gymLogoUrl} alt="Gym logo" className="w-full h-full object-cover" />
                    : <Building2 size={20} className="text-gray-500" />}
                </div>
                <div className="absolute -bottom-1 -right-1" ref={logoMenuRef}>
                  <button
                    onClick={() => setShowLogoMenu((s) => !s)}
                    className="no-fx p-1 bg-primary-600 rounded-full transition"
                    title="Logo options"
                  >
                    {(gymMutation.isPending || removeLogoMutation.isPending)
                      ? <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <MoreVertical size={10} className="text-white" />
                    }
                  </button>
                  {showLogoMenu && (
                    <div className="absolute top-full mt-1 right-0 w-36 surface border border-primary-500/30 rounded-lg shadow-xl z-20 overflow-hidden">
                      {gymLogoUrl && (
                        <button
                          onClick={() => { setShowLogoMenu(false); setViewLogo(true) }}
                          className="no-fx w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-200 hover:bg-primary-500/10 hover:text-primary-300 transition text-left"
                        >
                          <Eye size={14} className="text-primary-400" /> View
                        </button>
                      )}
                      <button
                        onClick={() => { setShowLogoMenu(false); logoRef.current.click() }}
                        className="no-fx w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-200 hover:bg-primary-500/10 hover:text-primary-300 transition text-left border-t border-primary-500/20 first:border-t-0"
                      >
                        <ImageUp size={14} className="text-primary-400" /> {gymLogoUrl ? 'Update' : 'Upload'}
                      </button>
                      {gymLogoUrl && (
                        <button
                          onClick={() => { setShowLogoMenu(false); if (confirm('Remove the gym logo?')) removeLogoMutation.mutate() }}
                          className="no-fx w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition text-left border-t border-primary-500/20"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>
            </div>
          </Row>
        )}

        <div className="pt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || (!nameChanged && !gymChanged)}
            className="no-fx btn-primary justify-center px-6"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Section>

      {/* Customization */}
      <Section title="Customization" description="Personalize how the app looks and behaves">
        {(user?.gym || isSA) && (
          <Row label="Accent Color" hint="Buttons, links, highlights">
            <ColorTrigger preset={currentAccent} onClick={() => setColorModal('accent')} />
          </Row>
        )}

        {(user?.gym || isSA) && (
          <Row label="Card Color" hint="Surface tone for cards and sidebar">
            <ColorTrigger preset={currentSurface} onClick={() => setColorModal('card')} bordered />
          </Row>
        )}

        {(user?.gym || isSA) && (
          <Row label="Background" hint="Default image, animated starfield, or your own picture">
            <button
              onClick={() => setBgModalOpen(true)}
              className="no-fx inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-600 text-gray-200 hover:bg-primary-500/10 transition"
            >
              <ImageIcon size={14} /> {currentBgLabel} <ChevronRight size={15} className="text-gray-500" />
            </button>
          </Row>
        )}

        <Row label="Receipt Printing" hint="Show a print option on payments for a thermal receipt printer">
          <button
            onClick={togglePrinting}
            className={`no-fx relative w-11 h-6 rounded-full transition ${printable ? 'bg-primary-600' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${printable ? 'translate-x-5' : ''}`} />
          </button>
        </Row>

        {printable && (
          <Row label="Receipt Paper Width" hint="Match your thermal printer's roll">
            <div className="inline-flex rounded-lg border border-gray-600 overflow-hidden">
              {[80, 58].map((w) => (
                <button
                  key={w}
                  onClick={() => changePaperWidth(w)}
                  className={`no-fx px-4 py-1.5 text-sm transition ${paperWidth === w ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-primary-500/10'}`}
                >
                  {w}mm
                </button>
              ))}
            </div>
          </Row>
        )}
      </Section>

      {/* Privacy */}
      <Section as="form" title="Privacy" description="Change your account password" onSubmit={handlePasswordSubmit}>
        <Row label="Current Password">
          <input className="input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
        </Row>
        <Row label="New Password">
          <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </Row>
        <Row label="Confirm New Password">
          <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
        </Row>
        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={passwordMutation.isPending || !currentPw || !newPw || !confirmPw}
            className="no-fx btn-primary justify-center px-6"
          >
            {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </Section>

      {/* Help & Support */}
      {/* Where gyms write in for help. The subject line carries the gym's name
          so a reply doesn't have to start by asking who is writing. */}
      <Section title="Help & Support" description="Reach the Gymistan team, or re-read the terms">
        <Row label="Email Support" hint="Questions, problems, or a feature you'd like to see">
          <EmailLink
            email={SUPPORT_EMAIL}
            subject={`Support — ${user?.gym_name || 'Gymistan'}`}
            className="btn-primary justify-center px-4"
          >
            <Mail size={15} />
            {SUPPORT_EMAIL}
          </EmailLink>
        </Row>
        <Row label="Terms & Conditions" hint="The terms you accepted when you signed in">
          <button type="button" onClick={() => setShowTerms(true)} className="btn-secondary justify-center px-4">
            <FileText size={15} />
            View
          </button>
        </Row>
      </Section>

      <Modal isOpen={viewLogo} onClose={() => setViewLogo(false)} title="Gym Logo">
        <div className="flex justify-center">
          <img src={gymLogoUrl} alt="Gym logo" className="max-h-[60vh] max-w-full rounded-xl object-contain" />
        </div>
      </Modal>

      <Modal isOpen={showTerms} onClose={() => setShowTerms(false)} title="Terms & Conditions" size="lg">
        <TermsContent />
      </Modal>

      <Modal isOpen={colorModal === 'accent'} onClose={() => setColorModal(null)} title="Accent Color" size="md">
        <p className="text-xs text-gray-500 mb-4">Used for buttons, links, active menu and highlights.</p>
        <ColorGrid
          presets={PRESETS}
          current={theme}
          onSelect={(id) => { selectTheme(id); setColorModal(null) }}
        />
      </Modal>

      <Modal isOpen={colorModal === 'card'} onClose={() => setColorModal(null)} title="Card Color" size="md">
        <p className="text-xs text-gray-500 mb-4">Surface tone for cards and the sidebar. All kept dark for readability.</p>
        <ColorGrid
          presets={SURFACE_PRESETS}
          current={surface}
          onSelect={(id) => { selectSurface(id); setColorModal(null) }}
          bordered
        />
      </Modal>

      <BackgroundModal
        isOpen={bgModalOpen}
        onClose={() => setBgModalOpen(false)}
        mode={bgMode}
        currentUrl={gymBgUrl}
        busy={bgMutation.isPending}
        onSelectMode={chooseBgMode}
        onApplyUpload={applyBgUpload}
      />
    </div>
  )
}
