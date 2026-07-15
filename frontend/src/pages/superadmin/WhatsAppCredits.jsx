import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, ChevronRight, AlertTriangle } from 'lucide-react'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import { CREDIT_TONES } from '../../utils/waCredits'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'

// Balance bar reused per row.
function BalanceBar({ c }) {
  const tone = CREDIT_TONES[c.alert_level] || CREDIT_TONES.ok
  return (
    <div className="w-40">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-300">{c.used} / {c.allowance}</span>
        <span className={tone.text}>{c.remaining} left</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-700/60 overflow-hidden">
        <div className={`h-full rounded-full ${tone.bar}`}
             style={{ width: `${c.allowance ? c.percent_used : 100}%` }} />
      </div>
    </div>
  )
}

export default function WhatsAppCredits() {
  const [gymFilter, setGymFilter] = useState('')
  const navigate = useNavigate()

  const { data: gyms = [] } = useQuery({
    queryKey: ['gyms'],
    queryFn: async () => { const { data } = await api.get('/gyms/'); return data },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['wa-credits', gymFilter],
    queryFn: async () => {
      const params = gymFilter ? { gym: gymFilter } : {}
      const { data } = await api.get('/gyms/whatsapp-credits/', { params })
      return data
    },
  })

  const credits = data?.credits || []
  const topups = data?.topups || []
  const needsAttention = credits.filter(c => c.alert_level)
  const soldTotal = topups.reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 flex items-center gap-2">
            <MessageCircle size={22} /> WhatsApp Credits
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {credits.length} WhatsApp {credits.length === 1 ? 'gym' : 'gyms'} · {fmt(soldTotal)} sold
          </p>
        </div>
        <select className="input w-56" value={gymFilter} onChange={(e) => setGymFilter(e.target.value)}>
          <option value="">All Gyms</option>
          {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {needsAttention.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-300 shrink-0" />
          <p className="text-sm text-amber-200">
            <span className="font-semibold">{needsAttention.length}</span>{' '}
            {needsAttention.length === 1 ? 'gym is' : 'gyms are'} running low or out of messages —
            open a gym to top it up.
          </p>
        </div>
      )}

      {/* Balances */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <Table>
            <Thead>
              <Th>Gym</Th>
              <Th>Balance</Th>
              <Th>Rate</Th>
              <Th>Status</Th>
              <Th></Th>
            </Thead>
            <Tbody>
              {credits.map((c) => (
                <Tr key={c.gym}>
                  <Td className="font-medium text-gray-100">{c.gym_name}</Td>
                  <Td><BalanceBar c={c} /></Td>
                  <Td className="text-gray-400">PKR {Number(c.rate)}</Td>
                  <Td>
                    {c.exhausted ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-300">
                        {c.allowance === 0 ? 'Never topped up' : 'Out of messages'}
                      </span>
                    ) : c.alert_level ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300">
                        Running low
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/20 text-green-400">
                        Active
                      </span>
                    )}
                  </Td>
                  <Td>
                    <button
                      onClick={() => navigate(`/admin/gyms/${c.gym}`)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:bg-primary-500 hover:text-white transition"
                    >
                      Top up <ChevronRight size={13} />
                    </button>
                  </Td>
                </Tr>
              ))}
              {!credits.length && (
                <Tr><Td colSpan={5} className="text-center py-16 text-gray-400">No gyms on a WhatsApp plan yet.</Td></Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>

      {/* Top-up ledger */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top-up history</h2>
        <div className="card">
          <Table>
            <Thead>
              <Th>Date</Th>
              <Th>Gym</Th>
              <Th>Bought</Th>
              <Th>Carried</Th>
              <Th>New balance</Th>
              <Th>Amount</Th>
              <Th>By</Th>
            </Thead>
            <Tbody>
              {topups.map((t) => (
                <Tr key={t.id}>
                  <Td className="text-gray-400 whitespace-nowrap">{fmtDay(t.created_at)}</Td>
                  <Td className="font-medium text-gray-100">{t.gym_name}</Td>
                  <Td className="text-gray-300">+{t.messages}</Td>
                  <Td className="text-gray-400">{t.carried_over || '—'}</Td>
                  <Td className="text-gray-300">{t.allowance_after}</Td>
                  <Td className="font-semibold text-green-400">{fmt(t.amount)}</Td>
                  <Td className="text-gray-500">{t.created_by_name || '—'}</Td>
                </Tr>
              ))}
              {!topups.length && (
                <Tr><Td colSpan={7} className="text-center py-12 text-gray-400">No top-ups recorded yet.</Td></Tr>
              )}
            </Tbody>
          </Table>
        </div>
      </div>
    </div>
  )
}
