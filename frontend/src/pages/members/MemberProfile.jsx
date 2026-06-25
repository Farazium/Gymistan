import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, Phone, User, Package, Calendar, MapPin, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function AttendanceCalendar() {
  const [current, setCurrent] = useState(new Date())

  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prev = () => setCurrent(new Date(year, month - 1, 1))
  const next = () => setCurrent(new Date(year, month + 1, 1))

  const today = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isPast = (d) => {
    const date = new Date(year, month, d)
    return date < today
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-100">Attendance</h3>
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-100 w-32 text-center">{MONTHS[month]} {year}</span>
          <button onClick={next} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} />
          const past = isPast(d)
          const isToday = isCurrentMonth && d === today.getDate()
          return (
            <div key={d} className="flex items-center justify-center aspect-square">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                ${isToday ? 'ring-2 ring-primary-400' : ''}
                ${!past ? 'text-gray-500' :
                  Math.random() > 0.3
                    ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50'
                    : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                }
              `}>
                {d}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 mt-4 pt-3 border-t border-gray-700">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-green-500/50" /> Present
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-red-500/50" /> Absent
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-gray-700" /> Upcoming
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-700 last:border-0">
      <div className="p-2 bg-gray-700 rounded-lg mt-0.5">
        <Icon size={14} className="text-gray-400" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-100 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  )
}

export default function MemberProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const queryClient = useQueryClient()

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: async () => { const { data } = await api.get(`/members/${id}/`); return data },
  })

  const { data: payments = [] } = useQuery({
    queryKey: ['member-payments', id],
    queryFn: async () => {
      const { data } = await api.get('/payments/', { params: { member: id } })
      return data?.results || data || []
    },
  })

  const photoMutation = useMutation({
    mutationFn: (file) => {
      const form = new FormData()
      form.append('photo', file)
      return api.patch(`/members/${id}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { toast.success('Photo updated'); queryClient.invalidateQueries(['member', id]) },
    onError: () => toast.error('Failed to upload photo'),
  })

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" />
    </div>
  )

  if (!member) return <div className="text-gray-400 text-center py-16">Member not found</div>

  const photoUrl = member.photo
    ? `http://localhost:8000${member.photo}`
    : null

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/members')} className="flex items-center gap-2 text-gray-400 hover:text-gray-100 text-sm transition">
        <ArrowLeft size={16} /> Back to Members
      </button>

      {/* Header card */}
      <div className="card p-6">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
              {photoUrl
                ? <img src={photoUrl} alt={member.name} className="w-full h-full object-cover" />
                : <span className="text-3xl font-bold text-gray-400">{member.name?.[0]?.toUpperCase()}</span>
              }
            </div>
            <button
              onClick={() => fileRef.current.click()}
              className="absolute bottom-0 right-0 p-1.5 bg-primary-600 rounded-full hover:bg-primary-700 transition"
            >
              <Camera size={12} className="text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files[0] && photoMutation.mutate(e.target.files[0])} />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-100">{member.name}</h1>
              <span className={`badge-${member.status.toLowerCase()}`}>{member.status}</span>
            </div>
            {member.package_detail?.name && (
              <p className="text-primary-400 text-sm mt-1">{member.package_detail.name}</p>
            )}
            <p className="text-gray-400 text-sm mt-1">{member.phone}</p>
          </div>

          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">Expires</p>
            <p className="text-gray-100 font-semibold mt-1">
              {member.expiry_date ? new Date(member.expiry_date).toLocaleDateString('en-PK') : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Info */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-100 mb-2">Member Information</h3>
          <InfoRow icon={Phone} label="Phone" value={member.phone} />
          <InfoRow icon={User} label="Gender" value={member.gender === 'FEMALE' ? 'Female' : member.gender === 'MALE' ? 'Male' : null} />
          <InfoRow icon={User} label="Father's Name" value={member.father_name} />
          <InfoRow icon={Package} label="Package" value={member.package_detail?.name} />
          <InfoRow icon={Calendar} label="Joining Date" value={member.join_date ? new Date(member.join_date).toLocaleDateString('en-PK') : null} />
          <InfoRow icon={Calendar} label="Expiry Date" value={member.expiry_date ? new Date(member.expiry_date).toLocaleDateString('en-PK') : null} />
          <InfoRow icon={MapPin} label="Address" value={member.address} />
          <InfoRow icon={FileText} label="Notes" value={member.notes} />
        </div>

        {/* Attendance calendar */}
        <AttendanceCalendar />
      </div>

      {/* Payment history */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-100 mb-4">Payment History</h3>
        {payments.length ? (
          <div className="space-y-2">
            {payments.slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div>
                  <p className="text-sm text-gray-100 font-medium">PKR {Number(p.amount_paid).toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.notes || 'Monthly payment'}</p>
                </div>
                <div className="text-right">
                  <span className={`badge-${p.status.toLowerCase()} text-xs`}>{p.status}</span>
                  <p className="text-xs text-gray-400 mt-1">{new Date(p.payment_date).toLocaleDateString('en-PK')}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm text-center py-6">No payments recorded</p>
        )}
      </div>
    </div>
  )
}
