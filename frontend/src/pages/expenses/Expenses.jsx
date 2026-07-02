import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Receipt, FileDown } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

const CATEGORIES = ['RENT', 'UTILITIES', 'BILLS', 'SALARIES', 'EQUIPMENT', 'MAINTENANCE', 'MARKETING', 'OTHER']

const categoryColors = {
  RENT: 'bg-gray-700 text-blue-400',
  UTILITIES: 'bg-gray-700 text-yellow-400',
  BILLS: 'bg-gray-700 text-cyan-400',
  SALARIES: 'bg-gray-700 text-green-400',
  EQUIPMENT: 'bg-gray-700 text-purple-400',
  MAINTENANCE: 'bg-gray-700 text-orange-400',
  MARKETING: 'bg-gray-700 text-pink-400',
  OTHER: 'bg-gray-700 text-gray-300',
}

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`

function ExpenseForm({ onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })(), category: 'OTHER' }
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
        <input className="input [color-scheme:dark]" type="date" {...register('date', { required: true })} />
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

function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : ''
}

function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
}

export default function Expenses() {
  const [showModal, setShowModal] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const queryClient = useQueryClient()

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', categoryFilter],
    queryFn: async () => {
      const params = {}
      if (categoryFilter) params.category = categoryFilter
      const { data } = await api.get('/expenses/', { params })
      return data?.results || data || []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/expenses/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries(['expenses']); toast.success('Expense deleted') },
  })

  // Sort newest first, then group by month
  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1))

  const groups = []
  let lastKey = null
  sorted.forEach((e) => {
    const key = monthKey(e.date)
    if (key !== lastKey) {
      groups.push({ key, label: monthLabel(key), items: [] })
      lastKey = key
    }
    groups[groups.length - 1].items.push(e)
  })

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Expenses</h1>
          <p className="text-gray-500 text-sm mt-1">
            {expenses.length} entries — Total: <span className="font-semibold text-red-500">{fmt(total)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(sorted.map((e) => ({
              Title: e.title,
              Category: e.category,
              Amount: e.amount,
              Date: new Date(e.date).toLocaleDateString('en-PK'),
              Description: e.description || '',
            })), 'Expenses')}
            className="p-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/30 hover:bg-blue-500/30 hover:border-blue-400/50 transition"
            title="Export"
          >
            <FileDown size={18} />
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

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : !expenses.length ? (
        <div className="card flex flex-col items-center py-16 text-gray-400">
          <Receipt size={32} className="mb-2 opacity-30" />
          No expenses found.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const groupTotal = group.items.reduce((s, e) => s + Number(e.amount), 0)
            return (
              <div key={group.key}>
                {/* Month separator */}
                <div className="flex items-center justify-between px-1 pt-4 pb-2">
                  <h2 className="text-lg font-bold text-gray-200">{group.label}</h2>
                  <span className="text-sm font-semibold text-red-500">{fmt(groupTotal)}</span>
                </div>

                {/* Entries for this month */}
                <div className="card divide-y divide-gray-700/60">
                  <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="flex-1">Title</span>
                    <span className="shrink-0 w-24">Category</span>
                    <span className="shrink-0 w-28 text-right">Amount</span>
                    <span className="shrink-0 w-24 text-right">Date</span>
                    <span className="shrink-0 w-7" />
                  </div>
                  {group.items.map((e) => (
                    <div key={e.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-700/30 transition">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-100 truncate">{e.title}</p>
                        {e.description && <p className="text-xs text-gray-400 truncate">{e.description}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 w-24 text-center ${categoryColors[e.category]}`}>
                        {e.category}
                      </span>
                      <span className="font-semibold text-red-500 shrink-0 w-28 text-right">{fmt(e.amount)}</span>
                      <span className="text-gray-400 text-sm shrink-0 w-24 text-right">
                        {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => { if (confirm('Delete expense?')) deleteMutation.mutate(e.id) }}
                        className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Expense">
        <ExpenseForm onSuccess={() => { setShowModal(false); queryClient.invalidateQueries(['expenses']) }} />
      </Modal>
    </div>
  )
}
