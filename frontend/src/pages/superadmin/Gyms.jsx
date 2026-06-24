import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Building2, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

function GymForm({ onSuccess }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()
  const mutation = useMutation({
    mutationFn: (data) => api.post('/gyms/', data),
    onSuccess: () => { toast.success('Gym created with admin account'); onSuccess() },
    onError: (err) => toast.error(err.response?.data?.admin_email?.[0] || err.response?.data?.detail || 'Error'),
  })
  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">This will create a new gym and an admin account for it.</p>
      <div>
        <label className="label">Gym Name *</label>
        <input className="input" placeholder="e.g. Fitness Hub" {...register('name', { required: true })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Phone</label>
          <input className="input" {...register('phone')} />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" {...register('address')} />
        </div>
      </div>
      <div className="border-t pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Gym Admin Account</p>
        <div className="space-y-3">
          <div>
            <label className="label">Admin Name *</label>
            <input className="input" {...register('admin_name', { required: true })} />
          </div>
          <div>
            <label className="label">Admin Email *</label>
            <input className="input" type="email" {...register('admin_email', { required: true })} />
          </div>
          <div>
            <label className="label">Admin Password *</label>
            <input className="input" type="password" {...register('admin_password', { required: true, minLength: 6 })} />
          </div>
        </div>
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
        {isSubmitting ? 'Creating...' : 'Create Gym + Admin'}
      </button>
    </form>
  )
}

export default function Gyms() {
  const [showModal, setShowModal] = useState(false)
  const queryClient = useQueryClient()

  const { data: gyms = [], isLoading } = useQuery({
    queryKey: ['gyms'],
    queryFn: async () => { const { data } = await api.get('/gyms/'); return data },
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.post(`/gyms/${id}/toggle/`),
    onSuccess: () => { queryClient.invalidateQueries(['gyms']); toast.success('Status updated') },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Gyms</h1>
          <p className="text-gray-500 text-sm mt-1">{gyms.length} gyms registered</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> Add Gym
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <Table>
            <Thead>
              <Th>Gym Name</Th>
              <Th>Phone</Th>
              <Th>Members</Th>
              <Th>Staff</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {gyms.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                        <Building2 size={16} className="text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium">{g.name}</p>
                        {g.address && <p className="text-xs text-gray-400">{g.address}</p>}
                      </div>
                    </div>
                  </Td>
                  <Td>{g.phone || '—'}</Td>
                  <Td>{g.member_count}</Td>
                  <Td>{g.user_count}</Td>
                  <Td>
                    <span className={g.is_active ? 'badge-active' : 'badge-expired'}>
                      {g.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td className="text-gray-400">{new Date(g.created_at).toLocaleDateString('en-PK')}</Td>
                  <Td>
                    <button
                      onClick={() => toggleMutation.mutate(g.id)}
                      className={`flex items-center gap-1 text-xs font-medium transition ${g.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}
                    >
                      {g.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      {g.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </Td>
                </Tr>
              ))}
              {!gyms.length && (
                <Tr><Td colSpan={7} className="text-center py-16 text-gray-400">No gyms yet. Create your first gym.</Td></Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New Gym">
        <GymForm onSuccess={() => { setShowModal(false); queryClient.invalidateQueries(['gyms']) }} />
      </Modal>
    </div>
  )
}
