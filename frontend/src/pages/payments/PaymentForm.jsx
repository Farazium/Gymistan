import { useState, useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, AlertCircle, CheckCircle, MessageCircle, Printer } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import useAuthStore from '../../store/authStore'
import { apiErrorMessage } from '../../utils/apiError'
import { isPrintingEnabled, printThermalReceipt } from '../../utils/printReceipt'
import { invalidateFinance } from '../../utils/invalidateFinance'
import { packagePalette } from '../../utils/packageColors'
import { useWaCredits } from '../../utils/waCredits'

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
  const { user } = useAuthStore()
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)
  const outOfCredits = !!useWaCredits(hasWhatsApp)?.exhausted
  const printingOn = isPrintingEnabled()
  const [printReceipt, setPrintReceipt] = useState(false) // opt-in per payment
  const queryClient = useQueryClient()
  const { register, handleSubmit, control, setValue } = useForm({
    defaultValues: { discount: 0, status: 'PAID' }
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
    if (member?.package) {
      setValue('package', String(member.package))
    }
  }

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
    onSuccess: (res, variables) => {
      toast.success('Payment recorded')
      invalidateFinance(queryClient)
      if (sendWhatsApp && hasWhatsApp && !outOfCredits) whatsAppMutation.mutate(res.data.id)
      if (printReceipt && printingOn) {
        printThermalReceipt({
          gymName: user?.gym_name,
          receiptId: res.data.id,
          date: new Date(),
          memberName: selectedMember?.name,
          memberId: selectedMember?.member_id,
          phone: selectedMember?.phone,
          packageName: selectedPkg?.name,
          amount: variables.amount,
          discount: variables.discount,
          amountPaid: variables.amount_paid,
          method: variables.payment_method,
          status: variables.status,
          collectedBy: user?.name,
        })
      }
      onSuccess()
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to record payment')),
  })

  const onSubmit = (data) => {
    if (!selectedMemberId) { toast.error('Please select a member'); return }
    if (!selectedPkg) { toast.error('This member has no package — select a package first'); return }
    const amount = Number(selectedPkg.price) || 0
    const discount = Number(data.discount || 0)
    if (discount < 0) { toast.error('Discount cannot be negative'); return }
    if (discount > amount) { toast.error('Discount cannot exceed the package amount'); return }
    const amountPaid = amount - discount
    mutation.mutate({ ...data, member: selectedMemberId, amount, amount_paid: amountPaid })
  }

  const isExpired = selectedMember?.status === 'EXPIRED'
  const expiryDate = selectedMember?.expiry_date
    ? new Date(selectedMember.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')
    : null

  return (
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
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${isExpired ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {isExpired
            ? <><AlertCircle size={14} /> Expired — was due {expiryDate}</>
            : <><CheckCircle size={14} /> Active — expires {expiryDate}</>
          }
        </div>
      )}

      <input type="hidden" {...register('package')} />

      {selectedPkg && (
        <div className={`surface border rounded-lg p-3 text-sm ${packagePalette(selectedPkg).border}`}>
          <p className="text-gray-400 text-xs mb-0.5">Package</p>
          <p className="text-gray-100 font-medium">{selectedPkg.name}</p>
          <p className={`font-semibold ${packagePalette(selectedPkg).price}`}>PKR {Number(selectedPkg.price).toLocaleString('en-PK')}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Discount (PKR)</label>
          <input
            className="input"
            type="number"
            min="0"
            max={selectedPkg ? Number(selectedPkg.price) : undefined}
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

      {printingOn && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={printReceipt}
            onChange={(e) => setPrintReceipt(e.target.checked)}
            className="w-4 h-4 rounded accent-primary-500"
          />
          <Printer size={14} className="text-primary-400" />
          <span className="text-sm text-gray-300">Print receipt after recording</span>
        </label>
      )}

      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Recording...' : 'Record Payment'}
      </button>
    </form>
  )
}
