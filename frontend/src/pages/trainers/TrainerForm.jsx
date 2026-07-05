import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import api from '../../api/axios'
import toast from 'react-hot-toast'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TrainerForm({ trainer, onSuccess }) {
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
    onSuccess: () => {
      toast.success(trainer ? 'Trainer updated' : 'Trainer added')
      onSuccess()
    },
    onError: (err) => {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([field, msg]) => {
          setError(field, { message: Array.isArray(msg) ? msg[0] : String(msg) })
        })
      }
      toast.error('Failed to save trainer')
    },
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
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
              pattern: { value: /^\d+$/, message: 'Digits only' },
            })}
            onKeyDown={(e) => { if (!/\d/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault() }}
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="label">CNIC <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="input" placeholder="XXXXX-XXXXXXX-X" {...register('cnic')} />
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
            placeholder="0"
            onWheel={(e) => e.target.blur()}
            {...register('monthly_salary')}
          />
        </div>

        <div className="col-span-2">
          <label className="label">Notes <span className="text-gray-400 text-xs">(optional)</span></label>
          <textarea className="input h-20 resize-none" {...register('notes')} />
        </div>
      </div>

      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Saving...' : trainer ? 'Update Trainer' : 'Add Trainer'}
      </button>
    </form>
  )
}
