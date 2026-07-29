import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Search, UserCog, Trash2, Download, Pencil } from 'lucide-react'
import api from '../../api/axios'
import { exportToExcel } from '../../utils/exportExcel'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePageState } from '../../utils/pagination'
import TrainerForm from './TrainerForm'
import toast from 'react-hot-toast'

const fmt = (n) => `PKR ${Number(n).toLocaleString('en-PK')}`
const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-PK') : '—')

function SalaryBadge({ status }) {
  if (!status) return <span className="text-gray-500">—</span>
  const map = {
    PAID: 'bg-green-500/20 text-green-400',
    PARTIAL: 'bg-yellow-500/20 text-yellow-400',
    PENDING: 'bg-red-500/20 text-red-400',
  }
  const label = { PAID: 'Paid', PARTIAL: 'Partial', PENDING: 'Pending' }[status.status] || status.status
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status.status] || 'bg-gray-700 text-gray-300'}`}>
      {label}{status.status !== 'PAID' && status.pending > 0 ? ` · ${fmt(status.pending)}` : ''}
    </span>
  )
}

export default function Trainers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTrainer, setEditTrainer] = useState(null)

  const { data: trainers = [], isLoading } = useQuery({
    queryKey: ['trainers', search],
    queryFn: async () => {
      const { data } = await api.get('/trainers/', { params: search ? { search } : {} })
      return data?.results || data || []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/trainers/${id}/`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trainers'] }); toast.success('Trainer removed') },
    onError: () => toast.error('Failed to remove trainer'),
  })

  const { page, setPage, pageSize, setPageSize, slice } = usePageState(trainers.length, search)
  const pageTrainers = slice(trainers)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Trainers</h1>
          <p className="text-gray-500 text-sm mt-1">{trainers.length} trainers</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(trainers.map((t) => ({
              Name: t.name,
              Phone: t.phone || '',
              CNIC: t.cnic || '',
              'Joining Date': t.join_date ? new Date(t.join_date).toLocaleDateString('en-PK') : '',
              'Monthly Salary': t.monthly_salary || 0,
              'Salary Status': t.salary_status?.status || '',
            })), 'Trainers')}
            className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 transition"
            title="Export"
          >
            <Download size={18} />
          </button>
          <button onClick={() => { setEditTrainer(null); setShowModal(true) }} className="btn-primary">
            <UserPlus size={16} /> Add Trainer
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
          <input className="input pl-9" placeholder="Search trainer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <>
          {trainers.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={trainers.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Members</Th>
              <Th>Monthly Salary</Th>
              <Th>This Month</Th>
              <Th>Salary Due</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {pageTrainers.map((t) => (
                <Tr key={t.id}>
                  <Td className="font-medium">
                    <button onClick={() => navigate(`/trainers/${t.id}`)} className="no-fx hover:text-primary-400 transition text-left">
                      {t.name}
                    </button>
                  </Td>
                  <Td>{t.phone || <span className="text-gray-500">—</span>}</Td>
                  <Td>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary-500/20 text-primary-400">
                      {t.members_count}
                    </span>
                  </Td>
                  <Td>{Number(t.monthly_salary) > 0 ? fmt(t.monthly_salary) : <span className="text-gray-500">—</span>}</Td>
                  <Td><SalaryBadge status={t.salary_status} /></Td>
                  <Td>
                    {t.salary_status ? (
                      t.salary_status.status === 'PAID' ? (
                        <span className="text-gray-300 text-sm">{fmtDate(t.salary_status.next_due)}</span>
                      ) : (
                        <span className={`text-sm ${t.salary_status.is_overdue ? 'text-red-400 font-medium' : 'text-gray-300'}`}>
                          {fmtDate(t.salary_status.due_date)}{t.salary_status.is_overdue ? ' · overdue' : ''}
                        </span>
                      )
                    ) : <span className="text-gray-500">—</span>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditTrainer(t); setShowModal(true) }}
                        title="Edit"
                        className="p-1.5 text-gray-400 hover:text-white rounded-lg transition"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm('Remove this trainer? Members assigned to them will be unassigned.')) deleteMutation.mutate(t.id) }}
                        title="Remove"
                        className="p-1.5 text-gray-400 hover:text-white rounded-lg transition [--btn-fill:239_68_68] [--btn-edge:185_28_28]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {!trainers.length && (
                <Tr>
                  <Td colSpan={7} className="text-center py-16 text-gray-400">
                    <UserCog size={32} className="mx-auto mb-2 opacity-30" />
                    No trainers yet. Add your first trainer.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
          </>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editTrainer ? 'Edit Trainer' : 'Add Trainer'}>
        <TrainerForm
          trainer={editTrainer}
          onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['trainers'] }) }}
        />
      </Modal>
    </div>
  )
}
