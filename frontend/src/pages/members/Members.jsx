import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, UserPlus, FileDown, ChevronUp, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import MemberForm from './MemberForm'
import toast from 'react-hot-toast'
import { exportToExcel } from '../../utils/exportExcel'

const fetchMembers = async (search, searchBy, status, gender) => {
  const params = {}
  if (search) { params.search = search; params.search_by = searchBy }
  if (status) params.status = status
  if (gender) params.gender = gender
  const { data } = await api.get('/members/', { params })
  return data
}

export default function Members() {
  const [search, setSearch] = useState('')
  const [searchBy, setSearchBy] = useState('name')
  const [statusFilter, setStatusFilter] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <ChevronUp size={13} className="text-gray-600" />
    return sort.dir === 'asc' ? <ChevronUp size={13} className="text-blue-400" /> : <ChevronDown size={13} className="text-blue-400" />
  }
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['members', search, searchBy, statusFilter, genderFilter],
    queryFn: () => fetchMembers(search, searchBy, statusFilter, genderFilter),
  })

  const { data: nextIdData } = useQuery({
    queryKey: ['member-next-id'],
    queryFn: async () => { const { data } = await api.get('/members/next-id/'); return data },
    staleTime: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/members/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries(['members'])
      toast.success('Member removed')
    },
  })

  const rawMembers = data?.results || data || []
  const members = [...rawMembers].sort((a, b) => {
    if (!sort.key) return 0
    let av = a[sort.key] ?? ''
    let bv = b[sort.key] ?? ''
    if (sort.key === 'expiry_date') { av = av ? new Date(av) : 0; bv = bv ? new Date(bv) : 0 }
    else { av = av.toString().toLowerCase(); bv = bv.toString().toLowerCase() }
    return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-400">Members</h1>
          <p className="text-gray-500 text-sm mt-1">{members.length} total members</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(members.map((m) => ({
              Name: m.name,
              Phone: m.phone,
              Gender: m.gender === 'FEMALE' ? 'Female' : 'Male',
              'Father Name': m.father_name || '',
              Package: m.package_name || '',
              Status: m.status,
              'Join Date': m.join_date || '',
              'Expiry Date': m.expiry_date || '',
              Address: m.address || '',
              Notes: m.notes || '',
            })), 'Members')}
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown size={16} /> Export
          </button>
          <button onClick={() => { setEditMember(null); setShowModal(true) }} className="btn-primary">
            <UserPlus size={16} /> Add Member
          </button>
        </div>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 flex">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9 pr-3 rounded-r-none border-r-0"
              placeholder={`Search by ${searchBy === 'father_name' ? "father's name" : searchBy === 'member_id' ? 'ID' : searchBy}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={searchBy}
            onChange={e => { setSearchBy(e.target.value); setSearch('') }}
            className="input rounded-l-none border-l border-gray-600 w-auto text-xs text-gray-300 bg-gray-700 pr-7"
          >
            <option value="name">Name</option>
            <option value="father_name">Father's Name</option>
            <option value="phone">Phone</option>
            <option value="member_id">ID</option>
          </select>
        </div>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <select className="input w-auto" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
          <option value="">All Gender</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
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
              <Th>ID</Th>
              <Th>
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-blue-400 transition">
                  Name <SortIcon col="name" />
                </button>
              </Th>
              <Th>Phone</Th>
              <Th>Gender</Th>
              <Th>Package</Th>
              <Th>Status</Th>
              <Th>
                <button onClick={() => toggleSort('expiry_date')} className="flex items-center gap-1 hover:text-blue-400 transition">
                  Expiry <SortIcon col="expiry_date" />
                </button>
              </Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {members.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <span className="font-mono text-xs text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded">
                      {m.member_id || '—'}
                    </span>
                  </Td>
                  <Td className="font-medium">
                    <button onClick={() => navigate(`/members/${m.id}`)} className="hover:text-primary-400 transition text-left">
                      {m.name}
                    </button>
                  </Td>
                  <Td>{m.phone}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.gender === 'FEMALE' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {m.gender === 'FEMALE' ? 'Female' : 'Male'}
                    </span>
                  </Td>
                  <Td>{m.package_name || <span className="text-gray-400">—</span>}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {m.status === 'ACTIVE' ? 'Active' : 'Expired'}
                    </span>
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
                  <Td colSpan={8} className="text-center py-16 text-gray-400">
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
          key={editMember ? `edit-${editMember.id}` : `add-${nextIdData?.next_id}`}
          member={editMember}
          defaultMemberId={!editMember ? nextIdData?.next_id : undefined}
          onSuccess={() => {
            setShowModal(false)
            queryClient.invalidateQueries(['members'])
            queryClient.invalidateQueries(['member-next-id'])
          }}
        />
      </Modal>
    </div>
  )
}
