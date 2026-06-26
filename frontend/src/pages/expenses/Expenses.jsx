import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Receipt, FileDown, ChevronUp, ChevronDown } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

const CATEGORIES = ['RENT', 'UTILITIES', 'SALARIES', 'EQUIPMENT', 'MAINTENANCE', 'MARKETING', 'OTHER']

const categoryColors = {
  RENT: 'bg-gray-700 text-blue-400',
  UTILITIES: 'bg-gray-700 text-yellow-400',
  SALARIES: 'bg-gray-700 text-green-400',
  EQUIPMENT: 'bg-gray-700 text-purple-400',
  MAINTENANCE: 'bg-gray-700 text-orange-400',
  MARKETING: 'bg-gray-700 text-pink-400',
  OTHER: 'bg-gray-700 text-gray-300',
}

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`

function ExpenseForm({ onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { date: new Date().toISOString().split('T')[0], category: 'OTHER' }
  })
  const mutation = useMutation({
    mutationFn: (data) => api.post('/expenses/', data),
    onSuccess: () => { toast.success('Expense added'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })
  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <label className="label">Title *</label>
        <input className="input" placeholder="e.g. Monthly Rent" {...register('title', { required: true })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Amount (PKR) *</label>
          <input className="input" type="number" {...register('amount', { required: true })} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" {...register('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Date *</label>
        <input className="input" type="date" {...register('date', { required: true })} />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input h-20 resize-none" {...register('description')} />
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Adding...' : 'Add Expense'}
      </button>
    </form>
  )
}

export default function Expenses() {
  const [showModal, setShowModal] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const queryClient = useQueryClient()
  const now = new Date()

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <ChevronUp size={13} className="text-gray-600" />
    return sort.dir === 'asc' ? <ChevronUp size={13} className="text-blue-400" /> : <ChevronDown size={13} className="text-blue-400" />
  }

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', categoryFilter],
    queryFn: async () => {
      const params = { month: now.getMonth() + 1, year: now.getFullYear() }
      if (categoryFilter) params.category = categoryFilter
      const { data } = await api.get('/expenses/', { params })
      return data?.results || data || []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/expenses/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries(['expenses']); toast.success('Expense deleted') },
  })

  const sortedExpenses = [...expenses].sort((a, b) => {
    if (!sort.key) return 0
    let av = sort.key === 'amount' ? Number(a.amount) : new Date(a.date)
    let bv = sort.key === 'amount' ? Number(b.amount) : new Date(b.date)
    return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Expenses</h1>
          <p className="text-gray-500 text-sm mt-1">
            {now.toLocaleString('en-PK', { month: 'long', year: 'numeric' })} — Total: <span className="font-semibold text-red-600">{fmt(total)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(expenses.map((e) => ({
              Title: e.title,
              Category: e.category,
              Amount: e.amount,
              Date: new Date(e.date).toLocaleDateString('en-PK'),
              Description: e.description || '',
              'Added By': e.added_by_name || '',
            })), 'Expenses')}
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown size={16} /> Export
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      <div className="card p-4">
        <select className="input w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <Table>
            <Thead>
              <Th>Title</Th>
              <Th>Category</Th>
              <Th>
                <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 hover:text-blue-400 transition">
                  Amount <SortIcon col="amount" />
                </button>
              </Th>
              <Th>
                <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-blue-400 transition">
                  Date <SortIcon col="date" />
                </button>
              </Th>
              <Th>Added By</Th>
              <Th></Th>
            </Thead>
            <Tbody>
              {sortedExpenses.map((e) => (
                <Tr key={e.id}>
                  <Td>
                    <p className="font-medium">{e.title}</p>
                    {e.description && <p className="text-xs text-gray-400">{e.description}</p>}
                  </Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[e.category]}`}>
                      {e.category}
                    </span>
                  </Td>
                  <Td className="font-semibold text-red-600">{fmt(e.amount)}</Td>
                  <Td className="text-gray-400">{new Date(e.date).toLocaleDateString('en-PK')}</Td>
                  <Td className="text-gray-400">{e.added_by_name || '—'}</Td>
                  <Td>
                    <button onClick={() => { if (confirm('Delete expense?')) deleteMutation.mutate(e.id) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </Tr>
              ))}
              {!expenses.length && (
                <Tr><Td colSpan={6} className="text-center py-16 text-gray-400">
                  <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                  No expenses this month.
                </Td></Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Expense">
        <ExpenseForm onSuccess={() => { setShowModal(false); queryClient.invalidateQueries(['expenses']) }} />
      </Modal>
    </div>
  )
}
