import { Check, Lock, MessageCircle, Fingerprint, Zap } from 'lucide-react'

const TIERS = [
  {
    id: 'TIER1',
    name: 'Basic',
    label: 'Tier 1',
    icon: Zap,
    color: 'blue',
    description: 'Everything you need to run a gym',
    features: [
      'Member management',
      'Packages & subscriptions',
      'Payment recording',
      'Expenses tracking',
      'Inventory management',
      'Dashboard & reports',
      'Export to Excel',
      'Gender & profile filters',
    ],
    locked: [],
  },
  {
    id: 'TIER2_WA',
    name: 'WhatsApp',
    label: 'Tier 2.1',
    icon: MessageCircle,
    color: 'green',
    description: 'Basic + digital payment slips via WhatsApp',
    features: [
      'Everything in Basic',
      'WhatsApp payment slips',
      'Digital receipt sharing',
      'Member notification on payment',
    ],
    locked: ['Attendance system'],
  },
  {
    id: 'TIER2_AT',
    name: 'Attendance',
    label: 'Tier 2.2',
    icon: Fingerprint,
    color: 'purple',
    description: 'Basic + member attendance tracking',
    features: [
      'Everything in Basic',
      'Member check-in / check-out',
      'Attendance reports',
      'Daily attendance log',
    ],
    locked: ['WhatsApp payment slips'],
  },
  {
    id: 'TIER3',
    name: 'Pro',
    label: 'Tier 3',
    icon: Zap,
    color: 'yellow',
    description: 'Full package — WhatsApp + Attendance',
    features: [
      'Everything in Basic',
      'WhatsApp payment slips',
      'Member check-in / check-out',
      'Attendance reports',
      'Daily attendance log',
      'Digital receipt sharing',
    ],
    locked: [],
    recommended: true,
  },
]

const colorMap = {
  blue:   { ring: 'ring-blue-500/40',   icon: 'bg-blue-500/20 text-blue-400',   badge: 'bg-blue-500/20 text-blue-300',   btn: 'bg-blue-600 hover:bg-blue-500' },
  green:  { ring: 'ring-green-500/40',  icon: 'bg-green-500/20 text-green-400', badge: 'bg-green-500/20 text-green-300', btn: 'bg-green-600 hover:bg-green-500' },
  purple: { ring: 'ring-purple-500/40', icon: 'bg-purple-500/20 text-purple-400', badge: 'bg-purple-500/20 text-purple-300', btn: 'bg-purple-600 hover:bg-purple-500' },
  yellow: { ring: 'ring-yellow-500/40', icon: 'bg-yellow-500/20 text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300', btn: 'bg-yellow-500 hover:bg-yellow-400 text-gray-900' },
}

export default function Tiers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-blue-400">Subscription Tiers</h1>
        <p className="text-gray-500 text-sm mt-1">Assign tiers to gyms from their profile page</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {TIERS.map((tier) => {
          const c = colorMap[tier.color]
          const Icon = tier.icon
          return (
            <div key={tier.id} className={`card p-5 flex flex-col ring-1 ${c.ring} ${tier.recommended ? 'relative' : ''}`}>
              {tier.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-yellow-500 text-gray-900 text-xs font-bold px-3 py-0.5 rounded-full">RECOMMENDED</span>
                </div>
              )}

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
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
                {tier.locked.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
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
    </div>
  )
}
