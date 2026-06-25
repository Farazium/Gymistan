import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../api/axios'
import toast from 'react-hot-toast'

// dd/mm/yyyy → yyyy-mm-dd for API
function toISO(ddmmyyyy) {
  if (!ddmmyyyy || ddmmyyyy.length < 10) return ''
  const [d, m, y] = ddmmyyyy.split('/')
  if (!d || !m || !y || y.length < 4) return ''
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

// yyyy-mm-dd → dd/mm/yyyy for display (when editing existing member)
function toDDMMYYYY(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// EXPIRED: joining day + current month/year (member needs renewal now)
// ACTIVE:  joining day + current month + package months (member is paid up)
function calcExpiryDisplay(ddmmyyyy, status, months) {
  if (!ddmmyyyy || ddmmyyyy.length < 10) return ''
  const [d, m, y] = ddmmyyyy.split('/')
  if (!d || !m || !y || y.length < 4) return ''
  const joinDay = parseInt(d, 10)
  const now = new Date()
  const offset = status === 'EXPIRED' ? 0 : (months || 1)
  const totalMonths = now.getMonth() + offset
  const expiry = new Date(now.getFullYear() + Math.floor(totalMonths / 12), totalMonths % 12, joinDay)
  const ed = String(expiry.getDate()).padStart(2, '0')
  const em = String(expiry.getMonth() + 1).padStart(2, '0')
  return `${ed}/${em}/${expiry.getFullYear()}`
}

function calcExpiryISO(ddmmyyyy, status, months) {
  const display = calcExpiryDisplay(ddmmyyyy, status, months)
  return toISO(display)
}

export default function MemberForm({ member, onSuccess }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: member
      ? { ...member, join_date: toDDMMYYYY(member.join_date) }
      : {},
  })

  const joinDate = watch('join_date')
  const selectedPkgId = watch('package')

  const { data: packages } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const { data } = await api.get('/packages/')
      return data?.results || data || []
    },
  })

  const status = watch('status')
  const selectedPkg = packages?.find((p) => String(p.id) === String(selectedPkgId))
  const pkgMonths = selectedPkg ? Math.round(selectedPkg.duration_days / 30) : null

  const mutation = useMutation({
    mutationFn: (payload) => {
      const pkg = packages?.find((p) => String(p.id) === String(payload.package))
      const months = pkg ? Math.round(pkg.duration_days / 30) : null
      const body = {
        ...payload,
        join_date: toISO(payload.join_date),
        expiry_date: calcExpiryISO(payload.join_date, payload.status, months),
      }
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
            className="input"
            placeholder="DD/MM/YYYY"
            maxLength={10}
            {...register('join_date', {
              required: 'Required',
              pattern: { value: /^\d{2}\/\d{2}\/\d{4}$/, message: 'Use DD/MM/YYYY format' },
            })}
            onChange={(e) => {
              let v = e.target.value.replace(/[^\d]/g, '')
              if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2)
              if (v.length >= 6) v = v.slice(0,5) + '/' + v.slice(5,9)
              e.target.value = v
            }}
          />
          {errors.join_date && <p className="text-red-500 text-xs mt-1">{errors.join_date.message}</p>}
          {calcExpiryDisplay(joinDate, status, pkgMonths) && (
            <p className="text-xs text-gray-400 mt-1">Expires: {calcExpiryDisplay(joinDate, status, pkgMonths)}</p>
          )}
        </div>

        <div>
          <label className="label">Status</label>
          <select className="input" {...register('status')}>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>

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
