import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Search, UserPlus, Download, ChevronUp, ChevronDown, Trash2, RotateCcw, Pencil, MoreVertical, Ban, Fingerprint } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import EnrollModal from '../../components/EnrollModal'
import MemberForm from './MemberForm'
import toast from 'react-hot-toast'
import { exportToExcel } from '../../utils/exportExcel'
import { apiErrorMessage } from '../../utils/apiError'
import { invalidateFinance } from '../../utils/invalidateFinance'
import { useWaCredits } from '../../utils/waCredits'
import { calcExpiryISO } from '../../utils/expiry'

function RestoreForm({ member, onSubmit, isPending }) {
  const { user } = useAuthStore()
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)
  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)
  const outOfCredits = !!useWaCredits(hasWhatsApp)?.exhausted
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      join_date: member.join_date || todayStr,
      status: 'EXPIRED',
      package: member.package || '',
      trainer: member.trainer || '',
    }
  })

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => { const { data } = await api.get('/packages/'); return data?.results || data || [] },
  })
  const { data: trainers = [] } = useQuery({
    queryKey: ['trainers-active'],
    queryFn: async () => { const { data } = await api.get('/trainers/', { params: { is_active: 'true' } }); return data?.results || data || [] },
  })

  const joinDate = watch('join_date')
  const status = watch('status')
  const selectedPkgId = watch('package')
  const selectedPkg = packages.find(p => String(p.id) === String(selectedPkgId))
  const pkgMonths = selectedPkg ? selectedPkg.duration_months : null
  const trainerAllowed = !!selectedPkg?.has_trainer
  const expiryISO = calcExpiryISO(joinDate, status, pkgMonths)
  const expiryDisplay = expiryISO ? new Date(expiryISO + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  // Trainer only on trainer packages; clear it otherwise.
  useEffect(() => {
    if (!trainerAllowed) setValue('trainer', '')
  }, [trainerAllowed, setValue])

  const onFormSubmit = (data) => {
    const pkg = packages.find(p => String(p.id) === String(data.package))
    const months = pkg ? pkg.duration_months : null
    onSubmit({
      join_date: data.join_date,
      package: data.package,
      trainer: data.trainer || '',
      expiry_date: calcExpiryISO(data.join_date, data.status, months),
      admission_fee: data.admission_fee || null,
      send_welcome: !!data.send_welcome,
      add_to_device: !!data.add_to_device,
    })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <p className="text-sm text-gray-400">Restoring <span className="text-gray-100 font-medium">{member.name}</span> — update their membership details:</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Joining Date *</label>
          <input
            type="date"
            className="input [color-scheme:dark]"
            max={todayStr}
            {...register('join_date', { required: 'Required' })}
          />
          {errors.join_date && <p className="text-red-500 text-xs mt-1">{errors.join_date.message}</p>}
          {expiryDisplay && <p className="text-xs text-gray-400 mt-1">Expires: {expiryDisplay}</p>}
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" {...register('status')}>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Package *</label>
          <select className="input" {...register('package', { required: 'Package is required' })}>
            <option value="">Select a package</option>
            {packages.map(p => (
              <option key={p.id} value={p.id}>{p.name} — PKR {Number(p.price).toLocaleString('en-PK')}</option>
            ))}
          </select>
          {errors.package && <p className="text-red-500 text-xs mt-1">{errors.package.message}</p>}
        </div>
        <div className="col-span-2">
          <label className="label">
            Trainer {trainerAllowed ? '*' : <span className="text-gray-400 text-xs">(select a trainer package)</span>}
          </label>
          <select
            className={`input ${!trainerAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!trainerAllowed}
            {...register('trainer', {
              validate: (v) => !trainerAllowed || !!v || 'This package includes a trainer — please select one',
            })}
          >
            <option value="">{trainerAllowed ? 'Select trainer' : 'No trainer'}</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.trainer && <p className="text-red-500 text-xs mt-1">{errors.trainer.message}</p>}
        </div>
        <div className="col-span-2">
          <label className="label">Admission Fee (PKR) <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            type="number"
            min="0"
            placeholder="0"
            onWheel={e => e.target.blur()}
            onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
            {...register('admission_fee', { min: { value: 0, message: 'Fee cannot be negative' } })}
          />
        </div>
        {hasWhatsApp && (
          <div className="col-span-2">
            <label className={`flex items-center gap-2 select-none ${outOfCredits ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox" disabled={outOfCredits}
                className="w-4 h-4 accent-green-500 disabled:opacity-40"
                {...register('send_welcome')}
              />
              <span className={`text-sm ${outOfCredits ? 'text-gray-600' : 'text-gray-300'}`}>
                {outOfCredits
                  ? 'Out of WhatsApp messages — top up to send a welcome'
                  : 'Send welcome-back message on WhatsApp'}
              </span>
            </label>
          </div>
        )}
        {hasAttendance && (
          <div className="col-span-2">
            <label className="flex items-center gap-2 select-none cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-green-500" {...register('add_to_device')} />
              <span className="text-sm text-gray-300 flex items-center gap-1.5">
                <Fingerprint size={14} className="text-primary-400" /> Add to device &amp; enroll fingerprint
              </span>
            </label>
          </div>
        )}
      </div>
      <button type="submit" disabled={isPending} className="btn-primary w-full justify-center">
        {isPending ? 'Restoring...' : 'Restore Member'}
      </button>
    </form>
  )
}

function SortIcon({ col, sort }) {
  if (sort.key !== col) return <ChevronUp size={13} className="text-gray-600" />
  return sort.dir === 'asc' ? <ChevronUp size={13} className="text-primary-400" /> : <ChevronDown size={13} className="text-primary-400" />
}

const fetchMembers = async (search, searchBy, status, gender, hasTrainer) => {
  const params = {}
  if (search) { params.search = search; params.search_by = searchBy }
  if (status) params.status = status
  if (gender) params.gender = gender
  if (hasTrainer) params.has_trainer = hasTrainer
  const { data } = await api.get('/members/', { params })
  return data
}

export default function Members() {
  const [search, setSearch] = useState('')
  const [searchBy, setSearchBy] = useState('name')
  const [statusFilter, setStatusFilter] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [trainerFilter, setTrainerFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const [editMember, setEditMember] = useState(null)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['members', search, searchBy, statusFilter, genderFilter, trainerFilter],
    queryFn: () => fetchMembers(search, searchBy, statusFilter, genderFilter, trainerFilter),
  })

  const { data: nextIdData } = useQuery({
    queryKey: ['member-next-id'],
    queryFn: async () => { const { data } = await api.get('/members/next-id/'); return data },
    staleTime: 0,
  })

  const { data: deletedData } = useQuery({
    queryKey: ['members-deleted'],
    queryFn: async () => { const { data } = await api.get('/members/deleted/'); return data },
    enabled: showDeleted,
  })
  const deletedMembers = deletedData || []

  const { data: blacklistData } = useQuery({
    queryKey: ['members-blacklisted'],
    queryFn: async () => { const { data } = await api.get('/members/blacklisted/'); return data },
    enabled: showBlacklist,
  })
  const blacklistedMembers = blacklistData || []
  const [blMenuId, setBlMenuId] = useState(null)

  // Close the kebab menu on outside click.
  useEffect(() => {
    if (!showMenu) return
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showMenu])

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/members/${id}/`),
    // Optimistic: drop the row from every cached members list right away and
    // slot it into the Deleted list, so the UI reacts instantly instead of
    // waiting on a server round-trip. Rolled back if the request fails.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['members'] })
      const prev = queryClient.getQueriesData({ queryKey: ['members'] })
      let removed = null
      for (const [, d] of prev) {
        const list = Array.isArray(d) ? d : d?.results
        const hit = list?.find((m) => m.id === id)
        if (hit) { removed = hit; break }
      }
      queryClient.setQueriesData({ queryKey: ['members'] }, (old) => {
        if (!old) return old
        if (Array.isArray(old)) return old.filter((m) => m.id !== id)
        if (Array.isArray(old.results)) return {
          ...old,
          results: old.results.filter((m) => m.id !== id),
          count: typeof old.count === 'number' ? Math.max(0, old.count - 1) : old.count,
        }
        return old
      })
      const prevDeleted = queryClient.getQueryData(['members-deleted'])
      if (removed && Array.isArray(prevDeleted)) {
        queryClient.setQueryData(['members-deleted'], [
          { ...removed, deleted_at: new Date().toISOString() },
          ...prevDeleted,
        ])
      }
      const prevBlacklist = queryClient.getQueryData(['members-blacklisted'])
      if (Array.isArray(prevBlacklist)) {
        queryClient.setQueryData(['members-blacklisted'], prevBlacklist.filter((m) => m.id !== id))
      }
      return { prev, prevDeleted, prevBlacklist }
    },
    onError: (err, id, ctx) => {
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (ctx && 'prevDeleted' in ctx) queryClient.setQueryData(['members-deleted'], ctx.prevDeleted)
      if (ctx && 'prevBlacklist' in ctx) queryClient.setQueryData(['members-blacklisted'], ctx.prevBlacklist)
      toast.error(apiErrorMessage(err, 'Failed to remove member'))
    },
    onSuccess: () => toast.success('Member removed'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['members-deleted'] })
      queryClient.invalidateQueries({ queryKey: ['members-blacklisted'] })
    },
  })

  const [deletedSearch, setDeletedSearch] = useState('')
  const [deletedSearchBy, setDeletedSearchBy] = useState('name')
  const [restoreMember, setRestoreMember] = useState(null)
  const [enrollAfterRestore, setEnrollAfterRestore] = useState(null)

  const restoreMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/members/${id}/restore/`, body),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['members-deleted'] })
      queryClient.invalidateQueries({ queryKey: ['members-blacklisted'] })
      queryClient.invalidateQueries({ queryKey: ['member-next-id'] })
      invalidateFinance(queryClient) // admission fee may create a payment
      const restored = restoreMember
      setRestoreMember(null)
      toast.success('Member restored')
      // Enroll the fingerprint right away if they asked for it on restore.
      if (variables?.add_to_device && restored) setEnrollAfterRestore(restored)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to restore member')),
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/members/${id}/hard-delete/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members-deleted'] })
      toast.success('Member permanently deleted')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete member')),
  })

  const rawMembers = data?.results || data || []
  const members = [...rawMembers].sort((a, b) => {
    if (!sort.key) return 0
    let av = a[sort.key] ?? ''
    let bv = b[sort.key] ?? ''
    if (sort.key === 'expiry_date') { av = av ? new Date(av) : 0; bv = bv ? new Date(bv) : 0 }
    else if (sort.key === 'member_id') { av = av ? parseInt(av, 10) : 0; bv = bv ? parseInt(bv, 10) : 0 }
    else { av = av.toString().toLowerCase(); bv = bv.toString().toLowerCase() }
    return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400">Members</h1>
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
            className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 transition"
            title="Export"
          >
            <Download size={18} />
          </button>
          <button onClick={() => { setEditMember(null); setShowModal(true) }} className="btn-primary">
            <UserPlus size={16} /> Add Member
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((s) => !s)}
              title="More"
              className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-500/30 hover:text-white hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/20 transition-all"
            >
              <MoreVertical size={18} />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 surface border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden">
                <button
                  onClick={() => { setShowMenu(false); setShowDeleted(true) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-primary-500/10 transition text-left"
                >
                  <Trash2 size={15} className="text-red-400" /> Deleted Members
                </button>
                <button
                  onClick={() => { setShowMenu(false); setShowBlacklist(true) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-primary-500/10 transition text-left border-t border-gray-700"
                >
                  <Ban size={15} className="text-amber-400" /> Blacklist
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 flex">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
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
            className="input rounded-l-none border-l border-gray-600 w-auto text-xs text-gray-300 pr-7"
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
        <select className="input w-auto" value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
          <option value="">All Members</option>
          <option value="true">With Trainer</option>
          <option value="false">Without Trainer</option>
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
              <Th>
                <button onClick={() => toggleSort('member_id')} className="no-fx flex items-center gap-1 hover:text-primary-400 transition">
                  ID <SortIcon col="member_id" sort={sort} />
                </button>
              </Th>
              <Th>
                <button onClick={() => toggleSort('name')} className="no-fx flex items-center gap-1 hover:text-primary-400 transition">
                  Name <SortIcon col="name" sort={sort} />
                </button>
              </Th>
              <Th>Phone</Th>
              <Th>Gender</Th>
              <Th>Package</Th>
              <Th>Trainer</Th>
              <Th>Status</Th>
              <Th>
                <button onClick={() => toggleSort('expiry_date')} className="no-fx flex items-center gap-1 hover:text-primary-400 transition">
                  Expiry <SortIcon col="expiry_date" sort={sort} />
                </button>
              </Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {members.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <span className="font-mono text-xs text-primary-300 bg-primary-500/15 px-1.5 py-0.5 rounded">
                      {m.member_id ? String(m.member_id).padStart(5, '0') : '—'}
                    </span>
                  </Td>
                  <Td className="font-medium">
                    <button onClick={() => navigate(`/members/${m.id}`)} className="no-fx hover:text-primary-400 transition text-left">
                      {m.name}
                    </button>
                  </Td>
                  <Td>{m.phone}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.gender === 'FEMALE' ? 'bg-pink-500/20 text-pink-400' : 'bg-primary-500/20 text-primary-400'}`}>
                      {m.gender === 'FEMALE' ? 'Female' : 'Male'}
                    </span>
                  </Td>
                  <Td>{m.package_name || <span className="text-gray-400">—</span>}</Td>
                  <Td>{m.trainer_name || <span className="text-gray-400">—</span>}</Td>
                  <Td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {m.status === 'ACTIVE' ? 'Active' : 'Expired'}
                    </span>
                  </Td>
                  <Td className={m.expiry_date ? '' : 'text-gray-400'}>
                    {m.expiry_date ? new Date(m.expiry_date).toLocaleDateString('en-PK') : '—'}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditMember(m); setShowModal(true) }}
                        title="Edit"
                        className="p-1.5 text-gray-400 hover:text-white rounded-lg transition"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Remove this member?')) deleteMutation.mutate(m.id)
                        }}
                        title="Remove"
                        className="p-1.5 text-gray-400 hover:text-white rounded-lg transition [--btn-fill:239_68_68] [--btn-edge:185_28_28]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {!members.length && (
                <Tr>
                  <Td colSpan={9} className="text-center py-16 text-gray-400">
                    <UserPlus size={32} className="mx-auto mb-2 opacity-30" />
                    No members found. Add your first member.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>

      <Modal isOpen={showDeleted} onClose={() => { setShowDeleted(false); setDeletedSearch('') }} title="Deleted Members">
        <div className="space-y-3">
          {/* Search */}
          <div className="flex">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
              <input
                className="input pl-8 rounded-r-none border-r-0 text-sm"
                placeholder={`Search by ${deletedSearchBy === 'father_name' ? "father's name" : deletedSearchBy === 'member_id' ? 'ID' : deletedSearchBy}...`}
                value={deletedSearch}
                onChange={(e) => setDeletedSearch(e.target.value)}
              />
            </div>
            <select
              value={deletedSearchBy}
              onChange={e => { setDeletedSearchBy(e.target.value); setDeletedSearch('') }}
              className="input rounded-l-none border-l border-gray-600 w-auto text-xs text-gray-300 pr-7"
            >
              <option value="name">Name</option>
              <option value="father_name">Father's Name</option>
              <option value="phone">Phone</option>
              <option value="member_id">ID</option>
            </select>
          </div>

          {/* List */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {(() => {
              const q = deletedSearch.toLowerCase()
              const filtered = deletedMembers.filter(m => {
                if (!q) return true
                if (deletedSearchBy === 'name') return m.name.toLowerCase().includes(q)
                if (deletedSearchBy === 'father_name') return (m.father_name || '').toLowerCase().includes(q)
                if (deletedSearchBy === 'phone') return m.phone.includes(q)
                if (deletedSearchBy === 'member_id') return (m.member_id || '').includes(q)
                return true
              })
              if (!filtered.length) return <p className="text-center text-gray-400 py-8">No deleted members found.</p>
              return filtered.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-primary-500/5 border border-primary-500/10 rounded-lg">
                  {m.member_id && (
                    <span className="font-mono text-xs text-primary-300 bg-primary-500/15 px-1.5 py-0.5 rounded shrink-0">{String(m.member_id).padStart(5, '0')}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => { setShowDeleted(false); navigate(`/members/${m.id}`) }}
                      className="no-fx font-medium text-gray-100 truncate hover:text-primary-400 transition text-left"
                    >
                      {m.name}
                    </button>
                    <p className="text-xs text-gray-400">
                      {m.phone} · {m.package_name || 'No package'}
                      {m.deleted_at && <span className="text-gray-500"> · Deleted {new Date(m.deleted_at).toLocaleDateString('en-PK')}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => setRestoreMember(m)}
                    className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 border border-green-500/30 hover:border-green-400 px-3 py-1.5 rounded-lg transition shrink-0"
                  >
                    <RotateCcw size={13} /> Restore
                  </button>
                  <button
                    onClick={() => { if (confirm(`Permanently delete ${m.name}? This cannot be undone.`)) hardDeleteMutation.mutate(m.id) }}
                    disabled={hardDeleteMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400 px-3 py-1.5 rounded-lg transition shrink-0"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              ))
            })()}
          </div>
        </div>
      </Modal>

      <Modal isOpen={showBlacklist} onClose={() => { setShowBlacklist(false); setBlMenuId(null) }} title="Blacklisted Members">
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {!blacklistedMembers.length ? (
            <p className="text-center text-gray-400 py-8">No blacklisted members.</p>
          ) : (
            blacklistedMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-primary-500/5 border border-primary-500/10 rounded-lg">
                {m.member_id && (
                  <span className="font-mono text-xs text-primary-300 bg-primary-500/15 px-1.5 py-0.5 rounded shrink-0">{String(m.member_id).padStart(5, '0')}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowBlacklist(false); navigate(`/members/${m.id}`) }} className="no-fx font-medium text-gray-100 truncate hover:text-primary-400 transition">
                      {m.name}
                    </button>
                    {!m.blacklist_active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">Ban expired</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {m.blacklist_reason || 'No reason'}
                    {' · '}
                    {m.blacklist_until
                      ? `Until ${new Date(m.blacklist_until).toLocaleDateString('en-PK')}`
                      : 'Indefinite'}
                  </p>
                </div>
                {blMenuId === m.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { setBlMenuId(null); setRestoreMember(m) }}
                      className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 border border-green-500/30 hover:border-green-400 px-3 py-1.5 rounded-lg transition"
                    >
                      <RotateCcw size={13} /> Restore
                    </button>
                    <button
                      onClick={() => { setBlMenuId(null); if (confirm(`Move ${m.name} to Deleted Members?`)) deleteMutation.mutate(m.id) }}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400 px-3 py-1.5 rounded-lg transition"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setBlMenuId(m.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-primary-500/20 transition shrink-0"
                  >
                    <MoreVertical size={16} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal isOpen={!!restoreMember} onClose={() => setRestoreMember(null)} title="Restore Member">
        {restoreMember && (
          <RestoreForm
            member={restoreMember}
            isPending={restoreMutation.isPending}
            onSubmit={(body) => restoreMutation.mutate({ id: restoreMember.id, ...body })}
          />
        )}
      </Modal>

      {enrollAfterRestore && (
        <EnrollModal
          member={enrollAfterRestore}
          isOpen
          autoStart
          onClose={() => setEnrollAfterRestore(null)}
        />
      )}

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
            queryClient.invalidateQueries({ queryKey: ['members'] })
            queryClient.invalidateQueries({ queryKey: ['member-next-id'] })
            invalidateFinance(queryClient) // admission fee may create a payment
          }}
        />
      </Modal>
    </div>
  )
}
