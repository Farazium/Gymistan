import { useState, useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, AlertCircle, CheckCircle, MessageCircle } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import useAuthStore from '../../store/authStore'
import { apiErrorMessage } from '../../utils/apiError'
import { invalidateFinance } from '../../utils/invalidateFinance'
import { packagePalette } from '../../utils/packageColors'
import { useWaCredits } from '../../utils/waCredits'
import { fmtCurrency as fmt } from '../../utils/format'
import RadioCard from '../../components/ui/RadioCard'
import Modal from '../../components/ui/Modal'

// A renewal this far ahead of the expiry is almost always the wrong member picked
// off the search list, or a fee being taken twice. Paying a few days early is
// normal, so the check only speaks up past this margin.
const EARLY_RENEWAL_DAYS = 7

function MemberSearch({ members, onChange, onSelect }) {
  const [query, setQuery] = useState('')
  const [searchBy, setSearchBy] = useState('name')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = members.filter(m => {
    const q = query.toLowerCase()
    if (!q) return true
    if (searchBy === 'name') return m.name.toLowerCase().includes(q)
    if (searchBy === 'father_name') return (m.father_name || '').toLowerCase().includes(q)
    if (searchBy === 'phone') return m.phone.includes(q)
    if (searchBy === 'member_id') return (m.member_id || '').includes(q)
    return m.name.toLowerCase().includes(q)
  })

  const select = (m) => {
    setQuery(m.name)
    onChange(m.id)
    onSelect(m)
    setOpen(false)
  }

  const placeholders = { name: 'Search by name...', father_name: "Search by father's name...", phone: 'Search by phone...', member_id: 'Search by ID...' }

  return (
    <div className="relative" ref={ref}>
      <div className="flex">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
          <input
            className="input pl-8 rounded-r-none border-r-0"
            placeholder={placeholders[searchBy]}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) { onChange(''); onSelect(null) } }}
            onFocus={() => setOpen(true)}
          />
        </div>
        <select
          value={searchBy}
          onChange={e => { setSearchBy(e.target.value); setQuery('') }}
          className="input rounded-l-none border-l border-gray-600 w-auto text-xs text-gray-300 pr-7"
        >
          <option value="name">Name</option>
          <option value="father_name">Father's Name</option>
          <option value="phone">Phone</option>
          <option value="member_id">ID</option>
        </select>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 surface border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.length ? filtered.map(m => (
            <div
              key={m.id}
              onClick={() => select(m)}
              className="px-3 py-2 text-sm text-gray-100 hover:bg-primary-500/10 cursor-pointer flex items-center gap-2"
            >
              {m.member_id && <span className="font-mono text-xs text-primary-300 bg-primary-500/15 px-1.5 py-0.5 rounded">{m.member_id}</span>}
              {m.name} <span className="text-gray-400 text-xs">— {m.phone}</span>
            </div>
          )) : (
            <div className="px-3 py-2 text-sm text-gray-400">No members found</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PaymentForm({ onSuccess }) {
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [sendWhatsApp, setSendWhatsApp] = useState(false)
  // The only choice on this form: settle the whole figure, or part of it. What
  // that figure is made of (balance, package fee, or both) follows from the
  // member's own state — see below.
  const [payType, setPayType] = useState('FULL')
  const [paidInput, setPaidInput] = useState('')
  // A built, validated payload parked while the early-renewal warning is up.
  const [pendingPayload, setPendingPayload] = useState(null)
  const { user } = useAuthStore()
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)
  const outOfCredits = !!useWaCredits(hasWhatsApp)?.exhausted
  const queryClient = useQueryClient()
  const { register, handleSubmit, control, setValue } = useForm({
    // No status here: it's derived from the amounts on the server.
    defaultValues: { discount: 0 }
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members-list'],
    queryFn: async () => { const { data } = await api.get('/members/'); return data?.results || data || [] },
  })

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => { const { data } = await api.get('/packages/'); return data?.results || data || [] },
  })

  const selectedPkgId = useWatch({ control, name: 'package' })
  const selectedPkg = packages.find((p) => String(p.id) === String(selectedPkgId))

  const handleMemberSelect = (member) => {
    setSelectedMember(member)
    setPaidInput('')
    setPayType('FULL')
    if (member?.package) {
      setValue('package', String(member.package))
    }
  }

  // What the member is charged is never a choice on this form:
  //  * owes money and still running  -> only the balance; a renewal has to wait
  //    until it's cleared, otherwise the debt just rolls forward forever
  //  * owes money and expired        -> balance + the new cycle, as one figure
  //  * owes nothing                  -> the package fee
  const dues = Number(selectedMember?.dues || 0)
  const expired = selectedMember?.status === 'EXPIRED'
  const renewing = !!selectedMember && (dues === 0 || expired)
  const packageFee = renewing ? Number(selectedPkg?.price) || 0 : 0
  const discountWatch = Number(useWatch({ control, name: 'discount' }) || 0)
  const baseAmount = packageFee + dues
  // A balance was charged once already; a discount can only come off the new fee.
  const discount = Math.min(Math.max(discountWatch, 0), packageFee)
  const payable = Math.max(baseAmount - discount, 0)
  const amountPaid = payType === 'PARTIAL' ? Math.min(Math.max(Number(paidInput) || 0, 0), payable) : payable
  const remaining = Math.max(payable - amountPaid, 0)

  // Days the member still has on the clock. Parsed by hand rather than through
  // `new Date(iso)`, which reads a bare date as UTC and can land a day out.
  const daysLeft = (() => {
    if (!selectedMember?.expiry_date) return null
    const [y, m, d] = selectedMember.expiry_date.split('-').map(Number)
    if (!y || !m || !d) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.round((new Date(y, m - 1, d) - today) / 86400000)
  })()
  // Only a renewal can be "early" — clearing a balance buys no time, so it never asks.
  const earlyRenewal = renewing && !!selectedPkg && daysLeft !== null && daysLeft > EARLY_RENEWAL_DAYS

  const whatsAppMutation = useMutation({
    mutationFn: (id) => api.post(`/payments/${id}/whatsapp/`),
    // The list is refreshed on save, while this send is still in flight — refresh
    // again so the row picks up slip_sent and stops offering to send twice.
    onSuccess: () => {
      toast.success('Receipt sent via WhatsApp!')
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['wa-billing'] })   // one credit just went
    },
    onError: (err) => toast.error(
      err.response?.data?.message || 'Payment saved but WhatsApp failed'),
  })

  const mutation = useMutation({
    mutationFn: (payload) => api.post('/payments/', payload),
    onSuccess: (res) => {
      toast.success('Payment recorded')
      invalidateFinance(queryClient)
      // The payment just moved the member's expiry and/or their outstanding
      // balance — the roster and this form's own member list both go stale.
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['members-list'] })
      if (sendWhatsApp && hasWhatsApp && !outOfCredits) whatsAppMutation.mutate(res.data.id)
      onSuccess()
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to record payment')),
  })

  const onSubmit = (data) => {
    if (!selectedMemberId) { toast.error('Please select a member'); return }
    if (renewing && !selectedPkg) { toast.error('This member has no package — select a package first'); return }
    if (Number(data.discount || 0) < 0) { toast.error('Discount cannot be negative'); return }
    if (Number(data.discount || 0) > packageFee) { toast.error('Discount cannot exceed the package amount'); return }
    if (payType === 'PARTIAL') {
      const entered = Number(paidInput)
      if (!entered || entered <= 0) { toast.error('Enter the amount the member paid'); return }
      if (entered > payable) { toast.error(`Amount paid cannot exceed ${fmt(payable)}`); return }
    }
    const payload = {
      ...data,
      // Clearing a balance buys no time, so it carries no package — that is what
      // stops the backend from rolling the expiry forward again.
      package: renewing ? data.package : null,
      discount,
      member: selectedMemberId,
      amount: baseAmount,
      amount_paid: amountPaid,
      dues_amount: dues,
      notes: data.notes || (renewing ? '' : 'Outstanding dues'),
    }
    // Still well inside their membership: ask before stacking another cycle on top.
    if (earlyRenewal) { setPendingPayload(payload); return }
    mutation.mutate(payload)
  }

  const status = selectedMember?.status
  const expiryDate = selectedMember?.expiry_date
    ? new Date(selectedMember.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')
    : null

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Member *</label>
        <MemberSearch
          members={members}
          onChange={setSelectedMemberId}
          onSelect={handleMemberSelect}
        />
      </div>

      {selectedMember && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
          status === 'EXPIRED' ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : status === 'PARTIAL' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
          : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {status === 'EXPIRED'
            ? <><AlertCircle size={14} /> Expired — was due {expiryDate}</>
            : status === 'PARTIAL'
              ? <><AlertCircle size={14} /> Partial — {fmt(dues)} outstanding, expires {expiryDate}</>
              : <><CheckCircle size={14} /> Active — expires {expiryDate}</>
          }
        </div>
      )}

      <input type="hidden" {...register('package')} />

      {selectedPkg && renewing && (
        <div className={`surface border rounded-lg p-3 text-sm ${packagePalette(selectedPkg).border}`}>
          <p className="text-gray-400 text-xs mb-0.5">Package</p>
          <p className="text-gray-100 font-medium">{selectedPkg.name}</p>
          <p className={`font-semibold ${packagePalette(selectedPkg).price}`}>PKR {Number(selectedPkg.price).toLocaleString('en-PK')}</p>
        </div>
      )}

      {dues > 0 && !expired && (
        <p className="text-xs text-gray-400">
          Clearing the outstanding dues — renewal opens once they're settled.
        </p>
      )}

      <div>
        <label className="label">Payment Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <RadioCard
            checked={payType === 'FULL'}
            onChange={() => { setPayType('FULL'); setPaidInput('') }}
            label="Full payment"
            hint={payable ? fmt(payable) : undefined}
          />
          <RadioCard
            checked={payType === 'PARTIAL'}
            onChange={() => setPayType('PARTIAL')}
            label="Partial payment"
            hint="Member pays part now"
            accent="yellow"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">
            Discount (PKR)
            {!renewing && <span className="text-gray-500 text-xs"> (not on dues)</span>}
          </label>
          <input
            className={`input ${!renewing ? 'opacity-50 cursor-not-allowed' : ''}`}
            type="number"
            min="0"
            disabled={!renewing}
            max={packageFee || undefined}
            defaultValue={0}
            onWheel={e => e.target.blur()}
            onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
            {...register('discount')}
          />
        </div>
        <div>
          <label className="label">Payment Method</label>
          <select className="input" {...register('payment_method')}>
            <option value="CASH">Cash</option>
            <option value="ONLINE">Online</option>
          </select>
        </div>
      </div>

      {payType === 'PARTIAL' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Amount Paid (PKR) *</label>
            <input
              className="input"
              type="number"
              min="0"
              max={payable || undefined}
              value={paidInput}
              onChange={(e) => setPaidInput(e.target.value)}
              onWheel={e => e.target.blur()}
              onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
            />
            {Number(paidInput) > payable && (
              <p className="text-red-500 text-xs mt-1">Cannot exceed {fmt(payable)}</p>
            )}
          </div>
          <div>
            <label className="label">Remaining (PKR)</label>
            <input className="input opacity-70 cursor-not-allowed text-yellow-400" readOnly value={remaining} />
          </div>
        </div>
      )}

      <div>
        <label className="label">Notes</label>
        <textarea className="input h-16 resize-none" {...register('notes')} />
      </div>

      {hasWhatsApp && (
        <label className={`flex items-center gap-2.5 select-none ${outOfCredits ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={sendWhatsApp && !outOfCredits}
            disabled={outOfCredits}
            onChange={(e) => setSendWhatsApp(e.target.checked)}
            className="w-4 h-4 rounded accent-green-500 disabled:opacity-40"
          />
          <MessageCircle size={14} className={outOfCredits ? 'text-gray-600' : 'text-green-400'} />
          <span className={`text-sm ${outOfCredits ? 'text-gray-600' : 'text-gray-300'}`}>
            {outOfCredits
              ? 'Out of WhatsApp messages — top up to send receipts'
              : 'Send receipt via WhatsApp after recording'}
          </span>
        </label>
      )}

      {selectedMember && baseAmount > 0 && (
        <div className="surface border border-gray-600 rounded-lg divide-y divide-gray-700/60 text-sm">
          {packageFee > 0 && (
            <div className="flex justify-between px-3 py-2">
              <span className="text-gray-400">Package fee</span>
              <span className="text-gray-200">{fmt(packageFee)}</span>
            </div>
          )}
          {dues > 0 && (
            <div className="flex justify-between px-3 py-2">
              <span className="text-gray-400">Previous dues</span>
              <span className="text-gray-200">{fmt(dues)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between px-3 py-2">
              <span className="text-gray-400">Discount</span>
              <span className="text-orange-400">– {fmt(discount)}</span>
            </div>
          )}
          <div className="flex justify-between px-3 py-2 font-semibold">
            <span className="text-gray-200">Total Paid</span>
            <span className="text-green-400">{fmt(amountPaid)}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between px-3 py-2 font-semibold">
              <span className="text-yellow-400">Remaining</span>
              <span className="text-yellow-400">{fmt(remaining)}</span>
            </div>
          )}
        </div>
      )}

      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Recording...' : 'Record Payment'}
      </button>
    </form>

    {/* Renewing a membership that still has weeks to run — usually the wrong
        member off the search list, so say plainly what it would do and make the
        desk agree to it. Kept outside the <form>: buttons inside one submit it. */}
    <Modal
      isOpen={!!pendingPayload}
      onClose={() => setPendingPayload(null)}
      title="This member is still active"
      size="sm"
      showClose={false}
    >
      <div className="space-y-4">
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-300">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>
              <span className="font-medium">{selectedMember?.name}</span> is active until{' '}
              <span className="font-medium">{expiryDate}</span> — {daysLeft} day{daysLeft === 1 ? '' : 's'} still to run.
            </p>
          </div>
          <p className="text-sm text-gray-300">
            Recording this payment adds another{' '}
            {selectedPkg?.duration_months > 1
              ? `${selectedPkg.duration_months} months`
              : 'month'}{' '}
            <span className="text-gray-400">on top of</span> that date — it does not
            replace it. If you meant a different member, cancel and search again.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingPayload(null)}
              className="btn-danger justify-center"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => { const p = pendingPayload; setPendingPayload(null); mutation.mutate(p) }}
              className="btn-primary justify-center"
            >
              {mutation.isPending ? 'Recording...' : 'Yes, renew anyway'}
            </button>
        </div>
      </div>
    </Modal>
    </>
  )
}
