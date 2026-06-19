import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Package as PackageIcon, Pencil, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

const fetchPackages = async () => {
  const { data } = await api.get('/packages/')
  return data?.results || data || []
}

function PackageForm({ pkg, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: pkg
      ? { ...pkg, features: pkg.features?.join(', ') }
      : { duration_days: 30 },
  })

  const mutation = useMutation({
    mutationFn: (payload) => {
      const body = { ...payload, features: payload.features ? payload.features.split(',').map(f => f.trim()).filter(Boolean) : [] }
      return pkg ? api.patch(`/packages/${pkg.id}/`, body) : api.post('/packages/', body)
    },
    onSuccess: () => { toast.success(pkg ? 'Package updated' : 'Package created'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <label className="label">Package Name *</label>
        <input className="input" placeholder="e.g. Basic, Premium, VIP" {...register('name', { required: true })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Price (PKR) *</label>
          <input className="input" type="number" placeholder="2500" {...register('price', { required: true })} />
        </div>
        <div>
          <label className="label">Duration (Days) *</label>
          <input className="input" type="number" placeholder="30" {...register('duration_days', { required: true })} />
        </div>
      </div>
      <div>
        <label className="label">Features (comma separated)</label>
        <input className="input" placeholder="Gym access, Locker, WiFi" {...register('features')} />
      </div>
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
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packages</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your gym membership packages</p>
        </div>
        <button onClick={() => { setEditPkg(null); setShowModal(true) }} className="btn-primary">
          <Plus size={16} /> New Package
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <div key={pkg.id} className={`card p-5 ${!pkg.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-primary-50 rounded-lg">
                  <PackageIcon size={20} className="text-primary-600" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditPkg(pkg); setShowModal(true) }} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => { if (confirm('Delete package?')) deleteMutation.mutate(pkg.id) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
              <p className="text-2xl font-bold text-primary-600 mt-1">PKR {Number(pkg.price).toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-0.5">{pkg.duration_days} days</p>
              {pkg.features?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {pkg.features.map((f, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{f}</span>
                  ))}
                </div>
              )}
              {pkg.member_count > 0 && (
                <p className="text-xs text-gray-400 mt-3">{pkg.member_count} members enrolled</p>
              )}
            </div>
          ))}
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
