import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Package, Pencil, Trash2, AlertTriangle, TrendingDown, TrendingUp, SlidersHorizontal, Download, Receipt, X } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'
import { invalidateFinance } from '../../utils/invalidateFinance'
import { fmtCurrency as fmt } from '../../utils/format'

const noNeg = e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }

const CATEGORIES = ['PROTEIN', 'SUPPLEMENTS', 'SNACKS', 'DRINKS', 'EQUIPMENT', 'OTHER']

function ProductForm({ product, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({
    defaultValues: product || { low_stock_alert: 5, quantity: 0 },
  })

  const mutation = useMutation({
    mutationFn: (data) => product
      ? api.patch(`/inventory/${product.id}/`, data)
      : api.post('/inventory/', data),
    onSuccess: () => { toast.success(product ? 'Product updated' : 'Product added'); onSuccess() },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save product')),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <label className="label">Product Name *</label>
        <input className="input" placeholder="e.g. Whey Protein 1kg" {...register('name', { required: 'Product name is required' })} />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <select className="input" {...register('category')}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Initial Quantity</label>
          <input className="input" type="number" min="0" onWheel={e => e.target.blur()} onKeyDown={noNeg} {...register('quantity', { min: { value: 0, message: 'Cannot be negative' } })} />
          {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Sell Price (PKR) *</label>
          <input className="input" type="number" min="0" placeholder="0" onWheel={e => e.target.blur()} onKeyDown={noNeg} {...register('sell_price', { required: 'Sell price is required', min: { value: 0, message: 'Cannot be negative' } })} />
          {errors.sell_price && <p className="text-red-500 text-xs mt-1">{errors.sell_price.message}</p>}
        </div>
        <div>
          <label className="label">Cost Price (PKR)</label>
          <input className="input" type="number" min="0" placeholder="0" onWheel={e => e.target.blur()} onKeyDown={noNeg} {...register('cost_price', { min: { value: 0, message: 'Cannot be negative' } })} />
          {errors.cost_price && <p className="text-red-500 text-xs mt-1">{errors.cost_price.message}</p>}
        </div>
      </div>
      <div>
        <label className="label">Low Stock Alert <span className="text-gray-400 text-xs">(warn when quantity falls below)</span></label>
        <input className="input" type="number" min="0" onWheel={e => e.target.blur()} onKeyDown={noNeg} {...register('low_stock_alert', { min: { value: 0, message: 'Cannot be negative' } })} />
        {errors.low_stock_alert && <p className="text-red-500 text-xs mt-1">{errors.low_stock_alert.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Add Product'}
      </button>
    </form>
  )
}

function StockModal({ product, action, onSuccess }) {
  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm({ defaultValues: { quantity: 1 } })
  const cost = Number(product.cost_price) || 0
  const restockCost = action === 'RESTOCK' && cost > 0 ? cost * (Number(watch('quantity')) || 0) : 0

  const mutation = useMutation({
    mutationFn: (data) => api.post(`/inventory/${product.id}/adjust/`, { ...data, action }),
    onSuccess: () => { toast.success(action === 'SELL' ? 'Sale recorded' : 'Stock updated'); onSuccess() },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update stock')),
  })

  const labels = { SELL: 'Sell', RESTOCK: 'Restock', ADJUSTMENT: 'Set Quantity' }

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <p className="text-gray-300 text-sm">Product: <span className="text-white font-medium">{product.name}</span></p>
      <p className="text-gray-300 text-sm">Current Stock: <span className="text-white font-medium">{product.quantity}</span></p>
      <div>
        <label className="label">{action === 'ADJUSTMENT' ? 'New Quantity' : 'Quantity'} *</label>
        <input className="input" type="number" min={action === 'ADJUSTMENT' ? '0' : '1'} onKeyDown={noNeg} {...register('quantity', { required: 'Quantity is required', min: { value: action === 'ADJUSTMENT' ? 0 : 1, message: action === 'ADJUSTMENT' ? 'Cannot be negative' : 'Must be at least 1' } })} />
        {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity.message}</p>}
        {action === 'SELL' && Number(product.quantity) === 0 && <p className="text-yellow-400 text-xs mt-1">This product is out of stock</p>}
        {restockCost > 0 && <p className="text-emerald-400 text-xs mt-1">An expense of PKR {restockCost.toLocaleString('en-PK')} will be recorded (cost {cost.toLocaleString('en-PK')} × qty)</p>}
        {action === 'RESTOCK' && cost === 0 && <p className="text-gray-500 text-xs mt-1">No cost price set — no expense will be recorded</p>}
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Saving...' : labels[action]}
      </button>
    </form>
  )
}

function SalesDrawer({ open, onClose }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => { const { data } = await api.get('/inventory/sales/'); return data },
    enabled: open,
  })

  const del = useMutation({
    mutationFn: (id) => api.delete(`/inventory/sales/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries(['sales'])
      queryClient.invalidateQueries(['inventory']) // stock is restored
      invalidateFinance(queryClient)               // sale removed from cashflow
      toast.success('Sale deleted · stock restored')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete sale')),
  })

  const sales = data || []
  const total = sales.reduce((s, x) => s + Number(x.amount), 0)

  // Group into months (sales already arrive newest-first, so order is preserved).
  const months = []
  const monthIdx = {}
  for (const s of sales) {
    const d = new Date(s.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!(key in monthIdx)) {
      monthIdx[key] = months.length
      months.push({ key, label: d.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' }), items: [], total: 0 })
    }
    const g = months[monthIdx[key]]
    g.items.push(s)
    g.total += Number(s.amount)
  }

  return createPortal(
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-md transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <div className={`fixed top-0 right-0 z-[70] h-full w-full max-w-md surface border-l border-gray-700 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-primary-400 flex items-center gap-2"><Receipt size={18} /> Sales</h2>
            <p className="text-xs text-gray-400 mt-0.5">{sales.length} sales · {fmt(total)}</p>
          </div>
          <div className="flex items-center gap-1">
            {sales.length > 0 && (
              <button
                onClick={() => exportToExcel(sales.map((s) => ({
                  Date: new Date(s.date).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                  Month: new Date(s.date).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' }),
                  Product: s.product,
                  Quantity: s.quantity,
                  'Unit Price (PKR)': s.unit_price,
                  'Amount (PKR)': s.amount,
                })), 'Sales')}
                title="Export to Excel"
                className="p-1.5 text-gray-400 hover:text-white hover:bg-primary-500 rounded-lg transition"
              >
                <Download size={18} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
          ) : months.length ? months.map((m) => (
            <div key={m.key} className="space-y-2">
              <div className="flex items-center justify-between sticky top-0 surface py-1.5 z-10">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-400">{m.label}</h3>
                <span className="text-xs font-semibold text-green-400">{fmt(m.total)}</span>
              </div>
              {m.items.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-primary-500/5 border border-primary-500/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-100 font-medium truncate">{s.product}</p>
                    <p className="text-xs text-gray-400">
                      {s.quantity} × {fmt(s.unit_price)} · {new Date(s.date).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="font-semibold text-green-400 shrink-0">{fmt(s.amount)}</span>
                  {s.deletable && (
                    <button
                      onClick={() => { if (confirm('Delete this sale? The stock will be restored.')) del.mutate(s.id) }}
                      title="Delete sale"
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-red-500 rounded-lg transition shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )) : (
            <p className="text-center text-gray-500 py-16">No sales recorded yet</p>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}

export default function Inventory() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [stockAction, setStockAction] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showSales, setShowSales] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', categoryFilter],
    queryFn: async () => {
      const params = categoryFilter ? { category: categoryFilter } : {}
      const { data } = await api.get('/inventory/', { params })
      return data?.results || data || []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/inventory/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries(['inventory']); toast.success('Product deleted') },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete product')),
  })

  const products = data || []
  const lowStockCount = products.filter(p => p.is_low_stock).length

  const refresh = () => {
    setShowAddModal(false)
    setEditProduct(null)
    setStockAction(null)
    queryClient.invalidateQueries(['inventory'])
    queryClient.invalidateQueries(['sales'])
    invalidateFinance(queryClient) // restock records an expense
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Inventory</h1>
          <p className="text-gray-400 text-sm mt-1">{products.length} products
            {lowStockCount > 0 && <span className="ml-2 text-yellow-400 font-medium">· {lowStockCount} low stock</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(products.map((p) => ({
              Name: p.name,
              Category: p.category,
              Quantity: p.quantity,
              'Sell Price (PKR)': p.sell_price,
              'Cost Price (PKR)': p.cost_price || 0,
              'Low Stock Alert': p.low_stock_alert,
              'Low Stock': p.is_low_stock ? 'Yes' : 'No',
            })), 'Inventory')}
            className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:bg-primary-500 hover:text-white hover:border-primary-500 transition"
            title="Export"
          >
            <Download size={18} />
          </button>
          <button
            onClick={() => setShowSales(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:bg-primary-500 hover:text-white hover:border-primary-500 transition"
          >
            <Receipt size={16} /> Sales
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      <div className="card p-4 flex gap-3">
        <select className="input w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div key={p.id} className={`card p-5 ${p.is_low_stock ? 'border-yellow-500/50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">{p.category.toLowerCase()}</span>
                  <h3 className="font-semibold text-gray-100 mt-0.5">{p.name}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditProduct(p); setShowAddModal(true) }} className="p-1.5 text-gray-400 hover:text-white hover:bg-primary-500 rounded-lg transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => { if (confirm('Delete product?')) deleteMutation.mutate(p.id) }} className="p-1.5 text-gray-400 hover:text-white hover:bg-red-500 rounded-lg transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between mt-2">
                <div>
                  <p className="text-xl font-bold text-primary-400">PKR {Number(p.sell_price).toLocaleString('en-PK')}</p>
                  {p.cost_price > 0 && <p className="text-xs text-gray-400">Cost: PKR {Number(p.cost_price).toLocaleString('en-PK')}</p>}
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${p.is_low_stock ? 'text-yellow-400' : 'text-gray-100'}`}>{p.quantity}</p>
                  <p className="text-xs text-gray-400">in stock</p>
                </div>
              </div>

              {p.is_low_stock && (
                <div className="mt-3 flex items-center gap-1.5 text-yellow-400 text-xs">
                  <AlertTriangle size={12} /> Low stock (alert at {p.low_stock_alert})
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button onClick={() => setStockAction({ product: p, action: 'SELL' })} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition">
                  <TrendingDown size={13} /> Sell
                </button>
                <button onClick={() => setStockAction({ product: p, action: 'RESTOCK' })} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition">
                  <TrendingUp size={13} /> Restock
                </button>
                <button onClick={() => setStockAction({ product: p, action: 'ADJUSTMENT' })} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-500/20 text-primary-400 hover:bg-primary-500 hover:text-white rounded-lg transition">
                  <SlidersHorizontal size={13} />
                </button>
              </div>
            </div>
          ))}

          {!products.length && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <Package size={32} className="mx-auto mb-2 opacity-30" />
              No products yet. Add your first product.
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setEditProduct(null) }} title={editProduct ? 'Edit Product' : 'Add Product'}>
        <ProductForm product={editProduct} onSuccess={refresh} />
      </Modal>

      <Modal isOpen={!!stockAction} onClose={() => setStockAction(null)} title={stockAction?.action === 'SELL' ? 'Record Sale' : stockAction?.action === 'RESTOCK' ? 'Restock Product' : 'Adjust Stock'}>
        {stockAction && <StockModal product={stockAction.product} action={stockAction.action} onSuccess={refresh} />}
      </Modal>

      <SalesDrawer open={showSales} onClose={() => setShowSales(false)} />
    </div>
  )
}
