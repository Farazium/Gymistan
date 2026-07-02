import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, MessageCircle, Search, Trash2, FileDown } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import Modal from '../../components/ui/Modal'
import PaymentForm from './PaymentForm'
import toast from 'react-hot-toast'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`

function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : ''
}

function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
}

export default function Payments() {
  const { user } = useAuthStore()
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)

  const [search, setSearch] = useState('')
  const [packageFilter, setPackageFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const queryClient = useQueryClient()

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => { const { data } = await api.get('/packages/'); return data?.results || data || [] },
  })

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', search, packageFilter],
    queryFn: async () => {
      const params = {}
      if (search) params.search = search
      if (packageFilter) params.package = packageFilter
      const { data } = await api.get('/payments/', { params })
      return data?.results || data || []
    },
  })

  const downloadSlip = async (id) => {
    try {
      const res = await api.get(`/payments/${id}/slip/`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url; a.download = `slip_${id}.pdf`; a.click()
    } catch { toast.error('Failed to download slip') }
  }

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/payments/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries(['payments']); toast.success('Payment deleted') },
    onError: () => toast.error('Failed to delete payment'),
  })

  const sendWhatsApp = useMutation({
    mutationFn: (id) => api.post(`/payments/${id}/whatsapp/`),
    onSuccess: () => { toast.success('Slip sent via WhatsApp!'); queryClient.invalidateQueries(['payments']) },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send'),
  })

  // Sort newest first, group by month
  const sorted = [...payments].sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))

  const groups = []
  let lastKey = null
  sorted.forEach((p) => {
    const key = monthKey(p.payment_date)
    if (key !== lastKey) {
      groups.push({ key, label: monthLabel(key), items: [] })
      lastKey = key
    }
    groups[groups.length - 1].items.push(p)
  })

  const total = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Payments</h1>
          <p className="text-gray-500 text-sm mt-1">
            {payments.length} records — Total: <span className="font-semibold text-green-500">{fmt(total)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(sorted.map((p) => ({
              Member: p.member_name,
              Phone: p.member_phone || '',
              Package: p.package_name || (p.notes === 'Admission fee' ? 'Admission Fee' : ''),
              Amount: p.amount,
              'Amount Paid': p.amount_paid,
              Discount: p.discount || 0,
              Method: p.payment_method === 'ONLINE' ? 'Online' : 'Cash',
              Date: new Date(p.payment_date).toLocaleDateString('en-PK'),
              Notes: p.notes || '',
            })), 'Payments')}
            className="p-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/30 hover:bg-blue-500/30 hover:border-blue-400/50 transition"
            title="Export"
          >
            <FileDown size={18} />
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> Record Payment
          </button>
        </div>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
          <option value="">All Packages</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : !payments.length ? (
        <div className="card flex flex-col items-center py-16 text-gray-400">
          No payments recorded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const groupTotal = group.items.reduce((s, p) => s + Number(p.amount_paid), 0)
            return (
              <div key={group.key}>
                {/* Month separator */}
                <div className="flex items-center justify-between px-1 pt-4 pb-2">
                  <h2 className="text-lg font-bold text-gray-200">{group.label}</h2>
                  <span className="text-sm font-semibold text-green-500">{fmt(groupTotal)}</span>
                </div>

                <div className="card divide-y divide-gray-700/60">
                  {/* Column headers */}
                  <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex-1">Member</span>
                    <span className="shrink-0 w-28">Package</span>
                    <span className="shrink-0 w-24 text-right">Paid</span>
                    <span className="shrink-0 w-16 text-center">Method</span>
                    <span className="shrink-0 w-24 text-right">Date</span>
                    <span className="shrink-0 w-20 text-right">Actions</span>
                  </div>

                  {group.items.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-700/30 transition">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-100 truncate">{p.member_name}</p>
                        <p className="text-xs text-gray-400">{p.member_phone}</p>
                      </div>
                      <span className="shrink-0 w-28 text-blue-400 text-xs truncate">
                        {p.package_name || (p.notes === 'Admission fee' ? 'Admission Fee' : <span className="text-gray-500">—</span>)}
                      </span>
                      <span className="shrink-0 w-24 text-right font-semibold text-green-400">{fmt(p.amount_paid)}</span>
                      <span className="shrink-0 w-16 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.payment_method === 'ONLINE' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-300'}`}>
                          {p.payment_method === 'ONLINE' ? 'Online' : 'Cash'}
                        </span>
                      </span>
                      <span className="shrink-0 w-24 text-right text-gray-400 text-sm">
                        {new Date(p.payment_date).toLocaleDateString('en-PK')}
                      </span>
                      <div className="shrink-0 w-20 flex items-center justify-end gap-1">
                        <button onClick={() => downloadSlip(p.id)} title="Download Slip" className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition">
                          <Download size={14} />
                        </button>
                        {hasWhatsApp && (
                          <button onClick={() => sendWhatsApp.mutate(p.id)} title="Send via WhatsApp" className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition">
                            <MessageCircle size={14} />
                          </button>
                        )}
                        <button onClick={() => { if (confirm('Delete this payment record?')) deleteMutation.mutate(p.id) }} title="Delete" className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Payment">
        <PaymentForm onSuccess={() => { setShowModal(false); queryClient.invalidateQueries(['payments']) }} />
      </Modal>
    </div>
  )
}
