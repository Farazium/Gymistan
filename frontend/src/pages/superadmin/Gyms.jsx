import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Building2, XCircle, CheckCircle, Search, ArrowUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { apiErrorMessage } from '../../utils/apiError'

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

// The status tag reflects, in priority order: manually turned off, expired, else
// active. The right-side toggle separately controls access. Expiry rule matches
// members' compute_status: expiry ON or before today = expired (a future expiry,
// or no expiry set at all, = active).
const gymStatus = (g) => {
  if (!g.is_active) return { label: 'Inactive', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' }
  if (g.expiry_date && g.expiry_date <= todayISO())
    return { label: 'Expired', cls: 'bg-red-500/10 text-red-400 border-red-500/30' }
  return { label: 'Active', cls: 'bg-green-500/10 text-green-400 border-green-500/30' }
}

function GymForm({ onSuccess }) {
  const { register, handleSubmit, formState: { errors } } = useForm()
  const mutation = useMutation({
    mutationFn: (data) => {
      if (!data.expiry_date) delete data.expiry_date
      if (!data.trial_days) delete data.trial_days
      if (!data.subscription_amount) delete data.subscription_amount
      return api.post('/gyms/', data)
    },
    onSuccess: () => { toast.success('Gym created with admin account'); onSuccess() },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to create gym')),
  })
  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <p className="text-sm text-gray-400 bg-gray-700/50 rounded-lg p-3">This will create a new gym and an admin account for it.</p>
      <div>
        <label className="label">Gym Name *</label>
        <input className="input" placeholder="e.g. Fitness Hub" {...register('name', { required: true })} />
        {errors.name && <p className="text-red-500 text-xs mt-1">Required</p>}
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Trial Days</label>
          <input className="input" type="number" min="0" placeholder="30" onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }} {...register('trial_days', { min: { value: 0, message: 'Cannot be negative' } })} />
          <p className="text-xs text-gray-500 mt-1">Expiry = today + trial days</p>
          {errors.trial_days && <p className="text-red-500 text-xs mt-1">{errors.trial_days.message}</p>}
        </div>
        <div>
          <label className="label">Or set expiry date directly</label>
          <input className="input [color-scheme:dark]" type="date" min={todayISO()} {...register('expiry_date', { validate: v => !v || v >= todayISO() || 'Expiry cannot be in the past' })} />
          {errors.expiry_date && <p className="text-red-500 text-xs mt-1">{errors.expiry_date.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Subscription Amount (PKR)</label>
          <input className="input" type="text" inputMode="numeric" placeholder="e.g. 5000" {...register('subscription_amount', { pattern: { value: /^\d*\.?\d*$/, message: 'Numbers only' } })} />
          {errors.subscription_amount && <p className="text-red-500 text-xs mt-1">{errors.subscription_amount.message}</p>}
        </div>
        <div>
          <label className="label">Tier</label>
          <select className="input" {...register('tier')}>
            <option value="TIER1">Tier 1 — Starter</option>
            <option value="TIER2_WA">Tier 2.1 — Connect</option>
            <option value="TIER2_AT">Tier 2.2 — Track</option>
            <option value="TIER3">Tier 3 — Elite</option>
          </select>
        </div>
      </div>
      <div className="border-t border-gray-700 pt-4">
        <p className="text-sm font-medium text-gray-300 mb-3">Gym Admin Account</p>
        <div className="space-y-3">
          <div>
            <label className="label">Admin Name *</label>
            <input className="input" {...register('admin_name', { required: 'Admin name is required' })} />
            {errors.admin_name && <p className="text-red-500 text-xs mt-1">{errors.admin_name.message}</p>}
          </div>
          <div>
            <label className="label">Admin Email *</label>
            <input className="input" type="email" {...register('admin_email', { required: 'Admin email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })} />
            {errors.admin_email && <p className="text-red-500 text-xs mt-1">{errors.admin_email.message}</p>}
          </div>
          <div>
            <label className="label">Admin Password *</label>
            <input className="input" type="password" {...register('admin_password', { required: 'Password is required', minLength: { value: 6, message: 'Password must be at least 6 characters' } })} />
            {errors.admin_password && <p className="text-red-500 text-xs mt-1">{errors.admin_password.message}</p>}
          </div>
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
        {mutation.isPending ? 'Creating...' : 'Create Gym + Admin'}
      </button>
    </form>
  )
}

export default function Gyms() {
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: gyms = [], isLoading } = useQuery({
    queryKey: ['gyms'],
    queryFn: async () => { const { data } = await api.get('/gyms/'); return data },
  })

  const visibleGyms = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = gyms.filter((g) => g.name.toLowerCase().includes(q))
    return [...list].sort((a, b) => {
      if (sortBy === 'expiry') {
        const ax = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity
        const bx = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity
        return ax - bx  // soonest expiry first
      }
      return a.name.localeCompare(b.name)
    })
  }, [gyms, search, sortBy])

  const toggleMutation = useMutation({
    mutationFn: (id) => api.post(`/gyms/${id}/toggle/`),
    onSuccess: () => { queryClient.invalidateQueries(['gyms']); toast.success('Status updated') },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to update status')),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Gyms</h1>
          <p className="text-gray-500 text-sm mt-1">
            {search.trim() ? `${visibleGyms.length} of ${gyms.length} gyms` : `${gyms.length} gyms registered`}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> Add Gym
        </button>
      </div>

      {/* Toolbar: search by name + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Search gyms by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative sm:w-56">
          <ArrowUpDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <select className="input pl-9" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Sort by name (A–Z)</option>
            <option value="expiry">Sort by expiry (soonest first)</option>
          </select>
        </div>
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
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th>Expiry</Th>
              <Th>Tier</Th>
              <Th>Subscription</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {visibleGyms.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 size={17} className="text-primary-400" />
                      </div>
                      <div>
                        <button onClick={() => navigate(`/admin/gyms/${g.id}`)} className="font-medium text-gray-100 hover:text-primary-400 transition text-left">
                          {g.name}
                        </button>
                        {g.address && <p className="text-xs text-gray-400">{g.address}</p>}
                      </div>
                    </div>
                  </Td>
                  <Td>{g.phone || '—'}</Td>
                  <Td>{g.member_count}</Td>
                  <Td>
                    {(() => { const s = gymStatus(g); return (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${s.cls}`}>{s.label}</span>
                    ) })()}
                  </Td>
                  <Td className="text-gray-400">{g.joining_date ? new Date(g.joining_date).toLocaleDateString('en-PK') : '—'}</Td>
                  <Td>
                    {g.expiry_date ? (
                      <span className={`text-sm font-medium ${g.expiry_date <= todayISO() ? 'text-red-400' : 'text-gray-300'}`}>
                        {new Date(g.expiry_date).toLocaleDateString('en-PK')}
                      </span>
                    ) : <span className="text-gray-500">—</span>}
                  </Td>
                  <Td>
                    {g.tier === 'TIER1'    && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary-500/20 text-primary-300">Starter</span>}
                    {g.tier === 'TIER2_WA' && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/20 text-green-300">Connect</span>}
                    {g.tier === 'TIER2_AT' && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-500/20 text-purple-300">Track</span>}
                    {g.tier === 'TIER3'    && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/20 text-yellow-300">Elite</span>}
                    {!g.tier && <span className="text-gray-500">—</span>}
                  </Td>
                  <Td className="text-primary-400 font-medium">
                    {g.subscription_amount ? `PKR ${Number(g.subscription_amount).toLocaleString('en-PK')}` : <span className="text-gray-500">—</span>}
                  </Td>
                  <Td>
                    <button
                      onClick={() => toggleMutation.mutate(g.id)}
                      className={`flex items-center gap-1.5 text-xs font-medium transition ${g.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}
                    >
                      {g.is_active
                        ? <><XCircle size={15} /> Deactivate</>
                        : <><CheckCircle size={15} /> Activate</>
                      }
                    </button>
                  </Td>
                </Tr>
              ))}
              {!visibleGyms.length && (
                <Tr><Td colSpan={9} className="text-center py-16 text-gray-400">
                  <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                  {search.trim() ? `No gyms match "${search.trim()}".` : 'No gyms yet. Create your first gym.'}
                </Td></Tr>
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
