import { useState, useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, AlertCircle, CheckCircle } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'

function MemberSearch({ members, value, onChange, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase()) ||
    m.phone.includes(query)
  )

  const select = (m) => {
    setQuery(m.name)
    onChange(m.id)
    onSelect(m)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-8"
          placeholder="Search by name or phone..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) { onChange(''); onSelect(null) } }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.length ? filtered.map(m => (
            <div
              key={m.id}
              onClick={() => select(m)}
              className="px-3 py-2 text-sm text-gray-100 hover:bg-gray-600 cursor-pointer"
            >
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

  const mutation = useMutation({
    mutationFn: (payload) => api.post('/payments/', payload),
    onSuccess: () => { toast.success('Payment recorded'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const onSubmit = (data) => {
    if (!selectedMemberId) { toast.error('Please select a member'); return }
    const amount = selectedPkg ? selectedPkg.price : data.amount
    const amountPaid = Number(amount) - Number(data.discount || 0)
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
          value={selectedMemberId}
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
        <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm">
          <p className="text-gray-400 text-xs mb-0.5">Package</p>
          <p className="text-gray-100 font-medium">{selectedPkg.name}</p>
          <p className="text-gray-400">PKR {Number(selectedPkg.price).toLocaleString()}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {!selectedPkg && (
          <div>
            <label className="label">Amount (PKR) *</label>
            <input className="input" type="number" {...register('amount', { required: !selectedPkg })} />
          </div>
        )}
        <div>
          <label className="label">Discount (PKR)</label>
          <input className="input" type="number" defaultValue={0} {...register('discount')} />
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

      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Recording...' : 'Record Payment'}
      </button>
    </form>
  )
}
