import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, MessageCircle, CheckCircle2, Search, Trash2, Loader2, CalendarPlus } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import Modal from '../../components/ui/Modal'
import MonthSection from '../../components/ui/MonthSection'
import PaymentForm, { DailyMemberForm } from './PaymentForm'
import toast from 'react-hot-toast'
import { invalidateFinance } from '../../utils/invalidateFinance'
import { apiErrorMessage } from '../../utils/apiError'
import { fmtCurrency as fmt } from '../../utils/format'
import { groupByMonth, useMonthSections } from '../../utils/monthGroups'
import { usePendingWrites, pendingPayments, isPendingRow } from '../../offline/pending'
import PendingBadge from '../../components/PendingBadge'
import { useWaCredits } from '../../utils/waCredits'

/**
 * What a payment row was for, in one phrase. A joining payment covers the package
 * AND the admission fee in a single record, so the list has to name both — showing
 * only the package would quietly hide the admission money from whoever is reading
 * the books.
 */
export function paymentFor(p) {
  // A day pass buys no package, so naming it is the only way the row says what
  // the money was for.
  if (p.is_walkin) return 'Daily Member'
  const parts = []
  if (p.package_name) parts.push(p.package_name)
  if (Number(p.admission_amount) > 0) parts.push(parts.length ? 'Admission' : 'Admission Fee')
  if (Number(p.dues_amount) > 0) parts.push('Dues')
  return parts.join(' + ')
}

export default function Payments() {
  const { user } = useAuthStore()
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)
  const waCredits = useWaCredits(hasWhatsApp)
  const outOfCredits = !!waCredits?.exhausted

  const [search, setSearch] = useState('')
  const [packageFilter, setPackageFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  // Day passes get their own button rather than a mode inside the payment modal:
  // it is a different job, done by a different kind of visitor, and the desk
  // should not have to open a members form to reach it.
  const [showDaily, setShowDaily] = useState(false)
  const dailyEnabled = !!user?.gym_features?.daily_member
  const queryClient = useQueryClient()

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => { const { data } = await api.get('/packages/'); return data?.results || data || [] },
  })

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', search, packageFilter],
    queryFn: async () => {
      const params = {}
      if (search) params.search = search
      if (packageFilter) params.package = packageFilter
      const { data } = await api.get('/payments/', { params })
      return data?.results || data || []
    },
  })

  const downloadSlip = async (id) => {
    try {
      const res = await api.get(`/payments/${id}/slip/`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url; a.download = `slip_${id}.pdf`; a.click()
    } catch { toast.error('Failed to download slip') }
  }

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/payments/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      invalidateFinance(queryClient)
      // The delete rolled the member's expiry and dues back — the roster is stale.
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['members-list'] })
      toast.success('Payment deleted')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete payment')),
  })

  const sendWhatsApp = useMutation({
    mutationFn: (id) => api.post(`/payments/${id}/whatsapp/`),
    onSuccess: () => {
      toast.success('Slip sent via WhatsApp!')
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['wa-billing'] })   // one credit just went
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send'),
  })

  // Guard against rapid double-clicks sending duplicate receipts: track the ids
  // currently in flight in a ref (updated synchronously, so it blocks repeat
  // clicks that fire before React re-renders and disables the button).
  const sendingRef = useRef(new Set())
  const handleSendWhatsApp = (id) => {
    if (sendingRef.current.has(id)) return
    sendingRef.current.add(id)
    sendWhatsApp.mutate(id, { onSettled: () => sendingRef.current.delete(id) })
  }

  // Payments taken while the line was down sit in the list with the rest. They
  // are real money that changed hands; keeping them on a separate screen until
  // the internet returns would leave the desk holding two sets of books.
  const queued = pendingPayments(usePendingWrites())
  const rows = [...queued, ...payments]

  // Sort newest first (by date, then by id so same-day payments keep insertion order), group by month
  const sorted = [...rows].sort((a, b) => {
    if (a.payment_date !== b.payment_date) return a.payment_date < b.payment_date ? 1 : -1
    // A queued row is the most recent thing that happened on this device, and its
    // id is a string — so order those among themselves and keep them on top,
    // rather than handing NaN to the comparator.
    if (isPendingRow(a) !== isPendingRow(b)) return isPendingRow(a) ? -1 : 1
    if (isPendingRow(a)) return b.__queueId - a.__queueId
    return b.id - a.id
  })

  const groups = groupByMonth(sorted, (p) => p.payment_date)
  const months = useMonthSections()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Payments</h1>
          <p className="text-gray-500 text-sm mt-1">
            {rows.length} records
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(sorted.map((p) => ({
              Member: p.member_name || '',
              Type: p.is_walkin ? 'Daily' : 'Member',
              Phone: p.member_phone || '',
              Package: paymentFor(p),
              Amount: p.amount,
              'Amount Paid': p.amount_paid,
              Remaining: p.remaining || 0,
              Discount: p.discount || 0,
              Status: p.status === 'PARTIAL' ? 'Partial' : 'Paid',
              Method: p.payment_method === 'ONLINE' ? 'Online' : 'Cash',
              Date: new Date(p.payment_date).toLocaleDateString('en-PK'),
              Notes: p.notes || '',
            })), 'Payments')}
            className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 transition"
            title="Export"
          >
            <Download size={18} />
          </button>
          {dailyEnabled && (
            <button
              onClick={() => setShowDaily(true)}
              className="btn bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 hover:text-white hover:border-yellow-500 hover:shadow-lg hover:shadow-yellow-500/20 backdrop-blur-sm transition-all [--btn-fill:234_179_8] [--btn-edge:161_98_7]"
            >
              <CalendarPlus size={16} /> Daily Member
            </button>
          )}
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> Record Payment
          </button>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
          <input className="input pl-9" placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto flex-1 min-w-[8.5rem] sm:flex-none" value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
          <option value="">All Packages</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : !rows.length ? (
        <div className="card flex flex-col items-center py-16 text-gray-400">
          No payments recorded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const groupTotal = group.items.reduce((s, p) => s + Number(p.amount_paid), 0)
            return (
              <MonthSection
                key={group.key}
                label={group.label}
                count={`${group.items.length} ${group.items.length === 1 ? 'payment' : 'payments'}`}
                total={fmt(groupTotal)}
                totalClass="text-green-500"
                open={months.isOpen(group.key)}
                onToggle={() => months.toggle(group.key)}
              >
                {/* Seven fixed columns don't fit a phone, so the list scrolls
                    sideways inside its card. The min-width sits on an inner
                    track, otherwise the row dividers would stop at the fold. */}
                <div className="card overflow-x-auto">
                <div className="min-w-[46rem] divide-y divide-gray-700/60">
                  {/* Column headers */}
                  <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex-1">Member</span>
                    <span className="shrink-0 w-28">Package</span>
                    <span className="shrink-0 w-24 text-right">Paid</span>
                    <span className="shrink-0 w-20 text-right">Discount</span>
                    <span className="shrink-0 w-16 text-center">Method</span>
                    <span className="shrink-0 w-24 text-right">Date</span>
                    <span className="shrink-0 w-20 text-right">Actions</span>
                  </div>

                  {group.items.map((p) => (
                    <div key={p.id} className={`flex items-center gap-4 px-4 py-3 hover:bg-primary-500/10 transition-colors ${isPendingRow(p) ? 'opacity-75' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-100 truncate flex items-center gap-2">
                          <span className="truncate">{p.member_name}</span>
                          {p.is_walkin && (
                            <span
                              title="Day pass — not a member"
                              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                            >
                              Daily
                            </span>
                          )}
                          {isPendingRow(p) && <PendingBadge />}
                        </p>
                        <p className="text-xs text-gray-400">{p.member_phone}</p>
                      </div>
                      <span className="shrink-0 w-28 text-primary-400 text-xs truncate">
                        {paymentFor(p) || <span className="text-gray-500">—</span>}
                      </span>
                      <span className="shrink-0 w-24 text-right">
                        <span className="block font-semibold text-green-400">{fmt(p.amount_paid)}</span>
                        {p.status === 'PARTIAL' && (
                          <span className="block text-[10px] text-yellow-400" title="Partly paid — dues outstanding">
                            {fmt(p.remaining)} left
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 w-20 text-right text-sm">
                        {Number(p.discount) > 0 ? <span className="text-orange-400">{fmt(p.discount)}</span> : <span className="text-gray-600">—</span>}
                      </span>
                      <span className="shrink-0 w-16 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.payment_method === 'ONLINE' ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-700 text-gray-300'}`}>
                          {p.payment_method === 'ONLINE' ? 'Online' : 'Cash'}
                        </span>
                      </span>
                      <span className="shrink-0 w-24 text-right text-gray-400 text-sm">
                        {new Date(p.payment_date).toLocaleDateString('en-PK')}
                      </span>
                      <div className="shrink-0 w-20 flex items-center justify-end gap-1">
                        {/* Nothing here can act on a queued payment: the server has
                            never heard of it, so there is no slip to fetch and no
                            receipt to send. Both come back once it syncs. */}
                        {!isPendingRow(p) && (
                        <button onClick={() => downloadSlip(p.id)} title="Download Slip" className="p-1.5 text-gray-400 hover:text-white rounded-lg transition">
                          <Download size={14} />
                        </button>
                        )}
                        {hasWhatsApp && !p.is_walkin && !isPendingRow(p) && (
                          p.slip_sent ? (
                            <span title="Receipt already sent" className="p-1.5 text-green-400 cursor-default">
                              <CheckCircle2 size={14} />
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSendWhatsApp(p.id)}
                              disabled={outOfCredits || (sendWhatsApp.isPending && sendWhatsApp.variables === p.id)}
                              title={outOfCredits ? 'Out of WhatsApp messages — top up to send' : 'Send via WhatsApp'}
                              className="p-1.5 text-gray-400 rounded-lg transition enabled:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed [--btn-fill:34_197_94] [--btn-edge:21_128_61]"
                            >
                              {sendWhatsApp.isPending && sendWhatsApp.variables === p.id
                                ? <Loader2 size={14} className="animate-spin" />
                                : <MessageCircle size={14} />}
                            </button>
                          )
                        )}
                        {p.deletable && (
                          <button onClick={() => { if (confirm(p.is_walkin
                            ? `Delete this payment record?\n\n${p.member_name}'s day pass will be removed from the books. No membership is affected.`
                            : `Delete this payment record?\n\n${p.member_name || 'The member'}'s expiry and dues will be rolled back to what they were before this payment.`)) deleteMutation.mutate(p.id) }} title="Delete" className="p-1.5 text-gray-400 hover:text-white rounded-lg transition [--btn-fill:239_68_68] [--btn-edge:185_28_28]">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </MonthSection>
            )
          })}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Payment">
        <PaymentForm onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['payments'] }) }} />
      </Modal>

      <Modal isOpen={showDaily} onClose={() => setShowDaily(false)} title="Daily Member Payment">
        <DailyMemberForm onSuccess={() => { setShowDaily(false); queryClient.invalidateQueries({ queryKey: ['payments'] }) }} />
      </Modal>
    </div>
  )
}
