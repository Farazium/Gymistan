import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Fingerprint } from 'lucide-react'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import { useWaCredits } from '../../utils/waCredits'
import EnrollModal from '../../components/EnrollModal'
import { calcExpiryISO, calcExpiryDisplay } from '../../utils/expiry'
import { normalizePkMobile, phoneRule } from '../../utils/phone'
import CollectFeeSection, { useJoiningPayment } from '../../components/members/CollectFee'
import { isQueued, QUEUED_MESSAGE } from '../../offline'

export default function MemberForm({ member, onSuccess, defaultMemberId }) {
  const { user } = useAuthStore()
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)
  const outOfCredits = !!useWaCredits(hasWhatsApp)?.exhausted
  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)
  const todayISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const { register, handleSubmit, watch, setError, setValue, formState: { errors } } = useForm({
    defaultValues: member
      ? { ...member }
      : {
          member_id: defaultMemberId || '', status: 'EXPIRED', join_date: todayISO,
          payment_type: 'FULL', payment_method: 'CASH', discount: 0,
        },
  })

  const [enrollTarget, setEnrollTarget] = useState(null)
  const joinDate = watch('join_date')
  const selectedPkgId = watch('package')
  const status = watch('status')
  // Taking the joining money here is what collapses the old two-step dance
  // (add as expired -> go to Payments -> record the package fee) into one entry,
  // and one payment record instead of two.
  const collectFee = watch('collect_fee')

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
  const pkgMonths = selectedPkg ? selectedPkg.duration_months : null
  const trainerAllowed = !!selectedPkg?.has_trainer

  // Trainer can only be set on packages that include a trainer; clear it otherwise
  useEffect(() => {
    if (!trainerAllowed) setValue('trainer', '')
  }, [trainerAllowed, setValue])

  // Money collected up front means the membership starts running today — the
  // status is no longer the accountant's to choose.
  useEffect(() => {
    if (collectFee) setValue('status', 'ACTIVE')
  }, [collectFee, setValue])

  const calc = useJoiningPayment({ watch, pkgPrice: selectedPkg?.price || 0 })

  const mutation = useMutation({
    mutationFn: (payload) => {
      const pkg = packages?.find((p) => String(p.id) === String(payload.package))
      const months = pkg ? pkg.duration_months : null
      const mid = payload.member_id ? String(payload.member_id).padStart(5, '0') : ''
      const base = {
        ...payload,
        member_id: mid || null,
        trainer: payload.trainer || null,
        phone: normalizePkMobile(payload.phone) || payload.phone,
      }
      // With the first payment collected the member is added active, their expiry
      // already a package-length away — the payment doesn't move it a second time.
      const memberStatus = payload.collect_fee ? 'ACTIVE' : payload.status
      const body = member
        ? base
        : {
            ...base,
            status: memberStatus,
            expiry_date: calcExpiryISO(payload.join_date, memberStatus, months),
            ...(payload.collect_fee ? { discount: calc.discount, amount_paid: calc.amountPaid } : {}),
          }
      // Display-only, and on the config rather than the body so the server never
      // sees it — same trick as PaymentForm.
      const config = { __queueMeta: { package_name: pkg?.name } }
      return member
        ? api.patch(`/members/${member.id}/`, body, config)
        : api.post('/members/', body, config)
    },
    onSuccess: (res, variables) => {
      // A queued write has no id, so the fingerprint-enrolment branch below
      // can't run either — it needs the member the server made.
      if (isQueued(res)) {
        toast.success(QUEUED_MESSAGE)
        onSuccess()
        return
      }
      toast.success(member ? 'Member updated' : 'Member added')
      // Just added, box ticked, plan has attendance: they've been pushed to the
      // device — offer to enroll the fingerprint right away.
      if (!member && hasAttendance && variables?.add_to_device && res?.data?.id) {
        setEnrollTarget(res.data)
      } else {
        onSuccess()
      }
    },
    onError: (err) => {
      const data = err.response?.data
      if (!data) { toast.error('Network error — please try again'); return }

      // Map DRF field errors → react-hook-form field errors
      const fieldMap = { member_id: 'member_id', name: 'name', phone: 'phone', package: 'package', join_date: 'join_date', trainer: 'trainer', device_user_id: 'device_user_id', gender: 'gender' }
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

  const expiryHint = calcExpiryDisplay(joinDate, status, pkgMonths)

  const submit = (d) => {
    if (!member && d.collect_fee) {
      if (calc.total <= 0) { toast.error('Nothing to collect — pick a package or enter an admission fee'); return }
      if (calc.payType === 'PARTIAL') {
        if (!calc.enteredPaid || calc.enteredPaid <= 0) { toast.error('Enter the amount the member paid'); return }
        if (calc.enteredPaid > calc.payable) { toast.error('Amount paid cannot exceed the total payable'); return }
      }
    }
    mutation.mutate(d)
  }

  return (
    <>
    <form onSubmit={handleSubmit(submit)} className="space-y-6">

      <Section title="Member Details">
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
          <label className="label">Father&apos;s Name <span className="text-gray-400 text-xs">(optional)</span></label>
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
              validate: phoneRule,
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
          <label className="label">Address <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="input" {...register('address')} />
        </div>
      </Section>

      <Section title="Membership">
        <div>
          <label className="label">Package *</label>
          <select className="input" {...register('package', { required: 'Package is required' })}>
            <option value="">Select a package</option>
            {packages?.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — PKR {Number(p.price).toLocaleString('en-PK')}</option>
            ))}
          </select>
          {errors.package && <p className="text-red-500 text-xs mt-1">{errors.package.message}</p>}
        </div>

        <div>
          <label className="label">
            Trainer {trainerAllowed ? '*' : <span className="text-gray-400 text-xs">(trainer package only)</span>}
          </label>
          <select
            className={`input ${!trainerAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!trainerAllowed}
            {...register('trainer', {
              validate: (v) => !trainerAllowed || !!v || 'This package includes a trainer — please select one',
            })}
          >
            <option value="">{trainerAllowed ? 'Select trainer' : 'No trainer'}</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.trainer && <p className="text-red-500 text-xs mt-1">{errors.trainer.message}</p>}
        </div>

        <div>
          <label className="label">Joining Date *</label>
          <input
            type="date"
            className="input [color-scheme:dark]"
            max={todayISO}
            {...register('join_date', {
              required: 'Joining Date is required',
              validate: v => !v || v <= todayISO || 'Future date not allowed',
            })}
          />
          {errors.join_date && <p className="text-red-500 text-xs mt-1">{errors.join_date.message}</p>}
          {expiryHint && <p className="text-xs text-gray-400 mt-1">Expires: {expiryHint}</p>}
        </div>

        {!member && (
          <div>
            <label className="label">
              Status
              {collectFee && <span className="text-gray-400 text-xs"> (paid — active)</span>}
            </label>
            <select
              className={`input ${collectFee ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={collectFee}
              {...register('status')}
            >
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        )}
      </Section>

      {!member && (
        <Section title="First Payment" columns={1}>
          <div className="sm:max-w-xs">
            <label className="label">Admission Fee (PKR) <span className="text-gray-400 text-xs">(optional)</span></label>
            <input
              className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number" min="0" placeholder="0"
              onWheel={e => e.target.blur()}
              onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
              {...register('admission_fee', { min: { value: 0, message: 'Fee cannot be negative' } })}
            />
            {errors.admission_fee && <p className="text-red-500 text-xs mt-1">{errors.admission_fee.message}</p>}
          </div>
          <CollectFeeSection register={register} calc={calc} pkgName={selectedPkg?.name} />
        </Section>
      )}

      <Section title="Extras">
        {hasAttendance && (
          <div>
            <label className="label">Device ID <span className="text-gray-400 text-xs">(biometric)</span></label>
            <input className="input" placeholder="Auto if left blank" {...register('device_user_id')} />
          </div>
        )}

        {!member && (hasAttendance || hasWhatsApp) && (
          <div className="sm:col-span-2 space-y-2 self-end pb-1">
            {hasAttendance && (
              <label className="flex items-center gap-2 select-none cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-green-500" {...register('add_to_device')} />
                <span className="text-sm text-gray-300 flex items-center gap-1.5">
                  <Fingerprint size={14} className="text-primary-400" /> Add to device &amp; enroll fingerprint
                </span>
              </label>
            )}

            {hasWhatsApp && (
              <label className={`flex items-center gap-2 select-none ${outOfCredits ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox" disabled={outOfCredits}
                  className="w-4 h-4 accent-green-500 disabled:opacity-40"
                  {...register('send_welcome')}
                />
                <span className={`text-sm ${outOfCredits ? 'text-gray-600' : 'text-gray-300'}`}>
                  {outOfCredits
                    ? 'Out of WhatsApp messages — top up to send a welcome'
                    : 'Send welcome message on WhatsApp'}
                </span>
              </label>
            )}
          </div>
        )}

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label">Notes <span className="text-gray-400 text-xs">(optional)</span></label>
          <textarea className="input h-16 resize-none" {...register('notes')} />
        </div>
      </Section>

      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Saving...' : member ? 'Update Member' : 'Add Member'}
      </button>
    </form>
    {enrollTarget && (
      <EnrollModal
        member={enrollTarget}
        isOpen={!!enrollTarget}
        autoStart
        onClose={() => { setEnrollTarget(null); onSuccess() }}
      />
    )}
    </>
  )
}

/**
 * One labelled group of fields. The add-member form asks for a lot at once, so it
 * reads as blocks — who they are, what they signed up for, what they paid — rather
 * than one long ladder of inputs.
 */
function Section({ title, children, columns = 3 }) {
  const grid = columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary-400/80 border-b border-gray-700/60 pb-1.5">
        {title}
      </h3>
      <div className={`grid ${grid} gap-4`}>{children}</div>
    </section>
  )
}
