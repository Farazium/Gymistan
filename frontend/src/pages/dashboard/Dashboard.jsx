import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Users, CreditCard, TrendingUp, AlertTriangle, Receipt, DollarSign, Boxes, ShoppingCart, Building2, Wallet, Info, X, Check, Lock, Zap, MessageCircle, Fingerprint, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../api/axios'
import StatCard from '../../components/ui/StatCard'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import useAuthStore from '../../store/authStore'
import { fmtCurrency as fmt } from '../../utils/format'
import { CREDIT_TONES, CREDIT_MESSAGES, CREDIT_HINTS, useWaCredits } from '../../utils/waCredits'


// Prepaid-message warning, top of the dashboard. Stays hidden until 80% of the
// pack is spent, then escalates yellow -> orange -> red (levels come from the API).
function WhatsAppCreditBanner() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['wa-billing'],
    queryFn: async () => { const { data } = await api.get('/gyms/whatsapp-billing/'); return data },
  })

  const c = data?.credits
  if (!c?.alert_level) return null

  const tone = CREDIT_TONES[c.alert_level]
  const Icon = c.alert_level === 'exhausted' ? Lock : AlertTriangle

  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${tone.bg} ${tone.border}`}>
      <Icon size={18} className={`${tone.text} shrink-0`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${tone.text}`}>{CREDIT_MESSAGES[c.alert_level](c)}</p>
        <p className="text-xs text-gray-400 mt-0.5">{CREDIT_HINTS[c.alert_level](c)}</p>
      </div>
      <button
        onClick={() => navigate('/settings')}
        className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${tone.text} hover:bg-white/5`}
      >
        View balance
      </button>
    </div>
  )
}


function SuperAdminDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: async () => { const { data } = await api.get('/dashboard/superadmin/'); return data },
    refetchInterval: 60000,
  })

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Platform-wide overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Gyms" value={data.gyms.total} subtitle={`${data.gyms.active} active · ${data.gyms.inactive} inactive`} icon={Building2} color="primary" />
        <StatCard title="Active Gyms" value={data.gyms.active} subtitle={`${data.gyms.inactive} inactive`} icon={Building2} color="green" />
        <StatCard title="Expired Gyms" value={data.gyms.expired} subtitle="Past expiry date" icon={AlertTriangle} color="red" />
        <StatCard title="Expiring Soon" value={data.gyms.expiring_soon} subtitle="Within 7 days" icon={AlertTriangle} color="yellow" />
        <StatCard title="Subscription (Month)" value={fmt(data.subscription_revenue_month)} subtitle="Collected this month" icon={Wallet} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-100">Top Gyms by Members</h3>
          </div>
          <Table>
            <Thead>
              <Th>Gym</Th>
              <Th>Members</Th>
              <Th>Status</Th>
            </Thead>
            <Tbody>
              {data.top_gyms.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <button onClick={() => navigate(`/admin/gyms/${g.id}`)} className="no-fx font-medium text-gray-100 hover:text-primary-400 transition">
                      {g.name}
                    </button>
                  </Td>
                  <Td>{g.member_count}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${g.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                      {g.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                </Tr>
              ))}
              {!data.top_gyms.length && (
                <Tr><Td colSpan={3} className="text-center py-10 text-gray-400">No gyms yet</Td></Tr>
              )}
            </Tbody>
          </Table>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Recent Subscription Payments</h3>
            <span className="text-xs text-gray-500">Total: {fmt(data.subscription_revenue_total)}</span>
          </div>
          <Table>
            <Thead><Th>Gym</Th><Th>Amount</Th><Th>Date</Th></Thead>
            <Tbody>
              {data.recent_gym_payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium">{p.gym__name}</Td>
                  <Td className="text-green-400 font-semibold">{fmt(p.amount)}</Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                </Tr>
              ))}
              {!data.recent_gym_payments.length && (
                <Tr><Td colSpan={3} className="text-center py-8 text-gray-400">No payments yet</Td></Tr>
              )}
            </Tbody>
          </Table>
        </div>
      </div>

      {/* Expired gyms — subscription lapsed, need renewal */}
      <div className="card">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" /> Expired Gyms
          </h3>
          <span className="text-xs text-gray-500">{data.gyms.expired} expired</span>
        </div>
        <Table>
          <Thead>
            <Th>Gym</Th>
            <Th>Members</Th>
            <Th>Expired On</Th>
            <Th>Status</Th>
          </Thead>
          <Tbody>
            {(data.expired_gyms || []).map((g) => (
              <Tr key={g.id}>
                <Td>
                  <button onClick={() => navigate(`/admin/gyms/${g.id}`)} className="no-fx font-medium text-gray-100 hover:text-primary-400 transition">
                    {g.name}
                  </button>
                </Td>
                <Td>{g.member_count}</Td>
                <Td className="text-red-400 font-medium">{new Date(g.expiry_date).toLocaleDateString('en-PK')}</Td>
                <Td>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${g.is_active ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-gray-500/10 text-gray-400 border-gray-500/30'}`}>
                    {g.is_active ? 'Expired' : 'Inactive'}
                  </span>
                </Td>
              </Tr>
            ))}
            {!(data.expired_gyms || []).length && (
              <Tr><Td colSpan={4} className="text-center py-10 text-gray-400">No expired gyms 🎉</Td></Tr>
            )}
          </Tbody>
        </Table>
      </div>
    </div>
  )
}

const TIER_META = {
  TIER1:    { label: 'Starter', color: 'bg-primary-500/20 text-primary-300 ring-primary-500/40',    icon: Zap },
  TIER2_WA: { label: 'Connect', color: 'bg-green-500/20 text-green-300 ring-green-500/40', icon: MessageCircle },
  TIER2_AT: { label: 'Track',   color: 'bg-purple-500/20 text-purple-300 ring-purple-500/40', icon: Fingerprint },
  TIER3:    { label: 'Elite',   color: 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/40', icon: Zap },
}

const TIER_FEATURES = {
  TIER1:    { have: ['Member management','Packages & payments','Expenses tracking','Inventory','Dashboard & reports','Export to Excel'], missing: ['WhatsApp payment slips','Attendance tracking'] },
  TIER2_WA: { have: ['Member management','Packages & payments','Expenses tracking','Inventory','Dashboard & reports','Export to Excel','WhatsApp payment slips'], missing: ['Attendance tracking'] },
  TIER2_AT: { have: ['Member management','Packages & payments','Expenses tracking','Inventory','Dashboard & reports','Export to Excel','Attendance tracking'], missing: ['WhatsApp payment slips'] },
  TIER3:    { have: ['Member management','Packages & payments','Expenses tracking','Inventory','Dashboard & reports','Export to Excel','WhatsApp payment slips','Attendance tracking'], missing: [] },
}

const ALL_TIERS = [
  { id: 'TIER1',    label: 'Tier 1', name: 'Starter', icon: Zap,          color: 'blue',   features: ['Member management','Packages & payments','Expenses tracking','Inventory','Dashboard & reports','Export to Excel'] },
  { id: 'TIER2_WA', label: 'Tier 2.1', name: 'Connect', icon: MessageCircle, color: 'green', features: ['Everything in Starter','WhatsApp payment slips','Digital receipt sharing'] },
  { id: 'TIER2_AT', label: 'Tier 2.2', name: 'Track',   icon: Fingerprint,  color: 'purple', features: ['Everything in Starter','Member check-in / check-out','Attendance reports'] },
  { id: 'TIER3',    label: 'Tier 3', name: 'Elite',   icon: Zap,          color: 'yellow', features: ['Everything in Starter','WhatsApp payment slips','Member check-in / check-out','Attendance reports'] },
]

const TIER_COLORS = {
  blue:   { card: 'border-primary-500/30 bg-primary-500/5',     badge: 'bg-primary-500/20 text-primary-300',    icon: 'text-primary-400' },
  green:  { card: 'border-green-500/30 bg-green-500/5',   badge: 'bg-green-500/20 text-green-300',  icon: 'text-green-400' },
  purple: { card: 'border-purple-500/30 bg-purple-500/5', badge: 'bg-purple-500/20 text-purple-300', icon: 'text-purple-400' },
  yellow: { card: 'border-yellow-500/30 bg-yellow-500/5', badge: 'bg-yellow-500/20 text-yellow-300', icon: 'text-yellow-400' },
}

const TIER_RING = {
  blue:   'ring-primary-500/40',
  green:  'ring-green-500/40',
  purple: 'ring-purple-500/40',
  yellow: 'ring-yellow-500/40',
}
const TIER_ICON_BG = {
  blue:   'bg-primary-500/20 text-primary-400',
  green:  'bg-green-500/20 text-green-400',
  purple: 'bg-purple-500/20 text-purple-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
}

function TierInfoModal({ tier, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative surface rounded-2xl border border-gray-700 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-700 sticky top-0 surface z-10">
          <h2 className="text-gray-100 font-semibold">Subscription Plans</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-100 rounded-lg transition [--btn-fill:55_65_81] [--btn-edge:31_41_55]">
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {ALL_TIERS.map((t) => {
              const isCurrent = t.id === tier
              const c = TIER_COLORS[t.color]
              const Icon = t.icon
              return (
                <div key={t.id} className={`relative rounded-xl border p-4 flex flex-col ring-1 transition ${isCurrent ? `${c.card} ${TIER_RING[t.color]}` : 'border-gray-700/50 bg-gray-700/10 opacity-50 ring-gray-700/30'}`}>
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-green-500 text-gray-900 text-xs font-bold px-3 py-0.5 rounded-full whitespace-nowrap">YOUR PLAN</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-3 mt-1">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isCurrent ? TIER_ICON_BG[t.color] : 'bg-gray-700 text-gray-600'}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium block mb-0.5 ${isCurrent ? c.badge : 'bg-gray-700 text-gray-600'}`}>{t.label}</span>
                      <h3 className={`font-bold text-sm leading-tight ${isCurrent ? 'text-gray-100' : 'text-gray-600'}`}>{t.name}</h3>
                    </div>
                  </div>
                  <ul className="space-y-1.5 flex-1">
                    {t.features.map(f => (
                      <li key={f} className={`flex items-start gap-1.5 text-xs ${isCurrent ? 'text-gray-300' : 'text-gray-600'}`}>
                        {isCurrent
                          ? <Check size={11} className="text-green-400 flex-shrink-0 mt-0.5" />
                          : <Lock size={11} className="flex-shrink-0 mt-0.5" />
                        }
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                      <p className="text-xs text-gray-600 text-center flex items-center justify-center gap-1"><Lock size={10} /> Upgrade required</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-500 text-center mt-4">Contact your Gymistan admin to upgrade.</p>
        </div>
      </div>
    </div>
  )
}

function GymDashboard() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showTierInfo, setShowTierInfo] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: async () => { const { data } = await api.get('/dashboard/'); return data }, refetchInterval: 60000 })

  const tier = user?.gym_tier || 'TIER1'
  const tierMeta = TIER_META[tier]
  const TierIcon = tierMeta.icon
  const waEnabled = tier === 'TIER2_WA' || tier === 'TIER3'
  const outOfCredits = !!useWaCredits(waEnabled)?.exhausted

  const sendReminder = useMutation({
    mutationFn: (id) => api.post(`/members/${id}/reminder/`),
    onSuccess: () => {
      toast.success('Reminder sent via WhatsApp!')
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['wa-billing'] })   // one credit just went
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send reminder'),
  })

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Overview of your gym's performance</p>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${tierMeta.color}`}>
            <TierIcon size={11} /> {ALL_TIERS.find(t => t.id === tier)?.label} — {tierMeta.label}
          </span>
          <button
            onClick={() => setShowTierInfo(true)}
            className="p-1 text-gray-500 hover:text-gray-200 rounded-full transition [--btn-fill:55_65_81] [--btn-edge:31_41_55]"
            title="Plan info"
          >
            <Info size={14} />
          </button>
        </div>
      </div>
      {showTierInfo && <TierInfoModal tier={tier} onClose={() => setShowTierInfo(false)} />}

      {waEnabled && <WhatsAppCreditBanner />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Members" value={data.members.active} subtitle={`${data.members.total} total`} icon={Users} color="primary" />
        <StatCard title="Revenue This Month" value={fmt(data.revenue.this_month)} subtitle="Fees + inventory sales" icon={CreditCard} color="green" trend={data.revenue.growth} />
        <StatCard title="Expenses This Month" value={fmt(data.expenses.this_month)} subtitle="Total spent" icon={Receipt} color="red" />
        <StatCard title="Net Profit" value={fmt(data.net_profit)} subtitle="Fees + inventory sales − expenses" icon={DollarSign} color={data.net_profit >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Expiring Soon" value={data.members.expiring_soon} subtitle="Within 3 days" icon={AlertTriangle} color="yellow" />
        <StatCard title="Expired Members" value={data.members.expired} subtitle="Need renewal" icon={Users} color="red" />
        <StatCard title="New This Month" value={data.members.new_this_month} subtitle="Joined this month" icon={TrendingUp} color="blue" />
        <StatCard title="Inventory Products" value={data.inventory.total_products} subtitle={data.inventory.low_stock_count > 0 ? `⚠ ${data.inventory.low_stock_count} low stock` : 'All stocked'} icon={Boxes} color={data.inventory.low_stock_count > 0 ? 'yellow' : 'primary'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Inventory Stock Value" value={fmt(data.inventory.stock_value)} subtitle="At selling price" icon={Boxes} color="primary" />
        <StatCard title="Inventory Sales (Month)" value={fmt(data.inventory.revenue_this_month)} subtitle="From product sales" icon={ShoppingCart} color="green" />
        <StatCard title="Inventory Profit (Month)" value={fmt(data.inventory.profit_this_month)} subtitle="Sales minus cost" icon={DollarSign} color={data.inventory.profit_this_month >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-100">Recent Payments</h3>
          </div>
          <Table>
            <Thead><Th>Member</Th><Th>Amount</Th><Th>Status</Th><Th>Date</Th></Thead>
            <Tbody>
              {data.recent_payments.map((p) => (
                <Tr key={p.id}>
                  <Td>{p.member_name}</Td>
                  <Td className="font-medium">{fmt(p.amount_paid)}</Td>
                  <Td><span className={`badge-${p.status.toLowerCase()}`}>{p.status}</span></Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                </Tr>
              ))}
              {!data.recent_payments.length && <Tr><Td colSpan={4} className="text-center text-gray-400 py-8">No payments yet</Td></Tr>}
            </Tbody>
          </Table>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-100">Members Expiring Soon</h3>
          </div>
          <Table>
            <Thead><Th>Member</Th><Th>Phone</Th><Th>Expires</Th>{waEnabled && <Th>Reminder</Th>}</Thead>
            <Tbody>
              {data.members_expiring_soon.map((m) => {
                const sending = sendReminder.isPending && sendReminder.variables === m.id
                return (
                <Tr key={m.id}>
                  <Td className="font-medium">{m.name}</Td>
                  <Td>{m.phone}</Td>
                  <Td className="text-orange-400 font-medium">{new Date(m.expiry_date).toLocaleDateString('en-PK')}</Td>
                  {waEnabled && (
                    <Td>
                      {m.reminder_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400"><Check size={13} /> Sent</span>
                      ) : (
                        <button
                          onClick={() => sendReminder.mutate(m.id)}
                          disabled={sending || outOfCredits}
                          title={outOfCredits ? 'Out of WhatsApp messages — top up to send' : 'Send WhatsApp renewal reminder'}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sending ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                          {sending ? 'Sending' : 'Remind'}
                        </button>
                      )}
                    </Td>
                  )}
                </Tr>
              )})}
              {!data.members_expiring_soon.length && <Tr><Td colSpan={waEnabled ? 4 : 3} className="text-center text-gray-400 py-8">No members expiring soon</Td></Tr>}
            </Tbody>
          </Table>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  return user?.role === 'SUPERADMIN' ? <SuperAdminDashboard /> : <GymDashboard />
}
