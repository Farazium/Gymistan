import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Lock, MessageCircle, Fingerprint, Zap, Pencil, Plus, X } from 'lucide-react'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

// Icon + accent colour stay in code, keyed by tier id — only the wording is
// stored/edited on the server (shared with the gym dashboard's plan modal).
const TIER_VISUAL = {
  TIER1:    { icon: Zap,           color: 'blue' },
  TIER2_WA: { icon: MessageCircle, color: 'green' },
  TIER2_AT: { icon: Fingerprint,   color: 'purple' },
  TIER3:    { icon: Zap,           color: 'yellow' },
}

const colorMap = {
  blue:   { ring: 'ring-primary-500/40', icon: 'bg-primary-500/20 text-primary-400', badge: 'bg-primary-500/20 text-primary-300' },
  green:  { ring: 'ring-green-500/40',   icon: 'bg-green-500/20 text-green-400',     badge: 'bg-green-500/20 text-green-300' },
  purple: { ring: 'ring-purple-500/40',  icon: 'bg-purple-500/20 text-purple-400',   badge: 'bg-purple-500/20 text-purple-300' },
  yellow: { ring: 'ring-yellow-500/40',  icon: 'bg-yellow-500/20 text-yellow-400',   badge: 'bg-yellow-500/20 text-yellow-300' },
}

// Editable list of short strings (features / locked items).
function ListEditor({ label, items, setItems, empty }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input flex-1"
              value={item}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="no-fx p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition"
              title="Remove"
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-gray-600 py-1">{empty}</p>}
        <button
          type="button"
          onClick={() => setItems([...items, ''])}
          className="no-fx inline-flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300 transition"
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  )
}

function EditTierModal({ tier, onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState(tier.name)
  const [label, setLabel] = useState(tier.label)
  const [description, setDescription] = useState(tier.description || '')
  const [features, setFeatures] = useState(tier.features || [])
  const [locked, setLocked] = useState(tier.locked || [])
  const [recommended, setRecommended] = useState(!!tier.recommended)

  const save = useMutation({
    mutationFn: () => api.patch(`/gyms/tiers/${tier.tier_id}/`, {
      name,
      label,
      description,
      recommended,
      features: features.map((f) => f.trim()).filter(Boolean),
      locked: locked.map((f) => f.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      toast.success('Tier updated')
      qc.invalidateQueries({ queryKey: ['tiers'] })
      onClose()
    },
    onError: () => toast.error('Failed to update tier'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Edit ${tier.label}`} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tier Label</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tier 1" />
          </div>
          <div>
            <label className="label">Plan Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Starter" />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One-line summary" />
        </div>
        <ListEditor label="Included features" items={features} setItems={setFeatures} empty="No features yet." />
        <ListEditor label="Locked (needs a higher tier)" items={locked} setItems={setLocked} empty="Nothing locked." />
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-primary-500" checked={recommended} onChange={(e) => setRecommended(e.target.checked)} />
          <span className="text-sm text-gray-300">Mark as recommended</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={save.isPending} className="btn-secondary">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saving…' : 'Save Tier'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Tiers() {
  const [editing, setEditing] = useState(null)
  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ['tiers'],
    queryFn: async () => (await api.get('/gyms/tiers/')).data,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400">Subscription Tiers</h1>
        <p className="text-gray-500 text-sm mt-1">Edit each plan's wording — changes show on every gym's plan card too. Assign tiers from a gym's profile.</p>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-gray-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {tiers.map((tier) => {
            const visual = TIER_VISUAL[tier.tier_id] || TIER_VISUAL.TIER1
            const c = colorMap[visual.color]
            const Icon = visual.icon
            return (
              <div key={tier.tier_id} className={`card p-5 flex flex-col ring-1 ${c.ring} relative`}>
                {tier.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-yellow-500 text-gray-900 text-xs font-bold px-3 py-0.5 rounded-full">RECOMMENDED</span>
                  </div>
                )}
                <button
                  onClick={() => setEditing(tier)}
                  className="no-fx absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-primary-400 hover:bg-primary-500/10 transition"
                  title="Edit tier"
                >
                  <Pencil size={14} />
                </button>

                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.icon}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{tier.label}</span>
                    <h3 className="text-gray-100 font-bold text-lg leading-tight">{tier.name}</h3>
                  </div>
                </div>

                <p className="text-gray-400 text-xs mb-4 leading-relaxed">{tier.description}</p>

                <ul className="space-y-2 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                  {tier.locked.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <Lock size={14} className="mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-500 text-center">Fee set per gym in Gym Profile</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <EditTierModal tier={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
