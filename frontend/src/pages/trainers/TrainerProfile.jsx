import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ArrowLeft, UserCog, Phone, Calendar, CreditCard, Users, Wallet, Fingerprint, Banknote, MoreVertical, Eye, ImageUp, Trash2 } from 'lucide-react'
import api, { API_ORIGIN } from '../../api/axios'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import EnrollModal from '../../components/EnrollModal'
import AttendanceCalendar from '../../components/ui/AttendanceCalendar'
import PhotoViewer from '../../components/ui/PhotoViewer'
import PhotoCropper from '../../components/ui/PhotoCropper'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import { isNotFound, retryUnlessNotFound } from '../../utils/queryRetry'
import { invalidateFinance } from '../../utils/invalidateFinance'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`
const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-PK') : '—')
const monthLabel = (m) => {
  if (!m) return '—'
  const [y, mm] = m.split('-')
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
}
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-700/50 last:border-0">
      <div className="w-8 h-8 bg-primary-500/15 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-primary-400" />
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
      payment_date: todayISO(),
      note: '',
    },
  })
  const commission = Number(watch('commission')) || 0
  const total = base + commission

  // The salary month is simply the month of the payment date — no separate field.
  // Its due date is the trainer's join day (clamped to the month's length);
  // paying before that day isn't allowed.
  const paymentDate = watch('payment_date')
  const selectedMonth = paymentDate ? paymentDate.slice(0, 7) : ''
  const dueDate = (() => {
    if (!selectedMonth) return null
    const [y, m] = selectedMonth.split('-').map(Number)
    if (!y || !m) return null
    const joinDay = trainer.join_date ? Number(trainer.join_date.slice(8, 10)) || 1 : 1
    const lastDay = new Date(y, m, 0).getDate()
    return new Date(y, m - 1, Math.min(joinDay, lastDay))
  })()
  const notDueYet = (() => {
    if (!dueDate) return false
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return today < dueDate
  })()

  const mutation = useMutation({
    mutationFn: (payload) => api.post(`/trainers/${trainer.id}/pay-salary/`, { ...payload, base_salary: base }),
    onSuccess: () => { toast.success('Salary paid'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to pay salary'),
  })

  const onSubmit = (d) => {
    if (mutation.isPending) return // guard against double/triple submit
    if (notDueYet) {
      toast.error(`Salary for this month isn't due yet — it can be paid on or after ${dueDate.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}.`)
      return
    }
    mutation.mutate(d)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Date paid</label>
          <input type="date" className="input [color-scheme:dark]" {...register('payment_date', { required: true })} />
        </div>
        <div>
          <label className="label">Commission (PKR) <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            type="number" min="0" placeholder="0" onWheel={(e) => e.target.blur()} onKeyDown={(e) => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }} {...register('commission', { min: { value: 0, message: 'Commission cannot be negative' } })}
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
        <div className="flex justify-between pt-1.5 border-t border-gray-700"><span className="font-semibold text-gray-100">Total</span><span className="font-bold text-primary-400">{fmt(total)}</span></div>
      </div>

      {notDueYet && (
        <p className="text-yellow-400 text-xs text-center">
          Salary for this month isn’t due yet — it can be paid on or after {dueDate.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}.
        </p>
      )}

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
  const [showEnroll, setShowEnroll] = useState(false)

  const { data: t, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['trainer', id],
    queryFn: async () => { const { data } = await api.get(`/trainers/${id}/`); return data },
    retry: retryUnlessNotFound,
  })

  const photoMutation = useMutation({
    mutationFn: (file) => {
      const form = new FormData()
      form.append('photo', file)
      return api.patch(`/trainers/${id}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { toast.success('Photo updated'); queryClient.invalidateQueries({ queryKey: ['trainer', id] }) },
    onError: () => toast.error('Failed to upload photo'),
  })

  const removePhotoMutation = useMutation({
    mutationFn: () => api.patch(`/trainers/${id}/`, { photo: null }),
    onSuccess: () => { toast.success('Photo removed'); queryClient.invalidateQueries({ queryKey: ['trainer', id] }) },
    onError: () => toast.error('Failed to remove photo'),
  })

  const photoMenuRef = useRef(null)
  const [showPhotoMenu, setShowPhotoMenu] = useState(false)
  const [viewPhoto, setViewPhoto] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  useEffect(() => {
    if (!showPhotoMenu) return
    const onClick = (e) => { if (photoMenuRef.current && !photoMenuRef.current.contains(e.target)) setShowPhotoMenu(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showPhotoMenu])

  if (isLoading) return (
    <div className="flex justify-center py-32">
      <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
    </div>
  )
  // Transient failure (network / server restart / 5xx) — the trainer isn't gone,
  // so offer a retry instead of falsely claiming "not found".
  if (isError && !isNotFound(error)) return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-gray-300 font-medium">Couldn’t load this trainer</p>
      <p className="text-gray-500 text-sm mt-1">A connection or server hiccup — the record is safe.</p>
      <button onClick={() => refetch()} disabled={isFetching} className="btn-primary mt-4">
        {isFetching ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
  if (!t) return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-gray-300 font-medium">Trainer not found</p>
      <p className="text-gray-500 text-sm mt-1">It may have been removed, or the link is wrong.</p>
      <button onClick={() => navigate('/trainers')} className="btn-primary mt-4">
        <ArrowLeft size={16} /> Back to Trainers
      </button>
    </div>
  )

  const ss = t.salary_status || {}
  const photoUrl = t.photo
    ? (t.photo.startsWith('http') ? t.photo : `${API_ORIGIN}${t.photo}`)
    : null

  const assignedMembersCard = (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-100 flex items-center gap-2 mb-3">
        <Users size={15} className="text-primary-400" /> Assigned Members
        <span className="text-xs text-gray-500">({t.assigned_members?.length || 0})</span>
      </h2>
      {t.assigned_members?.length ? (
        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {t.assigned_members.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/members/${m.id}`)}
              className="no-fx w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700/40 transition text-left"
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
        <Banknote size={15} className="text-primary-400" /> Salary History
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
          <button onClick={() => navigate('/trainers')} className="p-2 text-gray-400 hover:text-gray-100 rounded-lg transition [--btn-fill:55_65_81] [--btn-edge:31_41_55]">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
                {photoUrl
                  ? <img src={photoUrl} alt={t.name} className="w-full h-full object-cover" />
                  : <UserCog size={26} className="text-primary-400" />
                }
              </div>
              <div className="absolute bottom-0 right-0" ref={photoMenuRef}>
                <button
                  onClick={() => setShowPhotoMenu((s) => !s)}
                  className="p-1.5 rounded-full bg-primary-600 text-white shadow-md transition"
                >
                  {(photoMutation.isPending || removePhotoMutation.isPending)
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <MoreVertical size={11} />
                  }
                </button>
                {showPhotoMenu && (
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 w-36 surface border border-primary-500/30 rounded-lg shadow-xl z-20 overflow-hidden">
                    {photoUrl && (
                      <button
                        onClick={() => { setShowPhotoMenu(false); setViewPhoto(true) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-200 hover:bg-primary-500/10 hover:text-primary-300 transition text-left"
                      >
                        <Eye size={14} className="text-primary-400" /> View
                      </button>
                    )}
                    <button
                      onClick={() => { setShowPhotoMenu(false); photoRef.current.click() }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-200 hover:bg-primary-500/10 hover:text-primary-300 transition text-left border-t border-primary-500/20 first:border-t-0"
                    >
                      <ImageUp size={14} className="text-primary-400" /> Update
                    </button>
                    {photoUrl && (
                      <button
                        onClick={() => { setShowPhotoMenu(false); if (confirm('Remove this photo?')) removePhotoMutation.mutate() }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition text-left border-t border-primary-500/20"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
              <input ref={photoRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (!file) return
                  if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); e.target.value = ''; return }
                  if (file.size > 15 * 1024 * 1024) { toast.error('Image must be under 15 MB'); e.target.value = ''; return }
                  setCropFile(file)
                  e.target.value = ''
                }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary-400">{t.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${t.is_active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                {t.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {hasAttendance && (
            <button
              onClick={() => setShowEnroll(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 transition text-sm"
              title="Enroll this trainer's fingerprint on the device"
            >
              <Fingerprint size={15} /> Fingerprint
            </button>
          )}
          <button onClick={() => setShowPay(true)} className="btn-primary">
            <Banknote size={16} /> Pay Salary
          </button>
        </div>
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
            <UserCog size={15} className="text-primary-400" /> Details
          </h2>
          <InfoRow icon={Phone} label="Phone" value={t.phone} />
          <InfoRow icon={Fingerprint} label="CNIC" value={t.cnic} />
          <InfoRow icon={Calendar} label="Joining Date" value={t.join_date ? new Date(t.join_date).toLocaleDateString('en-PK') : null} />
          <InfoRow icon={Calendar} label="Next Salary Due" value={fmtDate(ss.next_due)} />
          {t.notes && <InfoRow icon={UserCog} label="Notes" value={t.notes} />}
        </div>

        {/* Right column: attendance calendar when enabled, otherwise assigned members */}
        {hasAttendance ? <AttendanceCalendar type="trainer" personId={t.id} /> : assignedMembersCard}
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
            queryClient.invalidateQueries({ queryKey: ['trainer', id] })
            queryClient.invalidateQueries({ queryKey: ['trainers'] })
            invalidateFinance(queryClient)
          }}
        />
      </Modal>

      {t && <EnrollModal member={t} kind="trainer" isOpen={showEnroll} onClose={() => setShowEnroll(false)} />}

      {viewPhoto && photoUrl && <PhotoViewer src={photoUrl} alt={t.name} onClose={() => setViewPhoto(false)} />}
      {cropFile && (
        <PhotoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={(f) => { setCropFile(null); photoMutation.mutate(f) }}
        />
      )}
    </div>
  )
}
