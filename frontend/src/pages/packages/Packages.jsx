import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Package as PackageIcon, Pencil, Trash2, FileDown, UserCog } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'

const fetchPackages = async () => {
  const { data } = await api.get('/packages/')
  return data?.results || data || []
}

function PackageForm({ pkg, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({
    defaultValues: pkg
      ? { ...pkg, duration_months: Math.round(pkg.duration_days / 30) || 1, features: pkg.features?.join(', ') }
      : { duration_months: 1 },
  })

  const mutation = useMutation({
    mutationFn: (payload) => {
      const body = {
        ...payload,
        duration_days: Number(payload.duration_months) * 30,
        features: payload.features ? payload.features.split(',').map(f => f.trim()).filter(Boolean) : [],
      }
      delete body.duration_months
      return pkg ? api.patch(`/packages/${pkg.id}/`, body) : api.post('/packages/', body)
    },
    onSuccess: () => { toast.success(pkg ? 'Package updated' : 'Package created'); onSuccess() },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save package')),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <label className="label">Package Name *</label>
        <input
          className="input"
          placeholder="e.g. Basic, Premium, VIP"
          {...register('name', { required: 'Package name is required' })}
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Price (PKR) *</label>
          <input
            className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            type="number"
            placeholder="2500"
            onWheel={e => e.target.blur()}
            onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
            {...register('price', { required: 'Price is required', min: { value: 1, message: 'Price must be greater than 0' } })}
          />
          {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
        </div>
        <div>
          <label className="label">Duration (Months) *</label>
          <select className="input" {...register('duration_months', { required: true })}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m}>{m} {m === 1 ? 'Month' : 'Months'}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Features (comma separated)</label>
        <input className="input" placeholder="Gym access, Locker, WiFi" {...register('features')} />
      </div>
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" className="w-4 h-4 accent-blue-500 rounded" {...register('has_trainer')} />
        <span className="text-sm text-gray-200">Includes a personal trainer</span>
        <span className="text-xs text-gray-500">— lets you assign a trainer to members on this package</span>
      </label>
      <div>
        <label className="label">Description</label>
        <textarea className="input h-20 resize-none" {...register('description')} />
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Saving...' : pkg ? 'Update Package' : 'Create Package'}
      </button>
    </form>
  )
}

export default function Packages() {
  const [showModal, setShowModal] = useState(false)
  const [editPkg, setEditPkg] = useState(null)
  const queryClient = useQueryClient()

  const { data: packages = [], isLoading } = useQuery({ queryKey: ['packages'], queryFn: fetchPackages })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/packages/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries(['packages']); toast.success('Package deleted') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to delete package'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Packages</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your gym membership packages</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(packages.map((p) => ({
              Name: p.name,
              'Price (PKR)': p.price,
              'Duration (Months)': Math.round(p.duration_days / 30),
              Features: p.features?.join(', ') || '',
              Description: p.description || '',
              'Members Enrolled': p.member_count || 0,
              Active: p.is_active ? 'Yes' : 'No',
            })), 'Packages')}
            className="p-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/30 hover:bg-blue-500/30 hover:border-blue-400/50 transition"
            title="Export"
          >
            <FileDown size={18} />
          </button>
          <button onClick={() => { setEditPkg(null); setShowModal(true) }} className="btn-primary">
            <Plus size={16} /> New Package
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg, idx) => {
            const palettes = [
              { border: 'border-blue-500/40', bar: 'bg-blue-500', icon: 'bg-blue-500/20 text-blue-400', price: 'text-blue-400', tag: 'bg-blue-500/15 text-blue-300 border border-blue-500/25' },
              { border: 'border-violet-500/40', bar: 'bg-violet-500', icon: 'bg-violet-500/20 text-violet-400', price: 'text-violet-400', tag: 'bg-violet-500/15 text-violet-300 border border-violet-500/25' },
              { border: 'border-emerald-500/40', bar: 'bg-emerald-500', icon: 'bg-emerald-500/20 text-emerald-400', price: 'text-emerald-400', tag: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' },
              { border: 'border-orange-500/40', bar: 'bg-orange-500', icon: 'bg-orange-500/20 text-orange-400', price: 'text-orange-400', tag: 'bg-orange-500/15 text-orange-300 border border-orange-500/25' },
              { border: 'border-pink-500/40', bar: 'bg-pink-500', icon: 'bg-pink-500/20 text-pink-400', price: 'text-pink-400', tag: 'bg-pink-500/15 text-pink-300 border border-pink-500/25' },
              { border: 'border-cyan-500/40', bar: 'bg-cyan-500', icon: 'bg-cyan-500/20 text-cyan-400', price: 'text-cyan-400', tag: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25' },
            ]
            const p = palettes[idx % palettes.length]
            const months = Math.round(pkg.duration_days / 30)
            return (
            <div key={pkg.id} className={`card p-0 overflow-hidden border ${p.border} ${!pkg.is_active ? 'opacity-50' : ''}`}>
              <div className={`h-1 w-full ${p.bar}`} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${p.icon}`}>
                    <PackageIcon size={20} />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditPkg(pkg); setShowModal(true) }} className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => { if (confirm('Delete package?')) deleteMutation.mutate(pkg.id) }} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-gray-100 text-base">{pkg.name}</h3>
                <p className={`text-2xl font-bold mt-1 ${p.price}`}>PKR {Number(pkg.price).toLocaleString()}</p>
                <p className="text-sm text-gray-400 mt-0.5">{months} {months === 1 ? 'Month' : 'Months'}</p>
                {pkg.has_trainer && (
                  <span className="inline-flex items-center gap-1 mt-2 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-300 border border-blue-500/25">
                    <UserCog size={11} /> Includes Trainer
                  </span>
                )}
                {pkg.features?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {pkg.features.map((f, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.tag}`}>{f}</span>
                    ))}
                  </div>
                )}
                {pkg.member_count > 0 && (
                  <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-700/60">{pkg.member_count} members enrolled</p>
                )}
              </div>
            </div>
          )})}

          {!packages.length && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <PackageIcon size={32} className="mx-auto mb-2 opacity-30" />
              No packages yet. Create your first package.
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editPkg ? 'Edit Package' : 'New Package'}>
        <PackageForm pkg={editPkg} onSuccess={() => { setShowModal(false); queryClient.invalidateQueries(['packages']) }} />
      </Modal>
    </div>
  )
}
