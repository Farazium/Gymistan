import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../api/axios'
import toast from 'react-hot-toast'

function calcExpiryISO(isoDate, status, pkgMonths) {
  if (!isoDate || isoDate.length < 10) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return ''
  const months = pkgMonths || 1
  // EXPIRED: set expiry in the past (join month of current year)
  const now = new Date()
  let mm, yy
  if (status === 'EXPIRED') {
    mm = m; yy = now.getFullYear()
  } else {
    mm = m + months; yy = y
    if (mm > 12) { yy += Math.floor((mm - 1) / 12); mm = ((mm - 1) % 12) + 1 }
  }
  return `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function calcExpiryDisplay(isoDate, status, pkgMonths) {
  const iso = calcExpiryISO(isoDate, status, pkgMonths)
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function MemberForm({ member, onSuccess, defaultMemberId }) {
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm({
    defaultValues: member ? { ...member } : { member_id: defaultMemberId || '' },
  })

  const joinDate = watch('join_date')
  const selectedPkgId = watch('package')
  const status = watch('status')

  const { data: packages } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const { data } = await api.get('/packages/')
      return data?.results || data || []
    },
  })

  const selectedPkg = packages?.find((p) => String(p.id) === String(selectedPkgId))
  const pkgMonths = selectedPkg ? Math.round(selectedPkg.duration_days / 30) : null

  const mutation = useMutation({
    mutationFn: (payload) => {
      const pkg = packages?.find((p) => String(p.id) === String(payload.package))
      const months = pkg ? Math.round(pkg.duration_days / 30) : null
      const mid = payload.member_id ? String(payload.member_id).padStart(4, '0') : ''
      const base = { ...payload, member_id: mid || null }
      const body = member
        ? base
        : { ...base, expiry_date: calcExpiryISO(payload.join_date, payload.status, months) }
      return member
        ? api.patch(`/members/${member.id}/`, body)
        : api.post('/members/', body)
    },
    onSuccess: () => {
      toast.success(member ? 'Member updated' : 'Member added')
      onSuccess()
    },
    onError: (err) => {
      const data = err.response?.data
      if (!data) { toast.error('Network error — please try again'); return }

      // Map DRF field errors → react-hook-form field errors
      const fieldMap = { member_id: 'member_id', name: 'name', phone: 'phone', package: 'package', join_date: 'join_date' }
      let handled = false
      Object.entries(fieldMap).forEach(([field, rhfField]) => {
        if (data[field]) {
          setError(rhfField, { message: Array.isArray(data[field]) ? data[field][0] : data[field] })
          handled = true
        }
      })

      // unique_together on (gym, member_id) comes back as non_field_errors
      const nonField = data.non_field_errors || []
      if (nonField.some(e => e.toLowerCase().includes('member_id') || e.toLowerCase().includes('unique'))) {
        setError('member_id', { message: 'This Member ID is already taken' })
        handled = true
      }

      if (!handled) toast.error(data.detail || Object.values(data).flat()[0] || 'Something went wrong')
    },
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name *</label>
          <input className="input" {...register('name', { required: 'Required' })} />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="label">Member ID <span className="text-gray-400 text-xs">(4 digits)</span></label>
          <input
            className="input font-mono tracking-widest"
            maxLength={4}
            placeholder="0001"
            {...register('member_id', {
              pattern: { value: /^\d{1,4}$/, message: 'Must be up to 4 digits' },
            })}
          />
          {errors.member_id && <p className="text-red-500 text-xs mt-1">{errors.member_id.message}</p>}
        </div>

        <div>
          <label className="label">Phone *</label>
          <input className="input" placeholder="03XX-XXXXXXX" {...register('phone', { required: 'Required' })} />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="label">Gender *</label>
          <select className="input" {...register('gender', { required: 'Required' })}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
          {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
        </div>

        <div>
          <label className="label">Father's Name <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="input" {...register('father_name')} />
        </div>

        <div>
          <label className="label">Package *</label>
          <select className="input" {...register('package', { required: 'Package is required' })}>
            <option value="">Select a package</option>
            {packages?.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — PKR {Number(p.price).toLocaleString()}</option>
            ))}
          </select>
          {errors.package && <p className="text-red-500 text-xs mt-1">{errors.package.message}</p>}
        </div>

        <div>
          <label className="label">Joining Date *</label>
          <input
            type="date"
            className="input [color-scheme:dark]"
            {...register('join_date', { required: 'Required' })}
          />
          {errors.join_date && <p className="text-red-500 text-xs mt-1">{errors.join_date.message}</p>}
          {calcExpiryDisplay(joinDate, status, pkgMonths) && (
            <p className="text-xs text-gray-400 mt-1">
              Expires: {calcExpiryDisplay(joinDate, status, pkgMonths)}
            </p>
          )}
        </div>

        {!member && (
          <div>
            <label className="label">Status</label>
            <select className="input" {...register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        )}

        {!member && (
          <div>
            <label className="label">Admission Fee (PKR) <span className="text-gray-400 text-xs">(optional)</span></label>
            <input className="input" type="number" placeholder="0" {...register('admission_fee')} />
          </div>
        )}

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
        <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1 justify-center">
          {mutation.isPending ? 'Saving...' : member ? 'Update Member' : 'Add Member'}
        </button>
      </div>
    </form>
  )
}
