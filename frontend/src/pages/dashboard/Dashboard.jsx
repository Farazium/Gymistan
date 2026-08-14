import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Users, CreditCard, TrendingUp, AlertTriangle, Receipt, DollarSign, Boxes, ShoppingCart, Building2, Wallet, Info, Check, Lock, Zap, MessageCircle, Fingerprint, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../api/axios'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import useAuthStore from '../../store/authStore'
import { fmtCurrency as fmt } from '../../utils/format'
import { paymentFor } from '../payments/Payments'
import { CREDIT_TONES, CREDIT_MESSAGES, CREDIT_HINTS, useWaCredits } from '../../utils/waCredits'
import { SUPPORT_EMAIL } from '../../utils/contact'
import EmailLink from '../../components/ui/EmailLink'


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

// Icon + accent colour per tier stay in code (keyed by id). The wording (label,
// name, features) comes from the server, so a superadmin edit shows here too.
const TIER_VISUAL = {
  TIER1:    { icon: Zap,           color: 'blue' },
  TIER2_WA: { icon: MessageCircle, color: 'green' },
  TIER2_AT: { icon: Fingerprint,   color: 'purple' },
  TIER3:    { icon: Zap,           color: 'yellow' },
}
const TIER_PILL = {
  blue:   'bg-primary-500/20 text-primary-300 ring-primary-500/40',
  green:  'bg-green-500/20 text-green-300 ring-green-500/40',
  purple: 'bg-purple-500/20 text-purple-300 ring-purple-500/40',
  yellow: 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/40',
}

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

function TierInfoModal({ tier, tiers, isOpen, onClose }) {
  const { user } = useAuthStore()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Subscription Plans" size="xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {tiers.map((t) => {
              const isCurrent = t.tier_id === tier
              const color = t.color || (TIER_VISUAL[t.tier_id] || TIER_VISUAL.TIER1).color
              const c = TIER_COLORS[color] || TIER_COLORS.blue
              const Icon = (TIER_VISUAL[t.tier_id] || TIER_VISUAL.TIER1).icon
              return (
                <div key={t.tier_id} className={`relative rounded-xl border p-4 flex flex-col ring-1 transition ${isCurrent ? `${c.card} ${TIER_RING[color]}` : 'border-gray-700/50 bg-gray-700/10 opacity-50 ring-gray-700/30'}`}>
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-green-500 text-gray-900 text-xs font-bold px-3 py-0.5 rounded-full whitespace-nowrap">YOUR PLAN</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-3 mt-1">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isCurrent ? TIER_ICON_BG[color] : 'bg-gray-700 text-gray-600'}`}>
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
      <p className="text-xs text-gray-500 text-center mt-4">
        To upgrade, write to us at{' '}
        <EmailLink
          email={SUPPORT_EMAIL}
          subject={`Upgrade — ${user?.gym_name || 'Gymistan'}`}
          className="text-primary-300 underline underline-offset-2 hover:text-primary-200 transition"
        />.
      </p>
    </Modal>
  )
}

function GymDashboard() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showTierInfo, setShowTierInfo] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: async () => { const { data } = await api.get('/dashboard/'); return data }, refetchInterval: 60000 })
  // Plan copy, shared with the superadmin Tiers page — edits there show up here.
  const { data: tiers = [] } = useQuery({ queryKey: ['tiers'], queryFn: async () => (await api.get('/gyms/tiers/')).data })

  const tier = user?.gym_tier || 'TIER1'
  const visual = TIER_VISUAL[tier] || TIER_VISUAL.TIER1
  const TierIcon = visual.icon
  // Bottom row: two inventory cards plus up to two plan-gated ones. Size the row
  // to how many there actually are, so a Starter gym doesn't get a half-empty
  // four-column grid. Full class names (never concatenated) so Tailwind sees them.
  const bottomRowCols = ['lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4'][
    (data?.attendance ? 1 : 0) + (data?.whatsapp ? 1 : 0)
  ]
  const tierInfo = tiers.find((t) => t.tier_id === tier)
  const tierColor = tierInfo?.color || visual.color
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

  const sendDuesReminder = useMutation({
    mutationFn: (id) => api.post(`/members/${id}/dues-reminder/`),
    onSuccess: () => {
      toast.success('Dues reminder sent via WhatsApp!')
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['wa-billing'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send reminder'),
  })

  // Tolerate an older API response: a gym on a cached build shouldn't see a crash
  // where a new table is meant to be.
  const membersWithDues = data?.members_with_dues || []
  const duesTotal = membersWithDues.reduce((s, m) => s + Number(m.dues || 0), 0)

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Overview of your gym's performance</p>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${TIER_PILL[tierColor] || TIER_PILL.blue}`}>
            <TierIcon size={11} /> {tierInfo?.label || tier}{tierInfo?.name ? ` — ${tierInfo.name}` : ''}
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
      <TierInfoModal tier={tier} tiers={tiers} isOpen={showTierInfo} onClose={() => setShowTierInfo(false)} />

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

      {/* Inventory, then the plan-gated stats. The API sends the attendance and
          WhatsApp blocks only for tiers that include those features, so their
          presence — not a tier check here — is what decides whether a card shows. */}
      <div className={`grid grid-cols-2 ${bottomRowCols} gap-4`}>
        <StatCard title="Inventory Stock Value" value={fmt(data.inventory.stock_value)} subtitle="At selling price" icon={Boxes} color="primary" />
        <StatCard title="Inventory Sales (Month)" value={fmt(data.inventory.revenue_this_month)} subtitle="From product sales" icon={ShoppingCart} color="green" />
        {data.attendance && (
          <StatCard
            title="Attendance Today"
            value={data.attendance.present_today}
            subtitle={`${data.attendance.rate}% of ${data.attendance.total_members} members`}
            icon={Fingerprint}
            color="primary"
          />
        )}
        {data.whatsapp && (
          <StatCard
            title="Receipts Sent"
            value={data.whatsapp.receipts_this_month}
            subtitle={`${data.whatsapp.receipts_total} all-time`}
            icon={MessageCircle}
            color="green"
          />
        )}
      </div>

      {/* Two things the desk acts on today — money owed and memberships about to
          lapse — come first; the payment log is a record, not a to-do, so it sits
          underneath. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-100">Outstanding Dues</h3>
            {!!duesTotal && <span className="text-sm font-semibold text-yellow-400">{fmt(duesTotal)}</span>}
          </div>
          <Table>
            <Thead><Th>Member</Th><Th>Phone</Th><Th>Dues</Th>{waEnabled && <Th>Reminder</Th>}</Thead>
            <Tbody>
              {membersWithDues.map((m) => {
                const sending = sendDuesReminder.isPending && sendDuesReminder.variables === m.id
                return (
                <Tr key={m.id}>
                  <Td className="font-medium">{m.name}</Td>
                  <Td>{m.phone}</Td>
                  <Td className="text-yellow-400 font-medium">{fmt(m.dues)}</Td>
                  {waEnabled && (
                    <Td>
                      {m.reminder_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400"><Check size={13} /> Sent</span>
                      ) : (
                        <button
                          onClick={() => sendDuesReminder.mutate(m.id)}
                          disabled={sending || outOfCredits}
                          title={outOfCredits ? 'Out of WhatsApp messages — top up to send' : 'Send WhatsApp dues reminder'}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-green-500/30 text-green-400 hover:text-white hover:bg-green-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed [--btn-fill:34_197_94] [--btn-edge:21_128_61]"
                        >
                          {sending ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                          {sending ? 'Sending' : 'Remind'}
                        </button>
                      )}
                    </Td>
                  )}
                </Tr>
              )})}
              {!membersWithDues.length && <Tr><Td colSpan={waEnabled ? 4 : 3} className="text-center text-gray-400 py-8">Nothing outstanding</Td></Tr>}
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
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-green-500/30 text-green-400 hover:text-white hover:bg-green-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed [--btn-fill:34_197_94] [--btn-edge:21_128_61]"
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

      {/* Recent payments no longer runs the full width: the money that came in
          and the memberships that just ran out are read together — one is the
          day's takings, the other is the day's work. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-100">Recent Payments</h3>
          </div>
          <div className="overflow-x-auto">
          <Table>
            <Thead><Th>Member</Th><Th>Package</Th><Th>Amount</Th><Th>Status</Th><Th>Date</Th></Thead>
            <Tbody>
              {data.recent_payments.map((p) => (
                <Tr key={p.id}>
                  <Td>{p.member_name}</Td>
                  <Td className="text-primary-400">{paymentFor(p) || <span className="text-gray-500">—</span>}</Td>
                  <Td className="font-medium">{fmt(p.amount_paid)}</Td>
                  <Td><span className={`badge-${p.status.toLowerCase()}`}>{p.status}</span></Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                </Tr>
              ))}
              {!data.recent_payments.length && <Tr><Td colSpan={5} className="text-center text-gray-400 py-8">No payments yet</Td></Tr>}
            </Tbody>
          </Table>
          </div>
        </div>

        {/* Caught a moment too late. A membership that lapsed this week is far
            more likely to be won back than one from last month, which is why the
            window is short and why this sits on the dashboard at all. */}
        <div className="card">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-100">Recently Expired</h3>
            <span className="text-xs text-gray-500">Last 5 days</span>
          </div>
          <div className="overflow-x-auto">
          <Table>
            <Thead><Th>Member</Th><Th>Phone</Th><Th>Expired</Th>{waEnabled && <Th>Reminder</Th>}</Thead>
            <Tbody>
              {(data.members_recently_expired || []).map((m) => {
                const sending = sendReminder.isPending && sendReminder.variables === m.id
                return (
                <Tr key={m.id}>
                  <Td className="font-medium">{m.name}</Td>
                  <Td>{m.phone}</Td>
                  <Td className="text-red-400 font-medium">
                    {new Date(m.expiry_date).toLocaleDateString('en-PK')}
                    <span className="block text-[10px] text-gray-500">
                      {m.days_ago === 0 ? 'today' : m.days_ago === 1 ? 'yesterday' : `${m.days_ago} days ago`}
                    </span>
                  </Td>
                  {waEnabled && (
                    <Td>
                      {m.reminder_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400"><Check size={13} /> Sent</span>
                      ) : (
                        <button
                          onClick={() => sendReminder.mutate(m.id)}
                          disabled={sending || outOfCredits}
                          title={outOfCredits ? 'Out of WhatsApp messages — top up to send' : 'Send WhatsApp renewal reminder'}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-green-500/30 text-green-400 hover:text-white hover:bg-green-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed [--btn-fill:34_197_94] [--btn-edge:21_128_61]"
                        >
                          {sending ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                          {sending ? 'Sending' : 'Remind'}
                        </button>
                      )}
                    </Td>
                  )}
                </Tr>
              )})}
              {!(data.members_recently_expired || []).length && (
                <Tr><Td colSpan={waEnabled ? 4 : 3} className="text-center text-gray-400 py-8">Nobody expired in the last 5 days</Td></Tr>
              )}
            </Tbody>
          </Table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  return user?.role === 'SUPERADMIN' ? <SuperAdminDashboard /> : <GymDashboard />
}
