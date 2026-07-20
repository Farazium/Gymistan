import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Trash2, Download } from 'lucide-react'
import api from '../../api/axios'
import { exportToExcel } from '../../utils/exportExcel'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'

const todayISO = () => new Date().toISOString().split('T')[0]

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`

function PaymentForm({ gyms, onSuccess }) {
  const [gymSearch, setGymSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedGym, setSelectedGym] = useState(null)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues: { payment_date: new Date().toISOString().split('T')[0], payment_method: 'CASH', months: 1 }
  })

  const filteredGyms = gyms.filter(g => g.name.toLowerCase().includes(gymSearch.toLowerCase()))

  const selectGym = (g) => {
    setSelectedGym(g)
    setGymSearch(g.name)
    setShowDropdown(false)
    setValue('gym', g.id, { shouldValidate: true })
    setValue('amount', Number(g.subscription_amount) || 0)
  }

  const mutation = useMutation({
    mutationFn: (data) => api.post('/gyms/gym-payments/', data),
    onSuccess: () => {
      toast.success('Payment recorded')
      reset()
      setGymSearch('')
      setSelectedGym(null)
      onSuccess()
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to record payment')),
  })

  const onSubmit = (d) => {
    if (!selectedGym) { toast.error('Please select a gym'); return }
    if (!Number(d.amount)) { toast.error("This gym has no subscription amount set — set it in the gym's profile first"); return }
    mutation.mutate(d)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register('gym', { required: true })} />
      <div>
        <label className="label">Gym *</label>
        <div className="relative">
          <input
            className="input"
            placeholder="Search gym..."
            value={gymSearch}
            onChange={(e) => { setGymSearch(e.target.value); setShowDropdown(true); setSelectedGym(null); setValue('gym', '') }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            autoComplete="off"
          />
          {showDropdown && filteredGyms.length > 0 && (
            <div className="absolute z-50 w-full mt-1 surface border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {filteredGyms.map((g) => (
                <button key={g.id} type="button" onMouseDown={() => selectGym(g)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 transition flex items-center justify-between [--btn-fill:55_65_81] [--btn-edge:31_41_55]">
                  <span>{g.name}</span>
                  {g.subscription_amount && <span className="text-xs text-primary-400">PKR {Number(g.subscription_amount).toLocaleString('en-PK')}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {errors.gym && <p className="text-red-500 text-xs mt-1">Select a gym</p>}
        {selectedGym && (
          <div className="mt-2 px-3 py-2 bg-gray-700/50 rounded-lg flex items-center justify-between">
            <span className="text-xs text-gray-400">Subscription Amount</span>
            <span className="text-sm font-semibold text-green-400">
              {selectedGym.subscription_amount ? fmt(selectedGym.subscription_amount) : <span className="text-gray-500">Not set</span>}
            </span>
          </div>
        )}
      </div>
      <input type="hidden" {...register('amount')} />
      <div>
        <label className="label">Extends Expiry By</label>
        <select className="input" {...register('months', { valueAsNumber: true })}>
          {[1,2,3,6,12].map(m => <option key={m} value={m}>{m} {m === 1 ? 'month' : 'months'}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Payment Method</label>
        <select className="input" {...register('payment_method')}>
          <option value="CASH">Cash</option>
          <option value="ONLINE">Online</option>
        </select>
      </div>
      <div>
        <label className="label">Payment Date *</label>
        <input className="input [color-scheme:dark]" type="date" max={todayISO()} {...register('payment_date', { required: 'Payment date is required', validate: v => !v || v <= todayISO() || 'Date cannot be in the future' })} />
        {errors.payment_date && <p className="text-red-500 text-xs mt-1">{errors.payment_date.message}</p>}
      </div>
      <div>
        <label className="label">Notes</label>
        <input className="input" placeholder="e.g. June subscription" {...register('notes')} />
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Saving...' : 'Record Payment'}
      </button>
    </form>
  )
}

export default function GymPayments() {
  const [showModal, setShowModal] = useState(false)
  const [gymFilter, setGymFilter] = useState('')
  const queryClient = useQueryClient()

  const { data: gyms = [] } = useQuery({
    queryKey: ['gyms'],
    queryFn: async () => { const { data } = await api.get('/gyms/'); return data },
  })

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['gym-payments', gymFilter],
    queryFn: async () => {
      const params = gymFilter ? { gym: gymFilter } : {}
      const { data } = await api.get('/gyms/gym-payments/', { params })
      return data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/gyms/gym-payments/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gym-payments'] }); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const totalAmount = payments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Subscriptions</h1>
          <p className="text-gray-500 text-sm mt-1">{payments.length} payments · {fmt(totalAmount)} collected</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(payments.map((p) => ({
              Gym: p.gym_name,
              Amount: p.amount,
              Method: p.payment_method === 'ONLINE' ? 'Online' : 'Cash',
              Date: new Date(p.payment_date).toLocaleDateString('en-PK'),
              Notes: p.notes || '',
            })), 'GymSubscriptions')}
            className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 transition"
            title="Export"
          >
            <Download size={18} />
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> Record Payment
          </button>
        </div>
      </div>

      <div className="card p-4">
        <select className="input w-64" value={gymFilter} onChange={(e) => setGymFilter(e.target.value)}>
          <option value="">All Gyms</option>
          {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <Table>
            <Thead>
              <Th>Gym</Th>
              <Th>Amount</Th>
              <Th>Months</Th>
              <Th>Method</Th>
              <Th>Date</Th>
              <Th>Notes</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-gray-100">{p.gym_name}</Td>
                  <Td className="font-semibold text-green-400">{fmt(p.amount)}</Td>
                  <Td className="text-gray-300">{p.months} {p.months === 1 ? 'month' : 'months'}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.payment_method === 'ONLINE' ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-700 text-gray-300'}`}>
                      {p.payment_method === 'ONLINE' ? 'Online' : 'Cash'}
                    </span>
                  </Td>
                  <Td className="text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-PK')}</Td>
                  <Td className="text-gray-400">{p.notes || '—'}</Td>
                  <Td>
                    <button
                      onClick={() => { if (confirm('Delete this payment?')) deleteMutation.mutate(p.id) }}
                      className="p-1.5 text-gray-400 hover:text-white rounded-lg transition [--btn-fill:239_68_68] [--btn-edge:185_28_28]"
                    >
                      <Trash2 size={14} />
                    </button>
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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Gym Payment">
        <PaymentForm gyms={gyms} onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['gym-payments'] }) }} />
      </Modal>
    </div>
  )
}
