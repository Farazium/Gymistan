import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Building2, Camera, Image as ImageIcon, Check, ChevronRight } from 'lucide-react'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import { applyTheme, applySurface, PRESETS, SURFACE_PRESETS, DEFAULT_THEME, DEFAULT_SURFACE } from '../../utils/theme'

// Small "not wired yet" tag for placeholder settings.
const SoonBadge = () => (
  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 font-medium">Soon</span>
)

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
      className="inline-flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-lg border border-gray-600 hover:bg-gray-700/50 transition"
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
          className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition ${
            current === p.id ? 'border-primary-500 bg-primary-500/10' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-700/40'
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

export default function Settings() {
  const { user, setUser } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const [gymName, setGymName] = useState(user?.gym_name || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [theme, setTheme] = useState(user?.gym_theme || DEFAULT_THEME)
  const [surface, setSurface] = useState(user?.gym_card || DEFAULT_SURFACE)
  const [colorModal, setColorModal] = useState(null) // 'accent' | 'card' | null
  // Placeholder-only settings (not persisted yet).
  const [printable, setPrintable] = useState(false)
  const logoRef = useRef(null)

  const gymLogoUrl = user?.gym_logo ? `http://localhost:8000${user.gym_logo}` : null

  const profileMutation = useMutation({
    mutationFn: () => api.patch('/auth/me/', { name }),
    onSuccess: ({ data }) => setUser(data),
    onError: () => toast.error('Failed to update name'),
  })

  const gymMutation = useMutation({
    mutationFn: ({ gymName: n, logo }) => {
      const form = new FormData()
      if (n !== undefined) form.append('name', n)
      if (logo) form.append('logo', logo)
      return api.patch(`/gyms/${user.gym}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: ({ data }) => setUser({ ...user, gym_name: data.name, gym_logo: data.logo || user.gym_logo }),
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
    themeMutation.mutate(color) // persist
  }

  const surfaceMutation = useMutation({
    mutationFn: (color) => api.patch(`/gyms/${user.gym}/`, { card_color: color }),
    onSuccess: ({ data }) => { setUser({ ...user, gym_card: data.card_color }); toast.success('Card color updated') },
    onError: () => { setSurface(user?.gym_card || DEFAULT_SURFACE); applySurface(user?.gym_card); toast.error('Failed to update card color') },
  })

  const selectSurface = (color) => {
    setSurface(color)
    applySurface(color)
    surfaceMutation.mutate(color)
  }

  const passwordMutation = useMutation({
    mutationFn: () => api.post('/auth/change-password/', { current_password: currentPw, new_password: newPw }),
    onSuccess: () => { toast.success('Password changed'); setCurrentPw(''); setNewPw(''); setConfirmPw('') },
    onError: (err) => toast.error(err.response?.data?.current_password?.[0] || err.response?.data?.non_field_errors?.[0] || 'Failed to change password'),
  })

  const nameChanged = name.trim() && name !== user?.name
  const gymChanged = !!user?.gym && gymName.trim() && gymName !== user?.gym_name

  const handleSave = async () => {
    if (!nameChanged && !gymChanged) return
    try {
      if (nameChanged) await profileMutation.mutateAsync()
      if (gymChanged) await gymMutation.mutateAsync({ gymName })
      toast.success('Settings saved')
    } catch { /* per-mutation onError already toasted */ }
  }

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return }
    if (newPw.length < 6) { toast.error('Password must be at least 6 characters'); return }
    passwordMutation.mutate()
  }

  const handleLogoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); e.target.value = ''; return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2 MB'); e.target.value = ''; return }
    gymMutation.mutate({ gymName: undefined, logo: file })
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
          <Row label="Gym Logo" hint="Shown on payment slips">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gray-700 overflow-hidden flex items-center justify-center">
                  {gymLogoUrl
                    ? <img src={gymLogoUrl} alt="Gym logo" className="w-full h-full object-cover" />
                    : <Building2 size={20} className="text-gray-500" />}
                </div>
                <button
                  onClick={() => logoRef.current.click()}
                  className="absolute -bottom-1 -right-1 p-1 bg-primary-600 rounded-full hover:bg-primary-700 transition"
                >
                  <Camera size={10} className="text-white" />
                </button>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>
            </div>
          </Row>
        )}

        <div className="pt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || (!nameChanged && !gymChanged)}
            className="btn-primary justify-center px-6"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Section>

      {/* Customization */}
      <Section title="Customization" description="Personalize how the app looks and behaves">
        {user?.gym && (
          <Row label="Accent Color" hint="Match your gym's brand color">
            <ColorTrigger preset={currentAccent} onClick={() => setColorModal('accent')} />
          </Row>
        )}

        {user?.gym && (
          <Row label="Card Color" hint="Surface tone for cards and sidebar">
            <ColorTrigger preset={currentSurface} onClick={() => setColorModal('card')} bordered />
          </Row>
        )}

        <Row label={<span className="flex items-center gap-2">Background Picture <SoonBadge /></span>} hint="Custom app background">
          <button
            onClick={() => toast('Background pictures coming soon', { icon: '🕓' })}
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition"
          >
            <ImageIcon size={14} /> Choose image
          </button>
        </Row>

        <Row label={<span className="flex items-center gap-2">Printable Receipts <SoonBadge /></span>} hint="Enable a print/PDF button on payments">
          <button
            onClick={() => { setPrintable(v => !v); toast('Printable receipts coming soon', { icon: '🕓' }) }}
            className={`relative w-11 h-6 rounded-full transition ${printable ? 'bg-primary-600' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${printable ? 'translate-x-5' : ''}`} />
          </button>
        </Row>
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
            className="btn-primary justify-center px-6"
          >
            {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </Section>

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
    </div>
  )
}
