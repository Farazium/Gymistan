import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ArrowLeft, UserCog, Phone, Calendar, CreditCard, Users, Wallet, Fingerprint, Banknote, Camera } from 'lucide-react'
import api from '../../api/axios'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import AttendanceCalendar from '../../components/ui/AttendanceCalendar'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`
const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-PK') : '—')
const monthLabel = (m) => {
  if (!m) return '—'
  const [y, mm] = m.split('-')
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
}
const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-700/50 last:border-0">
      <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-blue-400" />
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-gray-100 font-medium mt-0.5">{value || <span className="text-gray-500">—</span>}</p>
      </div>
    </div>
  )
}

function PaySalaryForm({ trainer, onSuccess }) {
  const base = Number(trainer.monthly_salary) || 0
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      commission: '',
      month: currentMonth(),
      payment_date: todayISO(),
      note: '',
    },
  })
  const commission = Number(watch('commission')) || 0
  const total = base + commission

  const mutation = useMutation({
    mutationFn: (payload) => api.post(`/trainers/${trainer.id}/pay-salary/`, { ...payload, base_salary: base }),
    onSuccess: () => { toast.success('Salary paid'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to pay salary'),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Month</label>
          <input type="month" className="input [color-scheme:dark]" {...register('month', { required: true })} />
        </div>
        <div>
          <label className="label">Date paid</label>
          <input type="date" className="input [color-scheme:dark]" {...register('payment_date')} />
        </div>
        <div>
          <label className="label">Commission (PKR) <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            type="number" placeholder="0" onWheel={(e) => e.target.blur()} {...register('commission')}
          />
        </div>
        <div className="col-span-2">
          <label className="label">Note <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="input" {...register('note')} />
        </div>
      </div>

      <div className="rounded-lg bg-gray-700/40 border border-gray-700 px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-gray-400">Monthly Salary</span><span className="text-gray-200">{fmt(base)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Commission</span><span className="text-gray-200">{commission > 0 ? fmt(commission) : '—'}</span></div>
        <div className="flex justify-between pt-1.5 border-t border-gray-700"><span className="font-semibold text-gray-100">Total</span><span className="font-bold text-blue-400">{fmt(total)}</span></div>
      </div>

      <button type="submit" disabled={mutation.isPending || total <= 0} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Paying...' : `Pay ${fmt(total)}`}
      </button>
    </form>
  )
}

export default function TrainerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const photoRef = useRef(null)
  const { user } = useAuthStore()
  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)
  const [showPay, setShowPay] = useState(false)

  const { data: t, isLoading } = useQuery({
    queryKey: ['trainer', id],
    queryFn: async () => { const { data } = await api.get(`/trainers/${id}/`); return data },
  })

  const photoMutation = useMutation({
    mutationFn: (file) => {
      const form = new FormData()
      form.append('photo', file)
      return api.patch(`/trainers/${id}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { toast.success('Photo updated'); queryClient.invalidateQueries(['trainer', id]) },
    onError: () => toast.error('Failed to upload photo'),
  })

  if (isLoading) return (
    <div className="flex justify-center py-32">
      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!t) return null

  const ss = t.salary_status || {}
  const photoUrl = t.photo
    ? (t.photo.startsWith('http') ? t.photo : `http://localhost:8000${t.photo}`)
    : null

  const assignedMembersCard = (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-100 flex items-center gap-2 mb-3">
        <Users size={15} className="text-blue-400" /> Assigned Members
        <span className="text-xs text-gray-500">({t.assigned_members?.length || 0})</span>
      </h2>
      {t.assigned_members?.length ? (
        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {t.assigned_members.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/members/${m.id}`)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700/40 transition text-left"
            >
              {m.member_id && <span className="font-mono text-xs text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded shrink-0">{String(m.member_id).padStart(5, '0')}</span>}
              <div className="flex-1 min-w-0">
                <p className="text-gray-100 text-sm font-medium truncate">{m.name}</p>
                <p className="text-xs text-gray-500">{m.phone}{m.package_name ? ` · ${m.package_name}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm py-6 text-center">No members assigned yet.</p>
      )}
    </div>
  )

  const salaryHistoryCard = (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-100 flex items-center gap-2 mb-3">
        <Banknote size={15} className="text-blue-400" /> Salary History
      </h2>
      {t.salary_history?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="py-2 px-3 text-xs text-gray-400 font-medium uppercase tracking-wide">Month</th>
                <th className="py-2 px-3 text-xs text-gray-400 font-medium uppercase tracking-wide text-right">Base</th>
                <th className="py-2 px-3 text-xs text-gray-400 font-medium uppercase tracking-wide text-right">Commission</th>
                <th className="py-2 px-3 text-xs text-gray-400 font-medium uppercase tracking-wide text-right">Total</th>
                <th className="py-2 px-3 text-xs text-gray-400 font-medium uppercase tracking-wide text-right">Paid On</th>
              </tr>
            </thead>
            <tbody>
              {t.salary_history.map((p) => (
                <tr key={p.id} className="border-b border-gray-700/40 last:border-0">
                  <td className="py-2.5 px-3 text-gray-200">{monthLabel(p.month)}</td>
                  <td className="py-2.5 px-3 text-right text-gray-300">{fmt(p.base_salary)}</td>
                  <td className="py-2.5 px-3 text-right text-gray-300">{Number(p.commission) > 0 ? fmt(p.commission) : '—'}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-green-400">{fmt(p.amount)}</td>
                  <td className="py-2.5 px-3 text-right text-gray-400 text-xs">{new Date(p.payment_date).toLocaleDateString('en-PK')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-sm py-6 text-center">No salary payments recorded yet.</p>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/trainers')} className="p-2 text-gray-400 hover:text-gray-100 hover:bg-gray-700 rounded-lg transition">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
                {photoUrl
                  ? <img src={photoUrl} alt={t.name} className="w-full h-full object-cover" />
                  : <UserCog size={26} className="text-blue-400" />
                }
              </div>
              <button
                onClick={() => photoRef.current.click()}
                className="absolute bottom-0 right-0 p-1.5 bg-blue-600 rounded-full hover:bg-blue-700 transition"
              >
                {photoMutation.isPending
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera size={11} className="text-white" />
                }
              </button>
              <input ref={photoRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (!file) return
                  if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); e.target.value = ''; return }
                  if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2 MB'); e.target.value = ''; return }
                  photoMutation.mutate(file)
                }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-blue-400">{t.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${t.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                {t.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <button onClick={() => setShowPay(true)} className="btn-primary">
          <Banknote size={16} /> Pay Salary
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Assigned Members" value={t.members_count} subtitle="Active members" icon={Users} color="primary" />
        <StatCard title="Monthly Salary" value={fmt(t.monthly_salary)} subtitle="Agreed base" icon={Wallet} color="primary" />
        <StatCard
          title={`${monthLabel(ss.month)} Salary`}
          value={ss.status === 'PAID' ? 'Paid' : fmt(ss.pending || 0)}
          subtitle={
            ss.status === 'PAID'
              ? `Next due ${fmtDate(ss.next_due)}`
              : ss.is_overdue
                ? `Overdue since ${fmtDate(ss.due_date)}`
                : `Due ${fmtDate(ss.due_date)}`
          }
          icon={CreditCard}
          color={ss.status === 'PAID' ? 'green' : ss.is_overdue ? 'red' : ss.status === 'PARTIAL' ? 'yellow' : 'red'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Details */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-100 flex items-center gap-2 mb-3">
            <UserCog size={15} className="text-blue-400" /> Details
          </h2>
          <InfoRow icon={Phone} label="Phone" value={t.phone} />
          <InfoRow icon={Fingerprint} label="CNIC" value={t.cnic} />
          <InfoRow icon={Calendar} label="Joining Date" value={t.join_date ? new Date(t.join_date).toLocaleDateString('en-PK') : null} />
          <InfoRow icon={Calendar} label="Next Salary Due" value={fmtDate(ss.next_due)} />
          {t.notes && <InfoRow icon={UserCog} label="Notes" value={t.notes} />}
        </div>

        {/* Right column: attendance calendar when enabled, otherwise assigned members */}
        {hasAttendance ? <AttendanceCalendar type="trainer" personId={trainer.id} /> : assignedMembersCard}
      </div>

      {hasAttendance ? (
        /* Calendar took the top-right slot: put members + salary side by side below */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {assignedMembersCard}
          {salaryHistoryCard}
        </div>
      ) : (
        /* No calendar: members already sit next to Details, so salary spans full width */
        salaryHistoryCard
      )}

      <Modal isOpen={showPay} onClose={() => setShowPay(false)} title={`Pay Salary — ${t.name}`}>
        <PaySalaryForm
          trainer={t}
          onSuccess={() => {
            setShowPay(false)
            queryClient.invalidateQueries(['trainer', id])
            queryClient.invalidateQueries(['trainers'])
          }}
        />
      </Modal>
    </div>
  )
}
