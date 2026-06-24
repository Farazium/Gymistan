import { useState, useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'

function MemberSearch({ members, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)
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
    setSelected(m)
    setQuery(m.name)
    onChange(m.id)
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
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
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
  const { register, handleSubmit, control, formState: { isSubmitting } } = useForm({
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Member *</label>
        <MemberSearch members={members} value={selectedMemberId} onChange={setSelectedMemberId} />
      </div>

      <div>
        <label className="label">Package</label>
        <select className="input" {...register('package')}>
          <option value="">No package</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — PKR {Number(p.price).toLocaleString()}</option>
          ))}
        </select>
      </div>

      {selectedPkg && (
        <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm">
          <p className="text-gray-100 font-medium">Package: {selectedPkg.name}</p>
          <p className="text-gray-400">Base price: PKR {Number(selectedPkg.price).toLocaleString()}</p>
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
      </div>

      <div>
        <label className="label">Payment Status</label>
        <select className="input" {...register('status')}>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
        </select>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input h-16 resize-none" {...register('notes')} />
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Recording...' : 'Record Payment'}
      </button>
    </form>
  )
}
