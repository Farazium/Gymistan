import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../api/axios'
import toast from 'react-hot-toast'

function calcExpiry(isoDate, status, pkgMonths) {
  if (!isoDate || isoDate.length < 10) return null
  const [jy, jm, jd] = isoDate.split('-').map(Number)
  if (!jd || !jm || !jy) return null

  const now = new Date()
  const currentDD = now.getDate()
  const currentMM = now.getMonth() + 1
  const currentYY = now.getFullYear()
  const pkg = pkgMonths || 1

  let mm, yy
  const dd = jd

  if (jd < currentDD) {
    // joining day already passed this month
    mm = status === 'EXPIRED' ? currentMM : currentMM + pkg
    yy = currentYY
  } else {
    // joining day hasn't come yet this month
    // EXPIRED: rewind to joining month of current year (currentMM - difference = jm)
    mm = status === 'EXPIRED' ? jm : jm + pkg
    yy = currentYY
  }

  // normalize month overflow / underflow
  if (mm > 12) {
    yy += Math.floor((mm - 1) / 12)
    mm = ((mm - 1) % 12) + 1
  } else if (mm < 1) {
    const years = Math.ceil((1 - mm) / 12)
    yy -= years
    mm += years * 12
  }

  return { dd, mm, yy }
}

function calcExpiryDisplay(isoDate, status, pkgMonths) {
  const r = calcExpiry(isoDate, status, pkgMonths)
  if (!r) return ''
  return `${String(r.mm).padStart(2, '0')}/${String(r.dd).padStart(2, '0')}/${r.yy}`
}

function calcExpiryISO(isoDate, status, pkgMonths) {
  const r = calcExpiry(isoDate, status, pkgMonths)
  if (!r) return ''
  return `${r.yy}-${String(r.mm).padStart(2, '0')}-${String(r.dd).padStart(2, '0')}`
}

export default function MemberForm({ member, onSuccess }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: member ? { ...member } : {},
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
      const body = {
        ...payload,
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
