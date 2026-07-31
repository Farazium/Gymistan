import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { Fingerprint } from 'lucide-react'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'
import EnrollModal from '../../components/EnrollModal'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TrainerForm({ trainer, onSuccess }) {
  const { user } = useAuthStore()
  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)
  const [enrollTarget, setEnrollTarget] = useState(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    defaultValues: trainer
      ? { ...trainer }
      : { name: '', phone: '', cnic: '', join_date: todayISO(), monthly_salary: '', notes: '' },
  })

  const mutation = useMutation({
    mutationFn: (payload) => {
      const body = {
        ...payload,
        monthly_salary: payload.monthly_salary || 0,
        join_date: payload.join_date || null,
      }
      return trainer
        ? api.patch(`/trainers/${trainer.id}/`, body)
        : api.post('/trainers/', body)
    },
    onSuccess: (res, variables) => {
      toast.success(trainer ? 'Trainer updated' : 'Trainer added')
      if (!trainer && hasAttendance && variables?.add_to_device && res?.data?.id) {
        setEnrollTarget(res.data)
      } else {
        onSuccess()
      }
    },
    onError: (err) => {
      const data = err.response?.data
      const formFields = ['name', 'phone', 'cnic', 'join_date', 'monthly_salary', 'device_user_id', 'notes']
      let handled = false
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([field, msg]) => {
          if (formFields.includes(field)) {
            setError(field, { message: Array.isArray(msg) ? msg[0] : String(msg) })
            handled = true
          }
        })
      }
      // Only show a toast when the error wasn't tied to a specific field (else it double-messages)
      if (!handled) toast.error(apiErrorMessage(err, 'Failed to save trainer'))
    },
  })

  return (
    <>
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Full Name *</label>
          <input
            className="input"
            {...register('name', {
              required: 'Name is required',
              pattern: { value: /^[A-Za-z\s]+$/, message: 'Name can only contain letters' },
            })}
            onKeyDown={(e) => { if (!/[A-Za-z\s]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="label">Phone *</label>
          <input
            className="input"
            placeholder="03XX-XXXXXXX"
            {...register('phone', {
              required: 'Phone is required',
              pattern: { value: /^\d{10,15}$/, message: 'Enter a valid phone (10–15 digits)' },
            })}
            onKeyDown={(e) => { if (!/\d/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="label">CNIC <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            className="input"
            placeholder="XXXXX-XXXXXXX-X"
            {...register('cnic', {
              pattern: { value: /^\d{5}-?\d{7}-?\d{1}$/, message: 'CNIC must be 13 digits (e.g. 35201-1234567-1)' },
            })}
          />
          {errors.cnic && <p className="text-red-500 text-xs mt-1">{errors.cnic.message}</p>}
        </div>

        <div>
          <label className="label">Joining Date</label>
          <input type="date" max={todayISO()} className="input [color-scheme:dark]" {...register('join_date', { required: true })} />
        </div>

        <div>
          <label className="label">Monthly Salary (PKR)</label>
          <input
            className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            type="number"
            min="0"
            placeholder="0"
            onWheel={(e) => e.target.blur()}
            onKeyDown={(e) => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
            {...register('monthly_salary', { min: { value: 0, message: 'Salary cannot be negative' } })}
          />
          {errors.monthly_salary && <p className="text-red-500 text-xs mt-1">{errors.monthly_salary.message}</p>}
        </div>

        {hasAttendance && (
          <div>
            <label className="label">Device ID <span className="text-gray-400 text-xs">(biometric)</span></label>
            <input className="input" placeholder="Auto if left blank" {...register('device_user_id')} />
          </div>
        )}

        {!trainer && hasAttendance && (
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 select-none cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-green-500" {...register('add_to_device')} />
              <span className="text-sm text-gray-300 flex items-center gap-1.5">
                <Fingerprint size={14} className="text-primary-400" /> Add to device &amp; enroll fingerprint
              </span>
            </label>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label">Notes <span className="text-gray-400 text-xs">(optional)</span></label>
          <textarea className="input h-20 resize-none" {...register('notes')} />
        </div>
      </div>

      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Saving...' : trainer ? 'Update Trainer' : 'Add Trainer'}
      </button>
    </form>
    {enrollTarget && (
      <EnrollModal
        member={enrollTarget}
        kind="trainer"
        isOpen={!!enrollTarget}
        autoStart
        onClose={() => { setEnrollTarget(null); onSuccess() }}
      />
    )}
    </>
  )
}
