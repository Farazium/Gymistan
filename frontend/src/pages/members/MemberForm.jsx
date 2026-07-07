import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'

function calcExpiryISO(isoDate, status, pkgMonths) {
  if (!isoDate || isoDate.length < 10) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return ''
  const months = pkgMonths || 1

  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Roll forward from join date in pkg-month cycles until we pass today
  let yy = y, mm = m
  for (let i = 0; i < 120; i++) {
    mm += months
    while (mm > 12) { yy += 1; mm -= 12 }
    const candidate = new Date(yy, mm - 1, d) // JS handles day overflow (e.g. Jan 31 + 1mo)
    if (candidate > today) {
      if (status === 'EXPIRED') {
        // Step back one cycle — that's the most recent past expiry
        mm -= months
        while (mm < 1) { yy -= 1; mm += 12 }
        const exp = new Date(yy, mm - 1, d)
        return `${exp.getFullYear()}-${String(exp.getMonth()+1).padStart(2,'0')}-${String(exp.getDate()).padStart(2,'0')}`
      }
      return `${candidate.getFullYear()}-${String(candidate.getMonth()+1).padStart(2,'0')}-${String(candidate.getDate()).padStart(2,'0')}`
    }
  }
  return ''
}

function calcExpiryDisplay(isoDate, status, pkgMonths) {
  const iso = calcExpiryISO(isoDate, status, pkgMonths)
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MemberForm({ member, onSuccess, defaultMemberId }) {
  const { user } = useAuthStore()
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)
  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)
  const { register, handleSubmit, watch, setError, setValue, formState: { errors } } = useForm({
    defaultValues: member ? { ...member } : { member_id: defaultMemberId || '', status: 'EXPIRED' },
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

  const { data: trainers = [] } = useQuery({
    queryKey: ['trainers-active'],
    queryFn: async () => {
      const { data } = await api.get('/trainers/', { params: { is_active: 'true' } })
      return data?.results || data || []
    },
  })

  const selectedPkg = packages?.find((p) => String(p.id) === String(selectedPkgId))
  const pkgMonths = selectedPkg ? Math.round(selectedPkg.duration_days / 30) : null
  const trainerAllowed = !!selectedPkg?.has_trainer

  // Trainer can only be set on packages that include a trainer; clear it otherwise
  useEffect(() => {
    if (!trainerAllowed) setValue('trainer', '')
  }, [trainerAllowed, setValue])

  const mutation = useMutation({
    mutationFn: (payload) => {
      const pkg = packages?.find((p) => String(p.id) === String(payload.package))
      const months = pkg ? Math.round(pkg.duration_days / 30) : null
      const mid = payload.member_id ? String(payload.member_id).padStart(5, '0') : ''
      const base = { ...payload, member_id: mid || null, trainer: payload.trainer || null }
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

      // unique_together on (gym, member_id) — can come as non_field_errors or field error
      const nonField = data.non_field_errors || []
      const nonFieldStr = nonField.join(' ').toLowerCase()
      if (nonFieldStr.includes('member') || nonFieldStr.includes('unique') || nonFieldStr.includes('id')) {
        setError('member_id', { message: 'This Member ID is already occupied' })
        handled = true
      }

      if (!handled) {
        const msg = data.detail || nonField[0] || Object.values(data).flat()[0] || 'Something went wrong'
        toast.error(String(msg))
      }
    },
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name *</label>
          <input
            className="input"
            {...register('name', {
              required: 'Full Name is required',
              pattern: { value: /^[^\d]+$/, message: 'Name cannot contain numbers' },
            })}
            onKeyDown={(e) => { if (/\d/.test(e.key)) e.preventDefault() }}
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="label">Member ID *</label>
          {(() => {
            const midReg = register('member_id', {
              required: 'Member ID is required',
              pattern: { value: /^\d{1,5}$/, message: 'Must be up to 5 digits' },
            })
            return (
              <input
                className={`input font-mono tracking-widest ${member ? 'opacity-60 cursor-not-allowed' : ''}`}
                maxLength={5}
                placeholder="00001"
                readOnly={!!member}
                {...midReg}
                onBlur={(e) => {
                  midReg.onBlur(e)
                  if (member) return
                  // Pad to 5 digits so the accountant never has to count zeroes: 45 -> 00045
                  const v = e.target.value.trim()
                  if (v) setValue('member_id', v.padStart(5, '0'), { shouldValidate: true })
                }}
                onKeyDown={(e) => {
                  if (member) { e.preventDefault(); return }
                  if (!/[\d]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault()
                }}
              />
            )
          })()}
          {errors.member_id && <p className="text-red-500 text-xs mt-1">{errors.member_id.message}</p>}
        </div>

        <div>
          <label className="label">Phone *</label>
          <input
            className="input"
            placeholder="03XX-XXXXXXX"
            {...register('phone', {
              required: 'Phone is required',
              pattern: { value: /^[\d\s\-+()]+$/, message: 'Phone can only contain numbers' },
            })}
            onKeyDown={(e) => { if (!/[\d\s\-+()]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="label">Gender *</label>
          <select className="input" {...register('gender', { required: 'Gender is required' })}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
          {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
        </div>

        <div>
          <label className="label">Father's Name <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            className="input"
            {...register('father_name', {
              pattern: { value: /^[^\d]*$/, message: 'Name cannot contain numbers' },
            })}
            onKeyDown={(e) => { if (/\d/.test(e.key)) e.preventDefault() }}
          />
          {errors.father_name && <p className="text-red-500 text-xs mt-1">{errors.father_name.message}</p>}
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
          <label className="label">
            Trainer <span className="text-gray-400 text-xs">{trainerAllowed ? '(optional)' : '(select a trainer package)'}</span>
          </label>
          <select
            className={`input ${!trainerAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!trainerAllowed}
            {...register('trainer')}
          >
            <option value="">{trainerAllowed ? 'Select trainer' : 'No trainer'}</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Joining Date *</label>
          <input
            type="date"
            className="input [color-scheme:dark]"
            max={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()}
            {...register('join_date', {
              required: 'Joining Date is required',
              validate: v => !v || v <= (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })() || 'Future date not allowed',
            })}
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
            <input className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" placeholder="0" onWheel={e => e.target.blur()} {...register('admission_fee')} />
          </div>
        )}

        {hasAttendance && (
          <div>
            <label className="label">Device ID <span className="text-gray-400 text-xs">(biometric)</span></label>
            <input className="input" placeholder="ZKTeco user id" {...register('device_user_id')} />
          </div>
        )}

        {!member && hasWhatsApp && (
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-green-500" {...register('send_welcome')} />
              <span className="text-sm text-gray-300">Send welcome message on WhatsApp</span>
            </label>
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
