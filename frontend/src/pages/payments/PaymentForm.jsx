import { useForm, useWatch } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../api/axios'
import toast from 'react-hot-toast'

export default function PaymentForm({ onSuccess }) {
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
    const amount = selectedPkg ? selectedPkg.price : data.amount
    const amountPaid = Number(amount) - Number(data.discount || 0)
    mutation.mutate({ ...data, amount, amount_paid: amountPaid })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Member *</label>
        <select className="input" {...register('member', { required: true })}>
          <option value="">Select member...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name} — {m.phone}</option>
          ))}
        </select>
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
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm">
          <p className="text-primary-700 font-medium">Package: {selectedPkg.name}</p>
          <p className="text-primary-600">Base price: PKR {Number(selectedPkg.price).toLocaleString()}</p>
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
