import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../api/axios'
import toast from 'react-hot-toast'

function calcExpiry(joinDateStr) {
  if (!joinDateStr) return ''
  const joinDay = new Date(joinDateStr).getDate()
  const now = new Date()
  const expiry = new Date(now.getFullYear(), now.getMonth() + 1, joinDay)
  return expiry.toISOString().split('T')[0]
}

function formatPK(dateStr) {
  if (!dateStr) return ''
  const [y, m, day] = dateStr.split('-')
  return `${day}/${m}/${y}`
}

export default function MemberForm({ member, onSuccess }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: member || {},
  })

  const joinDate = watch('join_date')

  const { data: packages } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const { data } = await api.get('/packages/')
      return data?.results || data || []
    },
  })

  const mutation = useMutation({
    mutationFn: (payload) => {
      const body = { ...payload, expiry_date: calcExpiry(payload.join_date) }
      return member
        ? api.patch(`/members/${member.id}/`, body)
        : api.post('/members/', body)
    },
    onSuccess: () => {
      toast.success(member ? 'Member updated' : 'Member added')
      onSuccess()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Something went wrong'),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Full Name *</label>
          <input className="input" {...register('name', { required: 'Required' })} />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="label">Phone *</label>
          <input className="input" placeholder="03XX-XXXXXXX" {...register('phone', { required: 'Required' })} />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="label">Father's Name <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="input" {...register('father_name')} />
        </div>

        <div>
          <label className="label">Package</label>
          <select className="input" {...register('package')}>
            <option value="">No Package</option>
            {packages?.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — PKR {Number(p.price).toLocaleString()}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Joining Date *</label>
          <input className="input" type="date" {...register('join_date', { required: 'Required' })} />
          {errors.join_date && <p className="text-red-500 text-xs mt-1">{errors.join_date.message}</p>}
          {joinDate && (
            <p className="text-xs text-gray-400 mt-1">Expires: {formatPK(calcExpiry(joinDate))}</p>
          )}
        </div>

        <div>
          <label className="label">Status</label>
          <select className="input" {...register('status')}>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="label">Address <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="input" {...register('address')} />
        </div>

        <div className="col-span-2">
          <label className="label">Notes <span className="text-gray-400 text-xs">(optional)</span></label>
          <textarea className="input h-20 resize-none" {...register('notes')} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 justify-center">
          {isSubmitting ? 'Saving...' : member ? 'Update Member' : 'Add Member'}
        </button>
      </div>
    </form>
  )
}
