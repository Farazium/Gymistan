import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, RotateCcw, MessageCircle } from 'lucide-react'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'

export default function WhatsAppBills() {
  const [gymFilter, setGymFilter] = useState('')
  const queryClient = useQueryClient()

  const { data: gyms = [] } = useQuery({
    queryKey: ['gyms'],
    queryFn: async () => { const { data } = await api.get('/gyms/'); return data },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['wa-bills', gymFilter],
    queryFn: async () => {
      const params = gymFilter ? { gym: gymFilter } : {}
      const { data } = await api.get('/gyms/whatsapp-bills/', { params })
      return data
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }) => api.post(`/gyms/whatsapp-bills/${id}/mark-paid/`, { status }),
    onSuccess: () => { queryClient.invalidateQueries(['wa-bills']); toast.success('Updated') },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update')),
  })

  const bills = data?.bills || []
  const current = data?.current || []
  const pendingTotal = bills.filter(b => b.status === 'PENDING').reduce((s, b) => s + Number(b.amount), 0)
  const runningTotal = current.reduce((s, c) => s + Number(c.amount), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 flex items-center gap-2">
            <MessageCircle size={22} /> WhatsApp Bills
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {bills.length} bills · {fmt(pendingTotal)} pending
          </p>
        </div>
        <select className="input w-56" value={gymFilter} onChange={(e) => setGymFilter(e.target.value)}>
          <option value="">All Gyms</option>
          {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={`card p-4 border ${pendingTotal > 0 ? 'border-amber-400/25 bg-amber-500/5' : 'border-primary-400/20 bg-primary-500/5'}`}>
          <p className="text-xs text-gray-400">Pending dues (billed)</p>
          <p className={`text-2xl font-bold mt-1 ${pendingTotal > 0 ? 'text-amber-400' : 'text-primary-300'}`}>{fmt(pendingTotal)}</p>
        </div>
        <div className="card p-4 border border-primary-400/20 bg-primary-500/5">
          <p className="text-xs text-gray-400">In-progress this month (unbilled)</p>
          <p className="text-2xl font-bold text-primary-300 mt-1">{fmt(runningTotal)}</p>
        </div>
      </div>

      {/* Live current-period running totals per gym */}
      {current.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Running this cycle</h2>
          <div className="card">
            <Table>
              <Thead>
                <Th>Gym</Th>
                <Th>Cycle</Th>
                <Th>Messages</Th>
                <Th>Rate</Th>
                <Th>Running Amount</Th>
              </Thead>
              <Tbody>
                {current.map((c) => (
                  <Tr key={c.gym}>
                    <Td className="font-medium text-gray-100">{c.gym_name}</Td>
                    <Td className="text-gray-400">{fmtDay(c.period_start)} – {fmtDay(c.period_end)}</Td>
                    <Td className="text-gray-300">{c.message_count}</Td>
                    <Td className="text-gray-400">PKR {Number(c.rate)}</Td>
                    <Td className="font-semibold text-primary-300">{fmt(c.amount)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </div>
      )}

      {/* Generated bills */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <Table>
            <Thead>
              <Th>Gym</Th>
              <Th>Period</Th>
              <Th>Messages</Th>
              <Th>Rate</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </Thead>
            <Tbody>
              {bills.map((b) => (
                <Tr key={b.id}>
                  <Td className="font-medium text-gray-100">{b.gym_name}</Td>
                  <Td className="text-gray-400">{fmtDay(b.period_start)} – {fmtDay(b.period_end)}</Td>
                  <Td className="text-gray-300">{b.message_count}</Td>
                  <Td className="text-gray-400">PKR {Number(b.rate)}</Td>
                  <Td className="font-semibold text-green-400">{fmt(b.amount)}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {b.status === 'PAID' ? 'Paid' : 'Pending'}
                    </span>
                  </Td>
                  <Td>
                    {b.status === 'PENDING' ? (
                      <button
                        onClick={() => toggleMutation.mutate({ id: b.id, status: 'PAID' })}
                        disabled={toggleMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-green-500/20 text-green-300 border border-green-400/30 hover:bg-green-500 hover:text-white hover:border-green-500 transition"
                      >
                        <CheckCircle2 size={14} /> Mark Paid
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleMutation.mutate({ id: b.id, status: 'PENDING' })}
                        disabled={toggleMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600 hover:text-white transition"
                        title="Revert to pending"
                      >
                        <RotateCcw size={14} /> Undo
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
              {!bills.length && (
                <Tr><Td colSpan={7} className="text-center py-16 text-gray-400">No bills generated yet.</Td></Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
