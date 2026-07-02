import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Package, Pencil, Trash2, AlertTriangle, TrendingDown, TrendingUp, SlidersHorizontal, FileDown } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

const CATEGORIES = ['PROTEIN', 'SUPPLEMENTS', 'SNACKS', 'DRINKS', 'EQUIPMENT', 'OTHER']

function ProductForm({ product, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: product || { low_stock_alert: 5, quantity: 0 },
  })

  const mutation = useMutation({
    mutationFn: (data) => product
      ? api.patch(`/inventory/${product.id}/`, data)
      : api.post('/inventory/', data),
    onSuccess: () => { toast.success(product ? 'Product updated' : 'Product added'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <label className="label">Product Name *</label>
        <input className="input" placeholder="e.g. Whey Protein 1kg" {...register('name', { required: true })} />
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
          <input className="input" type="number" min="0" {...register('quantity')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Sell Price (PKR) *</label>
          <input className="input" type="number" placeholder="0" {...register('sell_price', { required: true })} />
        </div>
        <div>
          <label className="label">Cost Price (PKR)</label>
          <input className="input" type="number" placeholder="0" {...register('cost_price')} />
        </div>
      </div>
      <div>
        <label className="label">Low Stock Alert <span className="text-gray-400 text-xs">(warn when quantity falls below)</span></label>
        <input className="input" type="number" min="0" {...register('low_stock_alert')} />
      </div>
      <div>
        <label className="label">Description <span className="text-gray-400 text-xs">(optional)</span></label>
        <textarea className="input h-16 resize-none" {...register('description')} />
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Add Product'}
      </button>
    </form>
  )
}

function StockModal({ product, action, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: { quantity: 1 } })

  const mutation = useMutation({
    mutationFn: (data) => api.post(`/inventory/${product.id}/adjust/`, { ...data, action }),
    onSuccess: () => { toast.success(action === 'SELL' ? 'Sale recorded' : 'Stock updated'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const labels = { SELL: 'Sell', RESTOCK: 'Restock', ADJUSTMENT: 'Set Quantity' }

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <p className="text-gray-300 text-sm">Product: <span className="text-white font-medium">{product.name}</span></p>
      <p className="text-gray-300 text-sm">Current Stock: <span className="text-white font-medium">{product.quantity}</span></p>
      <div>
        <label className="label">{action === 'ADJUSTMENT' ? 'New Quantity' : 'Quantity'} *</label>
        <input className="input" type="number" min="1" {...register('quantity', { required: true, min: 1 })} />
      </div>
      <div>
        <label className="label">Note <span className="text-gray-400 text-xs">(optional)</span></label>
        <input className="input" placeholder="e.g. sold to Ali" {...register('note')} />
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Saving...' : labels[action]}
      </button>
    </form>
  )
}

export default function Inventory() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [stockAction, setStockAction] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('')
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
  })

  const products = data || []
  const lowStockCount = products.filter(p => p.is_low_stock).length

  const refresh = () => {
    setShowAddModal(false)
    setEditProduct(null)
    setStockAction(null)
    queryClient.invalidateQueries(['inventory'])
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Inventory</h1>
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
              Description: p.description || '',
            })), 'Inventory')}
            className="p-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/30 hover:bg-blue-500/30 hover:border-blue-400/50 transition"
            title="Export"
          >
            <FileDown size={18} />
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
                  <button onClick={() => { setEditProduct(p); setShowAddModal(true) }} className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-gray-700 rounded-lg transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => { if (confirm('Delete product?')) deleteMutation.mutate(p.id) }} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between mt-2">
                <div>
                  <p className="text-xl font-bold text-primary-400">PKR {Number(p.sell_price).toLocaleString()}</p>
                  {p.cost_price > 0 && <p className="text-xs text-gray-400">Cost: PKR {Number(p.cost_price).toLocaleString()}</p>}
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
                <button onClick={() => setStockAction({ product: p, action: 'SELL' })} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition">
                  <TrendingDown size={13} /> Sell
                </button>
                <button onClick={() => setStockAction({ product: p, action: 'RESTOCK' })} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition">
                  <TrendingUp size={13} /> Restock
                </button>
                <button onClick={() => setStockAction({ product: p, action: 'ADJUSTMENT' })} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-lg transition">
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
    </div>
  )
}
