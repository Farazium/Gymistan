import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Receipt, Download } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'
import { invalidateFinance } from '../../utils/invalidateFinance'
import { fmtCurrency as fmt } from '../../utils/format'

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const CATEGORIES = ['RENT', 'UTILITIES', 'BILLS', 'SALARIES', 'EQUIPMENT', 'MAINTENANCE', 'MARKETING', 'INVENTORY', 'OTHER']

const categoryColors = {
  RENT: 'bg-primary-500/20 text-primary-300',
  UTILITIES: 'bg-yellow-500/20 text-yellow-400',
  BILLS: 'bg-cyan-500/20 text-cyan-400',
  SALARIES: 'bg-green-500/20 text-green-400',
  EQUIPMENT: 'bg-purple-500/20 text-purple-400',
  MAINTENANCE: 'bg-orange-500/20 text-orange-400',
  MARKETING: 'bg-pink-500/20 text-pink-400',
  INVENTORY: 'bg-emerald-500/20 text-emerald-400',
  OTHER: 'bg-gray-600/40 text-gray-300',
}


function ExpenseForm({ onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({
    defaultValues: { date: todayISO(), category: 'OTHER' }
  })
  const mutation = useMutation({
    mutationFn: (data) => api.post('/expenses/', data),
    onSuccess: () => { toast.success('Expense added'); onSuccess() },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to add expense')),
  })
  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <label className="label">Title *</label>
        <input className="input" placeholder="e.g. Monthly Rent" {...register('title', { required: 'Title is required' })} />
        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Amount (PKR) *</label>
          <input
            className="input"
            type="number"
            min="1"
            onWheel={e => e.target.blur()}
            onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
            {...register('amount', { required: 'Amount is required', min: { value: 1, message: 'Amount must be greater than 0' } })}
          />
          {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
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
        <input
          className="input [color-scheme:dark]"
          type="date"
          max={todayISO()}
          {...register('date', {
            required: 'Date is required',
            validate: v => !v || v <= todayISO() || 'Date cannot be in the future',
          })}
        />
        {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
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
    onSuccess: () => { queryClient.invalidateQueries(['expenses']); invalidateFinance(queryClient); toast.success('Expense deleted') },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete expense')),
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
          <h1 className="text-2xl font-bold text-primary-400">Expenses</h1>
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
            className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:bg-primary-500 hover:text-white hover:border-primary-500 transition"
            title="Export"
          >
            <Download size={18} />
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
                      <div className="shrink-0 w-24">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[e.category]}`}>
                          {e.category}
                        </span>
                      </div>
                      <span className="font-semibold text-red-500 shrink-0 w-28 text-right">{fmt(e.amount)}</span>
                      <span className="text-gray-400 text-sm shrink-0 w-24 text-right">
                        {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      <div className="shrink-0 w-7 flex justify-center">
                        {e.deletable && (
                          <button
                            onClick={() => { if (confirm('Delete expense?')) deleteMutation.mutate(e.id) }}
                            className="p-1.5 text-gray-500 hover:text-white hover:bg-red-500 rounded-lg transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Expense">
        <ExpenseForm onSuccess={() => { setShowModal(false); queryClient.invalidateQueries(['expenses']); invalidateFinance(queryClient) }} />
      </Modal>
    </div>
  )
}
