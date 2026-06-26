import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, MessageCircle, Search, Trash2, FileDown, Lock } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import PaymentForm from './PaymentForm'
import toast from 'react-hot-toast'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Payments</h1>
          <p className="text-gray-500 text-sm mt-1">{payments.length} records</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(payments.map((p) => ({
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
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown size={16} /> Export
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

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <Table>
            <Thead>
              <Th>Member</Th>
              <Th>Package</Th>
              <Th>Amount</Th>
              <Th>Paid</Th>
              <Th>Method</Th>
              <Th>Date</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {payments.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div>
                      <p className="font-medium">{p.member_name}</p>
                      <p className="text-xs text-gray-400">{p.member_phone}</p>
                    </div>
                  </Td>
                  <Td>{p.package_name ? <span className="text-blue-400 text-xs">{p.package_name}</span> : (p.notes === 'Admission fee' ? <span className="text-blue-400 text-xs">Admission Fee</span> : <span className="text-gray-400">—</span>)}</Td>
                  <Td>{fmt(p.amount)}</Td>
                  <Td className="font-semibold text-gray-900">{fmt(p.amount_paid)}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.payment_method === 'ONLINE' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-300'}`}>
                      {p.payment_method === 'ONLINE' ? 'Online' : 'Cash'}
                    </span>
                  </Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => downloadSlip(p.id)} title="Download Slip" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition">
                        <Download size={14} />
                      </button>
                      {hasWhatsApp ? (
                        <button onClick={() => sendWhatsApp.mutate(p.id)} title="Send via WhatsApp" className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition">
                          <MessageCircle size={14} />
                        </button>
                      ) : (
                        <button title="Upgrade to Tier 2.1 or Tier 3 to unlock WhatsApp" className="p-1.5 text-gray-600 cursor-not-allowed relative group rounded-lg">
                          <MessageCircle size={14} />
                          <Lock size={8} className="absolute -top-0.5 -right-0.5 text-gray-500" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-gray-300 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                            Upgrade to Tier 2.1 or Pro
                          </span>
                        </button>
                      )}
                      {p.slip_sent && <span className="text-xs text-green-500 ml-1">✓ Sent</span>}
                      <button onClick={() => { if (confirm('Delete this payment record?')) deleteMutation.mutate(p.id) }} title="Delete" className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {!payments.length && (
                <Tr><Td colSpan={7} className="text-center py-16 text-gray-400">No payments recorded yet.</Td></Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Payment">
        <PaymentForm onSuccess={() => { setShowModal(false); queryClient.invalidateQueries(['payments']) }} />
      </Modal>
    </div>
  )
}
