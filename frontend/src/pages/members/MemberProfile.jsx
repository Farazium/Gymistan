import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MoreVertical, Eye, ImageUp, Trash2, Phone, User, Package, Calendar, MapPin, FileText, Ban, Fingerprint } from 'lucide-react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import useAuthStore from '../../store/authStore'
import AttendanceCalendar from '../../components/ui/AttendanceCalendar'
import Modal from '../../components/ui/Modal'
import EnrollModal from '../../components/EnrollModal'
import PhotoViewer from '../../components/ui/PhotoViewer'
import PhotoCropper from '../../components/ui/PhotoCropper'
import { apiErrorMessage } from '../../utils/apiError'
import { isNotFound, retryUnlessNotFound } from '../../utils/queryRetry'

function BlacklistForm({ onSubmit, isPending }) {
  const [reason, setReason] = useState('')
  const [indefinite, setIndefinite] = useState(false)
  const [months, setMonths] = useState(1)

  const submit = (e) => {
    e.preventDefault()
    if (!reason.trim()) { toast.error('Please enter a reason'); return }
    if (!indefinite && (!months || months < 1)) { toast.error('Enter at least 1 month, or choose indefinite'); return }
    onSubmit({ reason: reason.trim(), indefinite, duration_months: indefinite ? undefined : Number(months) })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Reason *</label>
        <textarea
          className="input min-h-[80px]"
          placeholder="Why is this member being blacklisted?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Duration</label>
        <label className="flex items-center gap-2 cursor-pointer select-none mb-3">
          <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} />
          <span className="text-sm text-gray-300">Indefinite (no end date)</span>
        </label>
        {!indefinite && (
          <div className="flex items-center gap-2">
            <input
              className="input w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              min="1"
              value={months}
              onWheel={(e) => e.target.blur()}
              onKeyDown={(e) => { if (['-', 'e', 'E', '+', '.'].includes(e.key)) e.preventDefault() }}
              onChange={(e) => setMonths(e.target.value)}
            />
            <span className="text-sm text-gray-400">month{Number(months) === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
      <button type="submit" disabled={isPending} className="btn-primary w-full justify-center">
        {isPending ? 'Blacklisting…' : 'Blacklist Member'}
      </button>
    </form>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-700 last:border-0">
      <div className="p-2 bg-primary-500/15 rounded-lg mt-0.5">
        <Icon size={14} className="text-primary-400" />
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
  const photoRef = useRef(null)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)

  const { data: member, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['member', id],
    queryFn: async () => { const { data } = await api.get(`/members/${id}/`); return data },
    retry: retryUnlessNotFound,
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
    onSuccess: () => { toast.success('Photo updated'); queryClient.invalidateQueries({ queryKey: ['member', id] }) },
    onError: () => toast.error('Failed to upload photo'),
  })

  const removePhotoMutation = useMutation({
    mutationFn: () => api.patch(`/members/${id}/`, { photo: null }),
    onSuccess: () => { toast.success('Photo removed'); queryClient.invalidateQueries({ queryKey: ['member', id] }) },
    onError: () => toast.error('Failed to remove photo'),
  })

  const photoMenuRef = useRef(null)
  const [showPhotoMenu, setShowPhotoMenu] = useState(false)
  useEffect(() => {
    if (!showPhotoMenu) return
    const onClick = (e) => { if (photoMenuRef.current && !photoMenuRef.current.contains(e.target)) setShowPhotoMenu(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showPhotoMenu])

  const [viewPhoto, setViewPhoto] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [showEnroll, setShowEnroll] = useState(false)

  const blacklistMutation = useMutation({
    mutationFn: (body) => api.post(`/members/${id}/blacklist/`, body),
    onSuccess: () => {
      setShowBlacklist(false)
      queryClient.invalidateQueries({ queryKey: ['member', id] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['members-blacklisted'] })
      toast.success('Member blacklisted')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to blacklist member')),
  })

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" />
    </div>
  )

  // A genuine 404 means the member is gone. Any other failure (network blip,
  // server restart, 5xx) is transient — don't cry "not found", offer a retry.
  if (isError && !isNotFound(error)) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-gray-300 font-medium">Couldn’t load this member</p>
      <p className="text-gray-500 text-sm mt-1">A connection or server hiccup — the record is safe.</p>
      <button onClick={() => refetch()} disabled={isFetching} className="btn-primary mt-4">
        {isFetching ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )

  if (!member) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-gray-300 font-medium">Member not found</p>
      <p className="text-gray-500 text-sm mt-1">It may have been removed, or the link is wrong.</p>
      <button onClick={() => navigate('/members')} className="btn-primary mt-4">
        <ArrowLeft size={16} /> Back to Members
      </button>
    </div>
  )

  const photoUrl = member.photo
    ? (member.photo.startsWith('http') ? member.photo : `http://localhost:8000${member.photo}`)
    : null

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/members')} className="no-fx flex items-center gap-2 text-gray-400 hover:text-gray-100 text-sm transition">
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
            <div className="absolute bottom-0 right-0" ref={photoMenuRef}>
              <button
                onClick={() => setShowPhotoMenu((s) => !s)}
                className="p-1.5 rounded-full bg-primary-600 text-white shadow-md transition"
              >
                {(photoMutation.isPending || removePhotoMutation.isPending)
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <MoreVertical size={12} />
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

          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-100">{member.name}</h1>
              {(() => {
                // Deleted and blacklisted take precedence over the membership status.
                const deleted = member.is_deleted
                const bl = member.blacklist_active
                const label = deleted ? 'Deleted' : bl ? 'Blacklisted' : member.status === 'ACTIVE' ? 'Active' : 'Expired'
                const cls = deleted ? 'bg-gray-500/20 text-gray-300'
                  : bl ? 'bg-amber-500/20 text-amber-400'
                  : member.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
                return (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${cls}`}>
                    {deleted ? <Trash2 size={11} /> : bl ? <Ban size={11} /> : null}
                    {label}
                  </span>
                )
              })()}
            </div>
            {member.package_detail?.name && (
              <p className="text-primary-400 text-sm mt-1">{member.package_detail.name}</p>
            )}
            <p className="text-gray-400 text-sm mt-1">{member.phone}</p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Expires</p>
              <p className="text-gray-100 font-semibold mt-1">
                {member.expiry_date ? new Date(member.expiry_date).toLocaleDateString('en-PK') : '—'}
              </p>
            </div>
            {hasAttendance && (
              <button
                onClick={() => setShowEnroll(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-500/30 hover:text-white hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/20 transition-all"
                title="Enroll this member's fingerprint on the device"
              >
                <Fingerprint size={14} /> Fingerprint
              </button>
            )}
            {!member.blacklist_active && (
              <button
                onClick={() => setShowBlacklist(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-500/30 hover:text-white hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/20 transition-all"
              >
                <Ban size={14} /> Blacklist
              </button>
            )}
          </div>
        </div>
        {member.blacklist_active && member.blacklist_reason && (
          <div className="mt-4 pt-4 border-t border-gray-700 text-sm">
            <span className="text-amber-400 font-medium">Blacklisted:</span>{' '}
            <span className="text-gray-300">{member.blacklist_reason}</span>
            <span className="text-gray-500">
              {' · '}
              {member.blacklist_until
                ? `Until ${new Date(member.blacklist_until).toLocaleDateString('en-PK')}`
                : 'Indefinite'}
            </span>
          </div>
        )}
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
        {hasAttendance && <AttendanceCalendar type="member" personId={member.id} />}
      </div>

      {/* Payment history */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-100 mb-4">Payment History</h3>
        {payments.length ? (
          <div className="space-y-2">
            {payments.slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div>
                  <p className="text-sm text-gray-100 font-medium">PKR {Number(p.amount_paid).toLocaleString('en-PK')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.notes || 'Monthly payment'}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {p.status === 'PAID' ? 'Paid' : p.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{new Date(p.payment_date).toLocaleDateString('en-PK')}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm text-center py-6">No payments recorded</p>
        )}
      </div>

      <Modal isOpen={showBlacklist} onClose={() => setShowBlacklist(false)} title={`Blacklist ${member.name}`}>
        <BlacklistForm onSubmit={(body) => blacklistMutation.mutate(body)} isPending={blacklistMutation.isPending} />
      </Modal>

      {member && <EnrollModal member={member} isOpen={showEnroll} onClose={() => setShowEnroll(false)} />}

      {viewPhoto && photoUrl && <PhotoViewer src={photoUrl} alt={member.name} onClose={() => setViewPhoto(false)} />}
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
