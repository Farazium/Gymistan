import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Users, CreditCard, Receipt, TrendingUp,
  Building2, Pencil, X, Save, KeyRound, Eye, EyeOff, Phone, MapPin, Calendar, User, Boxes, ShoppingCart, DollarSign, RefreshCw, MessageCircle, Plus, ToggleRight
} from 'lucide-react'
import api from '../../api/axios'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'
import { CREDIT_TONES } from '../../utils/waCredits'
import EmailLink from '../../components/ui/EmailLink'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`
const WA_TIERS = ['TIER2_WA', 'TIER3']

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-700/50 last:border-0">
      <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-primary-400" />
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-gray-100 font-medium mt-0.5">{value || <span className="text-gray-500">—</span>}</p>
      </div>
    </div>
  )
}

/**
 * One per-gym feature switch. The whole `features` object is sent on every
 * change rather than just the key that moved: the backend stores it as one JSON
 * field, so a PATCH carrying a single key would drop the others.
 */
function FeatureToggle({ gymId, features, featureKey, label, hint }) {
  const queryClient = useQueryClient()
  const on = !!features?.[featureKey]

  const mutation = useMutation({
    mutationFn: (next) => api.patch(`/gyms/${gymId}/`, {
      features: { ...(features || {}), [featureKey]: next },
    }),
    onSuccess: (_, next) => {
      queryClient.invalidateQueries({ queryKey: ['gym-stats', gymId] })
      toast.success(next ? `${label} enabled` : `${label} disabled`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update')),
  })

  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={on}
        disabled={mutation.isPending}
        onChange={(e) => mutation.mutate(e.target.checked)}
        className="w-4 h-4 mt-0.5 rounded accent-primary-500 disabled:opacity-40"
      />
      <span>
        <span className="block text-sm text-gray-100 font-medium">{label}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
      </span>
    </label>
  )
}

// Sell a gym a prepaid message pack. The amount is quoted from the gym's rate but
// stays editable for discounts/round figures.
function TopupModal({ gym, onClose, onDone }) {
  const [messages, setMessages] = useState('')
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [notes, setNotes] = useState('')

  const rate = Number(gym.whatsapp_rate || 0)
  const count = Number(messages || 0)
  const quoted = count > 0 ? (count * rate).toFixed(2) : ''
  const effectiveAmount = amountTouched ? amount : quoted

  const mutation = useMutation({
    mutationFn: () => api.post(`/gyms/${gym.id}/whatsapp-topup/`, {
      messages: count,
      amount: effectiveAmount || null,
      notes,
    }),
    onSuccess: ({ data }) => {
      const c = data.credits
      toast.success(`Topped up — balance is now ${c.used}/${c.allowance}`)
      onDone()
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Top-up failed')),
  })

  const carried = gym.wa_remaining || 0
  const newBalance = carried + count

  return (
    <Modal isOpen onClose={onClose} title="Top Up WhatsApp Messages">
      <div className="space-y-4">
        <div>
          <label className="label">Messages to add</label>
          <input
            type="number" min="1" autoFocus className="input w-full"
            placeholder="e.g. 500"
            value={messages}
            onChange={(e) => setMessages(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Amount charged (PKR)</label>
          <input
            type="number" min="0" step="0.01" className="input w-full"
            placeholder={quoted || '0.00'}
            value={effectiveAmount}
            onChange={(e) => { setAmountTouched(true); setAmount(e.target.value) }}
          />
          <p className="text-xs text-gray-500 mt-1">
            {count > 0
              ? `${count} × PKR ${rate} = PKR ${Number(quoted).toLocaleString('en-PK')} — edit to override`
              : `Quoted at this gym's rate of PKR ${rate}/msg`}
          </p>
        </div>
        <div>
          <label className="label">Notes <span className="text-gray-600">(optional)</span></label>
          <input
            className="input w-full" placeholder="e.g. paid via bank transfer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {count > 0 && (
          <div className="rounded-lg bg-gray-800/60 border border-gray-700 p-3 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Unused messages carried over</span>
              <span className="text-gray-200">{carried}</span>
            </div>
            <div className="flex justify-between text-gray-400 mt-1">
              <span>Bought now</span>
              <span className="text-gray-200">+{count}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-100 mt-2 pt-2 border-t border-gray-700">
              <span>New balance</span>
              <span>0 / {newBalance}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={count < 1 || mutation.isPending}
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Adding…' : 'Add Messages'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// A gym's prepaid balance, with the same escalation colours the gym sees.
function WhatsAppCreditsCard({ gym, onTopup }) {
  const tone = CREDIT_TONES[gym.wa_percent_used >= 95 ? 'critical'
    : gym.wa_percent_used >= 90 ? 'high'
    : gym.wa_percent_used >= 80 ? 'low' : 'ok']
  const exhausted = gym.wa_remaining <= 0

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2">
          <MessageCircle size={15} className="text-primary-400" /> WhatsApp Messages
        </h2>
        <button onClick={onTopup} className="btn-primary text-sm flex items-center gap-1.5 px-3 py-1.5">
          <Plus size={14} /> Top Up
        </button>
      </div>

      <div className={`rounded-xl border p-4 ${tone.bg} ${tone.border}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400">Used</p>
            <p className={`text-2xl font-bold mt-1 ${tone.text}`}>
              {gym.wa_used}
              <span className="text-gray-500 font-semibold text-lg"> / {gym.wa_allowance}</span>
            </p>
          </div>
          <p className={`text-sm font-semibold ${tone.text}`}>{gym.wa_remaining} left</p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-gray-700/60 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${tone.bar}`}
               style={{ width: `${gym.wa_allowance ? gym.wa_percent_used : 100}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {gym.wa_allowance === 0
            ? 'Never topped up — this gym cannot send WhatsApp messages yet.'
            : exhausted
              ? 'Pack finished — messaging is paused until the next top-up.'
              : `@ PKR ${Number(gym.whatsapp_rate)}/msg · edit the rate in Gym Details`}
        </p>
      </div>
    </div>
  )
}

export default function GymProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showTopup, setShowTopup] = useState(false)

  const [editingGym, setEditingGym] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState(false)
  const [gymSubscription, setGymSubscription] = useState('')
  const [waRate, setWaRate] = useState('')
  const [gymName, setGymName] = useState('')
  const [gymPhone, setGymPhone] = useState('')
  const [gymAddress, setGymAddress] = useState('')
  const [adminName, setAdminName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gym-stats', id],
    retry: false,
    queryFn: async () => {
      const { data } = await api.get(`/gyms/${id}/stats/`)
      setGymName(data.gym.name || '')
      setGymPhone(data.gym.owner_phone || '')
      setGymAddress(data.gym.address || '')
      setGymSubscription(data.gym.subscription_amount || '')
      setWaRate(data.gym.whatsapp_rate || '')
      setAdminName(data.admin?.name || '')
      return data
    },
  })

  const editMutation = useMutation({
    mutationFn: () => api.patch(`/gyms/${id}/`, { name: gymName, owner_phone: gymPhone, address: gymAddress, subscription_amount: gymSubscription || null, whatsapp_rate: waRate || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-stats', id] })
      queryClient.invalidateQueries({ queryKey: ['gyms'] })
      setEditingGym(false)
      toast.success('Gym updated')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update gym')),
  })

  const adminMutation = useMutation({
    mutationFn: () => api.post(`/gyms/${id}/reset-admin-password/`, {
      name: adminName,
      ...(newPassword ? { new_password: newPassword } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-stats', id] })
      toast.success('Admin updated')
      setNewPassword('')
      setEditingAdmin(false)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update admin'),
  })

  if (isLoading) return (
    <div className="flex justify-center py-32">
      <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
    </div>
  )

  if (isError || !data) return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-gray-300 font-medium">Gym not found</p>
      <p className="text-gray-500 text-sm mt-1">It may have been removed, or the link is wrong.</p>
      <button onClick={() => navigate('/admin/gyms')} className="btn-primary mt-4">
        <ArrowLeft size={16} /> Back to Gyms
      </button>
    </div>
  )

  const { gym, admin, stats } = data

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/gyms')} className="p-2 text-gray-400 hover:text-gray-100 rounded-lg transition [--btn-fill:55_65_81] [--btn-edge:31_41_55]">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center">
            <Building2 size={20} className="text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary-400">{gym.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${gym.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                {gym.is_active ? 'Active' : 'Inactive'}
              </span>
              <span className="text-gray-500 text-xs">Since {new Date(gym.created_at).toLocaleDateString('en-PK')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Gym Details */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100 flex items-center gap-2">
              <Building2 size={15} className="text-primary-400" /> Gym Details
            </h2>
            {!editingGym ? (
              <button onClick={() => setEditingGym(true)} className="no-fx flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition">
                <Pencil size={13} /> Edit
              </button>
            ) : (
              <button onClick={() => { setEditingGym(false); setGymName(gym.name); setGymPhone(gym.owner_phone || ''); setGymAddress(gym.address || '') }} className="no-fx flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition">
                <X size={13} /> Cancel
              </button>
            )}
          </div>

          {!editingGym ? (
            <div>
              <InfoRow icon={Building2} label="Gym Name" value={gym.name} />
              <InfoRow icon={Phone} label="Owner Contact" value={gym.owner_phone} />
              <InfoRow icon={MapPin} label="Address" value={gym.address} />
              <InfoRow icon={Calendar} label="Created" value={new Date(gym.created_at).toLocaleDateString('en-PK')} />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label">Gym Name</label>
                <input className="input" value={gymName} onChange={(e) => setGymName(e.target.value)} />
              </div>
              <div>
                <label className="label">Owner Contact</label>
                <input className="input" placeholder="Private — your contact for the owner" value={gymPhone} onChange={(e) => setGymPhone(e.target.value)} />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" value={gymAddress} onChange={(e) => setGymAddress(e.target.value)} />
              </div>
              <div>
                <label className="label">Subscription Amount (PKR)</label>
                <input className="input" type="text" inputMode="numeric" placeholder="e.g. 5000" value={gymSubscription} onChange={(e) => setGymSubscription(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
              <div>
                <label className="label">WhatsApp Rate (PKR / message)</label>
                <input className="input" type="text" inputMode="decimal" placeholder="e.g. 4.60" value={waRate} onChange={(e) => setWaRate(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
              <button onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="btn-primary w-full justify-center">
                <Save size={14} /> {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Admin Account */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100 flex items-center gap-2">
              <KeyRound size={15} className="text-primary-400" /> Admin Account
            </h2>
            {admin && (!editingAdmin ? (
              <button onClick={() => setEditingAdmin(true)} className="no-fx flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition">
                <Pencil size={13} /> Edit
              </button>
            ) : (
              <button onClick={() => { setEditingAdmin(false); setAdminName(admin.name); setNewPassword('') }} className="no-fx flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition">
                <X size={13} /> Cancel
              </button>
            ))}
          </div>

          {admin ? (
            <>
              {!editingAdmin ? (
                <>
                  <InfoRow icon={User} label="Admin Name" value={admin.name} />
                  <InfoRow icon={KeyRound} label="Email" value={admin.email && (
                    <EmailLink email={admin.email} className="hover:text-primary-300 transition" />
                  )} />
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="label">Admin Name</label>
                    <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input className="input" value={admin.email} disabled className="input opacity-50 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="label">New Password <span className="text-gray-500 text-xs">(leave blank to keep current)</span></label>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        className="input pr-10"
                        placeholder="Min 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="no-fx absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => adminMutation.mutate()}
                    disabled={adminMutation.isPending || !adminName.trim() || (newPassword && newPassword.length < 6)}
                    className="btn-primary w-full justify-center"
                  >
                    <Save size={14} /> {adminMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm">No admin account found for this gym.</p>
          )}
        </div>
      </div>

      {/* Subscription */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2 mb-4">
          <RefreshCw size={15} className="text-primary-400" /> Subscription
        </h2>
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <div>
            <label className="label">Tier</label>
            <select
              className="input w-64"
              value={gym.tier || 'TIER1'}
              onChange={(e) => api.patch(`/gyms/${id}/`, { tier: e.target.value })
                .then(() => { queryClient.invalidateQueries({ queryKey: ['gym-stats', id] }); toast.success('Tier updated') })
                .catch((err) => toast.error(apiErrorMessage(err, 'Failed to update tier')))}
            >
              <option value="TIER1">Tier 1 — Starter</option>
              <option value="TIER2_WA">Tier 2.1 — Connect</option>
              <option value="TIER2_AT">Tier 2.2 — Track</option>
              <option value="TIER3">Tier 3 — Elite</option>
            </select>
          </div>
          <div>
            <p className="label">Subscription Charges</p>
            <p className="text-lg font-semibold text-primary-400 mt-1">
              {gym.subscription_amount ? `PKR ${Number(gym.subscription_amount).toLocaleString('en-PK')}` : <span className="text-gray-500 text-sm">Not set</span>}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Edit in Gym Details</p>
          </div>
        </div>
      </div>

      {/* Extras — switches this one gym was given, outside what its tier includes.
          Kept apart from Tier on purpose: a tier is what a gym is sold, these are
          one-off requests, and mixing them would make the plans look inconsistent. */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-100 flex items-center gap-2 mb-1">
          <ToggleRight size={16} className="text-primary-400" /> Extras
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Features enabled for this gym only. Off everywhere else.
        </p>
        <FeatureToggle
          gymId={id}
          features={gym.features}
          featureKey="daily_member"
          label="Daily members"
          hint="Payments page gets a day-pass entry — name, date and amount, with no membership created."
        />
      </div>

      {/* Prepaid WhatsApp messages — only for plans that include messaging */}
      {WA_TIERS.includes(gym.tier) && (
        <WhatsAppCreditsCard gym={gym} onTopup={() => setShowTopup(true)} />
      )}
      {showTopup && (
        <TopupModal
          gym={gym}
          onClose={() => setShowTopup(false)}
          onDone={() => queryClient.invalidateQueries({ queryKey: ['gym-stats', id] })}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Members" value={stats.active_members} subtitle={`${stats.total_members} total`} icon={Users} color="primary" />
        <StatCard title="Revenue This Month" value={fmt(stats.revenue_this_month)} subtitle="Collected fees" icon={CreditCard} color="green" />
        <StatCard title="Expenses This Month" value={fmt(stats.expenses_this_month)} subtitle="Total spent" icon={Receipt} color="red" />
        <StatCard title="Net Profit" value={fmt(stats.net_profit)} subtitle="Revenue − Expenses" icon={TrendingUp} color={stats.net_profit >= 0 ? 'green' : 'red'} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Expired Members" value={stats.expired_members} subtitle="Need renewal" icon={Users} color="red" />
        <StatCard title="Expiring Soon" value={stats.expiring_soon} subtitle="Within 7 days" icon={Users} color="yellow" />
        <StatCard title="Inventory Products" value={stats.inventory_products} subtitle={stats.inventory_low_stock > 0 ? `⚠ ${stats.inventory_low_stock} low stock` : 'All stocked'} icon={Boxes} color={stats.inventory_low_stock > 0 ? 'yellow' : 'primary'} />
        <StatCard title="Stock Value" value={fmt(stats.inventory_stock_value)} subtitle="At selling price" icon={Boxes} color="primary" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
        <StatCard title="Inventory Sales (Month)" value={fmt(stats.inventory_revenue)} subtitle="From product sales" icon={ShoppingCart} color="green" />
        <StatCard title="Inventory Profit (Month)" value={fmt(stats.inventory_profit)} subtitle="Sales minus cost" icon={DollarSign} color={stats.inventory_profit >= 0 ? 'green' : 'red'} />
      </div>

    </div>
  )
}
