import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, User, Building2, Lock, Camera } from 'lucide-react'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'gym', label: 'Gym', icon: Building2 },
  { id: 'password', label: 'Password', icon: Lock },
]

export default function ProfileModal({ onClose }) {
  const { user, setUser } = useAuthStore()
  const [tab, setTab] = useState('profile')
  const [name, setName] = useState(user?.name || '')
  const [gymName, setGymName] = useState(user?.gym_name || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const logoRef = useRef(null)

  const gymLogoUrl = user?.gym_logo
    ? `http://localhost:8000${user.gym_logo}`
    : null

  const profileMutation = useMutation({
    mutationFn: () => api.patch('/auth/me/', { name }),
    onSuccess: ({ data }) => { setUser(data); toast.success('Name updated') },
    onError: () => toast.error('Failed to update name'),
  })

  const gymMutation = useMutation({
    mutationFn: ({ gymName: n, logo }) => {
      const form = new FormData()
      if (n !== undefined) form.append('name', n)
      if (logo) form.append('logo', logo)
      return api.patch(`/gyms/${user.gym}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: ({ data }) => {
      setUser({ ...user, gym_name: data.name, gym_logo: data.logo || user.gym_logo })
      toast.success('Gym settings saved')
    },
    onError: () => toast.error('Failed to update gym'),
  })

  const passwordMutation = useMutation({
    mutationFn: () => api.post('/auth/change-password/', { current_password: currentPw, new_password: newPw }),
    onSuccess: () => { toast.success('Password changed'); setCurrentPw(''); setNewPw(''); setConfirmPw('') },
    onError: (err) => toast.error(err.response?.data?.current_password?.[0] || err.response?.data?.non_field_errors?.[0] || 'Failed to change password'),
  })

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
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-gray-100 font-semibold text-lg">Account Settings</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-100 hover:bg-gray-700 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-gray-700">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition ${
                tab === id ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === 'profile' && (
            <>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-bold text-gray-400">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-gray-100 font-medium">{user?.name}</p>
                  <p className="text-gray-400 text-xs">{user?.email}</p>
                </div>
              </div>
              <div>
                <label className="label">Display Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <button
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending || !name.trim()}
                className="btn-primary w-full justify-center"
              >
                {profileMutation.isPending ? 'Saving...' : 'Save Name'}
              </button>
            </>
          )}

          {tab === 'gym' && (
            <>
              <div className="flex items-center gap-4 mb-2">
                <div className="relative">
                  <div className="w-16 h-16 rounded-xl bg-gray-700 overflow-hidden flex items-center justify-center">
                    {gymLogoUrl
                      ? <img src={gymLogoUrl} alt="Gym logo" className="w-full h-full object-cover" />
                      : <Building2 size={24} className="text-gray-500" />
                    }
                  </div>
                  <button
                    onClick={() => logoRef.current.click()}
                    className="absolute -bottom-1 -right-1 p-1 bg-blue-600 rounded-full hover:bg-blue-700 transition"
                  >
                    <Camera size={10} className="text-white" />
                  </button>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Gym Logo</p>
                  <p className="text-gray-300 text-xs mt-0.5">Used on payment slips</p>
                </div>
              </div>
              <div>
                <label className="label">Gym Name</label>
                <input className="input" value={gymName} onChange={(e) => setGymName(e.target.value)} />
              </div>
              <button
                onClick={() => gymMutation.mutate({ gymName })}
                disabled={gymMutation.isPending || !gymName.trim()}
                className="btn-primary w-full justify-center"
              >
                {gymMutation.isPending ? 'Saving...' : 'Save Gym Settings'}
              </button>
            </>
          )}

          {tab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="label">Current Password</label>
                <input className="input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
              </div>
              <div>
                <label className="label">New Password</label>
                <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
              </div>
              <button
                type="submit"
                disabled={passwordMutation.isPending || !currentPw || !newPw || !confirmPw}
                className="btn-primary w-full justify-center"
              >
                {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
