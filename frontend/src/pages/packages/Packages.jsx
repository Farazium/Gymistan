import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Package as PackageIcon, Pencil, Trash2, FileDown } from 'lucide-react'
import { exportToExcel } from '../../utils/exportExcel'
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
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown size={16} /> Export
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
          {packages.map((pkg) => (
            <div key={pkg.id} className={`card p-5 ${!pkg.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-gray-700 rounded-lg">
                  <PackageIcon size={20} className="text-primary-400" />
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
              <p className="text-sm text-gray-500 mt-0.5">{Math.round(pkg.duration_days / 30)} {Math.round(pkg.duration_days / 30) === 1 ? 'Month' : 'Months'}</p>
              {pkg.features?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {pkg.features.map((f, i) => (
                    <span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{f}</span>
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
