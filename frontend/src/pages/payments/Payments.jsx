import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, MessageCircle, Search } from 'lucide-react'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import PaymentForm from './PaymentForm'
import toast from 'react-hot-toast'

const fetchPayments = async (search, status) => {
  const params = {}
  if (search) params.search = search
  if (status) params.status = status
  const { data } = await api.get('/payments/', { params })
  return data?.results || data || []
}

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`

export default function Payments() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const queryClient = useQueryClient()

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', search, statusFilter],
    queryFn: () => fetchPayments(search, statusFilter),
  })

  const downloadSlip = async (id) => {
    try {
      const res = await api.get(`/payments/${id}/slip/`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url; a.download = `slip_${id}.pdf`; a.click()
    } catch { toast.error('Failed to download slip') }
  }

  const sendWhatsApp = useMutation({
    mutationFn: (id) => api.post(`/payments/${id}/whatsapp/`),
    onSuccess: () => { toast.success('Slip sent via WhatsApp!'); queryClient.invalidateQueries(['payments']) },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-500 text-sm mt-1">{payments.length} records</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> Record Payment
        </button>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
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
              <Th>Status</Th>
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
                  <Td>{p.package_name || <span className="text-gray-400">—</span>}</Td>
                  <Td>{fmt(p.amount)}</Td>
                  <Td className="font-semibold text-gray-900">{fmt(p.amount_paid)}</Td>
                  <Td><span className={`badge-${p.status.toLowerCase()}`}>{p.status}</span></Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => downloadSlip(p.id)} title="Download Slip" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition">
                        <Download size={14} />
                      </button>
                      <button onClick={() => sendWhatsApp.mutate(p.id)} title="Send via WhatsApp" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition">
                        <MessageCircle size={14} />
                      </button>
                      {p.slip_sent && <span className="text-xs text-green-500 ml-1">✓ Sent</span>}
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
