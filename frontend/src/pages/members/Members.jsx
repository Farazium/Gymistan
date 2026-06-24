import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import MemberForm from './MemberForm'
import toast from 'react-hot-toast'

const fetchMembers = async (search, status) => {
  const params = {}
  if (search) params.search = search
  if (status) params.status = status
  const { data } = await api.get('/members/', { params })
  return data
}

export default function Members() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['members', search, statusFilter],
    queryFn: () => fetchMembers(search, statusFilter),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/members/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries(['members'])
      toast.success('Member removed')
    },
  })

  const members = data?.results || data || []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Members</h1>
          <p className="text-gray-500 text-sm mt-1">{members.length} total members</p>
        </div>
        <button onClick={() => { setEditMember(null); setShowModal(true) }} className="btn-primary">
          <UserPlus size={16} /> Add Member
        </button>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Package</Th>
              <Th>Status</Th>
              <Th>Expiry</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {members.map((m) => (
                <Tr key={m.id}>
                  <Td className="font-medium">
                    <button onClick={() => navigate(`/members/${m.id}`)} className="hover:text-primary-400 transition text-left">
                      {m.name}
                    </button>
                  </Td>
                  <Td>{m.phone}</Td>
                  <Td>{m.package_name || <span className="text-gray-400">—</span>}</Td>
                  <Td>
                    <span className={`badge-${m.status.toLowerCase()}`}>{m.status}</span>
                  </Td>
                  <Td className={m.expiry_date ? '' : 'text-gray-400'}>
                    {m.expiry_date ? new Date(m.expiry_date).toLocaleDateString('en-PK') : '—'}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditMember(m); setShowModal(true) }}
                        className="text-primary-600 hover:underline text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Remove this member?')) deleteMutation.mutate(m.id)
                        }}
                        className="text-red-500 hover:underline text-xs font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {!members.length && (
                <Tr>
                  <Td colSpan={6} className="text-center py-16 text-gray-400">
                    <UserPlus size={32} className="mx-auto mb-2 opacity-30" />
                    No members found. Add your first member.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editMember ? 'Edit Member' : 'Add New Member'}
      >
        <MemberForm
          member={editMember}
          onSuccess={() => {
            setShowModal(false)
            queryClient.invalidateQueries(['members'])
          }}
        />
      </Modal>
    </div>
  )
}
